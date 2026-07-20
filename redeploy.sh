#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly DEPLOY_REMOTE="${TOV_DEPLOY_REMOTE:-origin}"
readonly DEPLOY_BRANCH="${TOV_DEPLOY_BRANCH:-main}"
readonly VENV_DIR="${TOV_VENV_DIR:-${APP_DIR}/backend/.venv}"
readonly FRONTEND_DIR_INPUT="${TOV_FRONTEND_DIR:-/var/www/tov}"
readonly API_URL="${TOV_VITE_API_URL:-/api}"
readonly BACKEND_SERVICE="${TOV_BACKEND_SERVICE-tov}"
readonly HEALTH_URL="${TOV_HEALTH_URL:-http://127.0.0.1:8000/health}"
readonly HEALTH_RETRIES="${TOV_HEALTH_RETRIES:-15}"
readonly RELOAD_NGINX="${TOV_RELOAD_NGINX:-1}"
readonly NGINX_BIN="${TOV_NGINX_BIN:-/usr/sbin/nginx}"

log() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$*"
}

die() {
  printf '\n\033[1;31mErro: %s\033[0m\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '\n\033[1;31mRedeploy interrompido na linha %s (código %s).\033[0m\n' "${BASH_LINENO[0]}" "$exit_code" >&2
  exit "$exit_code"
}
trap on_error ERR

privileged() {
  if (( EUID == 0 )); then
    "$@"
  else
    sudo "$@"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "comando obrigatório não encontrado: $1"
}

usage() {
  cat <<'EOF'
Uso: ./redeploy.sh

Atualiza o checkout, instala as dependências, reinicia o backend, valida o
health check, gera o frontend e publica o dist no diretório servido pelo nginx.

Configuração por variáveis de ambiente:
  TOV_DEPLOY_REMOTE       Remote git (padrão: origin)
  TOV_DEPLOY_BRANCH       Branch de produção (padrão: main)
  TOV_VENV_DIR            Virtualenv do backend (padrão: backend/.venv)
  TOV_BACKEND_SERVICE     Serviço systemd (padrão: tov; vazio pula o restart)
  TOV_FRONTEND_DIR        Diretório servido pelo nginx (padrão: /var/www/tov)
  TOV_VITE_API_URL        URL da API no build (padrão: /api)
  TOV_HEALTH_URL          Health check (padrão: http://127.0.0.1:8000/health)
  TOV_HEALTH_RETRIES      Número de tentativas (padrão: 15)
  TOV_RELOAD_NGINX        1 recarrega o nginx; 0 não recarrega (padrão: 1)
  TOV_NGINX_BIN           Executável do nginx (padrão: /usr/sbin/nginx)

Exemplo:
  TOV_BACKEND_SERVICE=tov-api \
  TOV_FRONTEND_DIR=/var/www/tov \
  TOV_VITE_API_URL=/api \
  ./redeploy.sh
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

[[ $# -eq 0 ]] || die "argumento desconhecido: $1 (use --help)"
[[ "$HEALTH_RETRIES" =~ ^[1-9][0-9]*$ ]] || die "TOV_HEALTH_RETRIES deve ser um inteiro positivo"
[[ "$RELOAD_NGINX" == "0" || "$RELOAD_NGINX" == "1" ]] || die "TOV_RELOAD_NGINX deve ser 0 ou 1"
[[ "$FRONTEND_DIR_INPUT" == /* ]] || die "TOV_FRONTEND_DIR deve ser um caminho absoluto"
if [[ "$RELOAD_NGINX" == "1" ]]; then
  [[ -x "$NGINX_BIN" ]] || die "executável do nginx não encontrado: $NGINX_BIN"
fi

for command_name in git python3 npm realpath rsync curl systemctl; do
  require_command "$command_name"
done
if (( EUID != 0 )); then
  require_command sudo
fi

FRONTEND_DIR="$(realpath -m -- "$FRONTEND_DIR_INPUT")"
readonly FRONTEND_DIR
case "$FRONTEND_DIR" in
  /|/var|/var/www|/usr|/etc|/home|/opt|/srv|"$APP_DIR"|"$APP_DIR"/*)
    die "TOV_FRONTEND_DIR aponta para um diretório amplo ou protegido: $FRONTEND_DIR"
    ;;
esac
if [[ -n "${HOME:-}" && "$FRONTEND_DIR" == "$HOME" ]]; then
  die "TOV_FRONTEND_DIR não pode apontar para o diretório pessoal"
fi

[[ -d "${APP_DIR}/.git" ]] || die "$APP_DIR não é um checkout git"
[[ -f "${APP_DIR}/backend/requirements.txt" ]] || die "backend/requirements.txt não encontrado"
[[ -f "${APP_DIR}/frontend/package-lock.json" ]] || die "frontend/package-lock.json não encontrado"

log "Conferindo o checkout"
if [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
  git -C "$APP_DIR" status --short
  die "há alterações locais; resolva-as antes do redeploy"
fi

current_branch="$(git -C "$APP_DIR" branch --show-current)"
[[ "$current_branch" == "$DEPLOY_BRANCH" ]] || die "branch atual é '$current_branch'; esperado '$DEPLOY_BRANCH'"

printf 'Aplicação:       %s\n' "$APP_DIR"
printf 'Versão:          %s/%s\n' "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"
printf 'Serviço backend: %s\n' "${BACKEND_SERVICE:-desativado}"
printf 'Frontend nginx:  %s\n' "$FRONTEND_DIR"
printf 'URL da API:      %s\n' "$API_URL"

log "Atualizando ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
git -C "$APP_DIR" fetch "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"
git -C "$APP_DIR" merge --ff-only FETCH_HEAD

log "Preparando o backend"
if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  python3 -m venv "$VENV_DIR"
fi
"${VENV_DIR}/bin/python" -m pip install --disable-pip-version-check -r "${APP_DIR}/backend/requirements.txt"
"${VENV_DIR}/bin/python" -m compileall -q "${APP_DIR}/backend/app"

log "Gerando o frontend"
npm --prefix "${APP_DIR}/frontend" ci
(
  cd "${APP_DIR}/frontend"
  VITE_API_URL="$API_URL" npm run build
)
[[ -f "${APP_DIR}/frontend/dist/index.html" ]] || die "o build não gerou frontend/dist/index.html"

if [[ -n "$BACKEND_SERVICE" ]]; then
  log "Reiniciando o backend (${BACKEND_SERVICE})"
  privileged systemctl restart "$BACKEND_SERVICE"

  log "Validando o backend"
  backend_ok=0
  for ((attempt = 1; attempt <= HEALTH_RETRIES; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
      backend_ok=1
      break
    fi
    printf 'Tentativa %s/%s ainda sem resposta; aguardando...\n' "$attempt" "$HEALTH_RETRIES"
    sleep 2
  done
  [[ "$backend_ok" == "1" ]] || die "backend não respondeu em $HEALTH_URL"
fi

log "Publicando o frontend"
privileged install -d -m 0755 "$FRONTEND_DIR"
privileged rsync -a --delete "${APP_DIR}/frontend/dist/" "${FRONTEND_DIR}/"

if [[ "$RELOAD_NGINX" == "1" ]]; then
  log "Validando e recarregando o nginx"
  privileged "$NGINX_BIN" -t
  privileged systemctl reload nginx
fi

deployed_commit="$(git -C "$APP_DIR" rev-parse --short HEAD)"
log "Redeploy concluído no commit ${deployed_commit}"
