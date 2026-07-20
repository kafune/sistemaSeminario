#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly DEPLOY_REMOTE="${TOV_DEPLOY_REMOTE:-origin}"
readonly DEPLOY_BRANCH="${TOV_DEPLOY_BRANCH:-main}"
readonly COMPOSE_FILE="${TOV_COMPOSE_FILE:-${APP_DIR}/docker-compose.yml}"
readonly ENV_FILE="${TOV_ENV_FILE:-${APP_DIR}/.env}"
readonly HTTP_PORT="${TOV_HTTP_PORT:-8084}"
readonly HEALTH_URL="${TOV_HEALTH_URL:-http://127.0.0.1:${HTTP_PORT}/api/health}"
readonly FRONTEND_URL="${TOV_FRONTEND_URL:-http://127.0.0.1:${HTTP_PORT}/}"
readonly HEALTH_RETRIES="${TOV_HEALTH_RETRIES:-30}"
readonly PULL_BASE="${TOV_PULL_BASE:-1}"
readonly PRUNE_IMAGES="${TOV_PRUNE_IMAGES:-1}"
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

# docker compose (plugin v2) com o projeto/arquivo/env desta aplicação.
compose() {
  docker compose --project-directory "$APP_DIR" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

usage() {
  cat <<'EOF'
Uso: ./redeploy.sh

Atualiza o checkout, reconstrói as imagens Docker, recria os containers
(db + backend + frontend), valida o health check e recarrega o nginx do host
que faz o proxy para o container do frontend.

Configuração por variáveis de ambiente:
  TOV_DEPLOY_REMOTE       Remote git (padrão: origin)
  TOV_DEPLOY_BRANCH       Branch de produção (padrão: main)
  TOV_COMPOSE_FILE        Arquivo compose (padrão: ./docker-compose.yml)
  TOV_ENV_FILE            Arquivo .env com os segredos (padrão: ./.env)
  TOV_HTTP_PORT           Porta publicada pelo frontend (padrão: 8084)
  TOV_HEALTH_URL          Health da API (padrão: http://127.0.0.1:PORT/api/health)
  TOV_FRONTEND_URL        Health do frontend (padrão: http://127.0.0.1:PORT/)
  TOV_HEALTH_RETRIES      Número de tentativas (padrão: 30)
  TOV_PULL_BASE           1 dá --pull nas imagens base do build (padrão: 1)
  TOV_PRUNE_IMAGES        1 remove imagens órfãs após o deploy (padrão: 1)
  TOV_RELOAD_NGINX        1 recarrega o nginx do host; 0 não (padrão: 1)
  TOV_NGINX_BIN           Executável do nginx do host (padrão: /usr/sbin/nginx)

Exemplo:
  TOV_HTTP_PORT=8084 ./redeploy.sh
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

[[ $# -eq 0 ]] || die "argumento desconhecido: $1 (use --help)"
[[ "$HEALTH_RETRIES" =~ ^[1-9][0-9]*$ ]] || die "TOV_HEALTH_RETRIES deve ser um inteiro positivo"
[[ "$HTTP_PORT" =~ ^[1-9][0-9]*$ ]] || die "TOV_HTTP_PORT deve ser um inteiro positivo"
[[ "$PULL_BASE" == "0" || "$PULL_BASE" == "1" ]] || die "TOV_PULL_BASE deve ser 0 ou 1"
[[ "$PRUNE_IMAGES" == "0" || "$PRUNE_IMAGES" == "1" ]] || die "TOV_PRUNE_IMAGES deve ser 0 ou 1"
[[ "$RELOAD_NGINX" == "0" || "$RELOAD_NGINX" == "1" ]] || die "TOV_RELOAD_NGINX deve ser 0 ou 1"
if [[ "$RELOAD_NGINX" == "1" ]]; then
  [[ -x "$NGINX_BIN" ]] || die "executável do nginx não encontrado: $NGINX_BIN"
fi

for command_name in git docker curl; do
  require_command "$command_name"
done
if (( EUID != 0 )) && [[ "$RELOAD_NGINX" == "1" ]]; then
  require_command sudo
fi
docker compose version >/dev/null 2>&1 || die "o plugin 'docker compose' (v2) não está disponível"

[[ -e "${APP_DIR}/.git" ]] || die "$APP_DIR não é um checkout git"
[[ -f "$COMPOSE_FILE" ]] || die "arquivo compose não encontrado: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "arquivo de segredos não encontrado: $ENV_FILE (defina TOV_DB_PASSWORD, TOV_SECRET_KEY, ...)"

log "Conferindo o checkout"
if [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
  git -C "$APP_DIR" status --short
  die "há alterações locais; resolva-as antes do redeploy"
fi

current_branch="$(git -C "$APP_DIR" branch --show-current)"
[[ "$current_branch" == "$DEPLOY_BRANCH" ]] || die "branch atual é '$current_branch'; esperado '$DEPLOY_BRANCH'"

printf 'Aplicação:      %s\n' "$APP_DIR"
printf 'Versão:         %s/%s\n' "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"
printf 'Compose:        %s\n' "$COMPOSE_FILE"
printf 'Frontend:       %s\n' "$FRONTEND_URL"
printf 'Health da API:  %s\n' "$HEALTH_URL"

log "Atualizando ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
git -C "$APP_DIR" fetch "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"
git -C "$APP_DIR" merge --ff-only FETCH_HEAD

log "Reconstruindo as imagens"
if [[ "$PULL_BASE" == "1" ]]; then
  compose build --pull backend frontend
else
  compose build backend frontend
fi

log "Recriando os containers"
compose up -d --remove-orphans

log "Validando o backend"
backend_ok=0
for ((attempt = 1; attempt <= HEALTH_RETRIES; attempt++)); do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    backend_ok=1
    break
  fi
  printf 'Tentativa %s/%s ainda sem resposta; aguardando...\n' "$attempt" "$HEALTH_RETRIES"
  sleep 2
done
if [[ "$backend_ok" != "1" ]]; then
  compose ps
  compose logs --tail 50 backend || true
  die "backend não respondeu em $HEALTH_URL"
fi

log "Validando o frontend"
curl --fail --silent --show-error --max-time 5 "$FRONTEND_URL" >/dev/null \
  || die "frontend não respondeu em $FRONTEND_URL"

if [[ "$PRUNE_IMAGES" == "1" ]]; then
  log "Removendo imagens órfãs"
  docker image prune -f >/dev/null
fi

if [[ "$RELOAD_NGINX" == "1" ]]; then
  log "Validando e recarregando o nginx do host"
  privileged "$NGINX_BIN" -t
  privileged systemctl reload nginx
fi

deployed_commit="$(git -C "$APP_DIR" rev-parse --short HEAD)"
log "Redeploy concluído no commit ${deployed_commit}"
compose ps
