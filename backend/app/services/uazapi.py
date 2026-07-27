import base64
import hashlib
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken

from ..config import settings


class UazApiError(Exception):
    def __init__(self, mensagem: str, status_code: int = 502):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.status_code = status_code


def _fernet() -> Fernet:
    chave = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest())
    return Fernet(chave)


def criptografar_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def descriptografar_token(token_criptografado: str) -> str:
    try:
        return _fernet().decrypt(token_criptografado.encode()).decode()
    except InvalidToken as exc:
        raise UazApiError(
            "Não foi possível ler a credencial da instância. "
            "Verifique se TOV_SECRET_KEY foi alterada.",
            500,
        ) from exc


def sanitizar_resposta(valor: Any) -> Any:
    """Remove credenciais mesmo quando a UazAPI as aninha na resposta."""
    if isinstance(valor, dict):
        return {
            chave: sanitizar_resposta(conteudo)
            for chave, conteudo in valor.items()
            if chave.lower() not in {"token", "admintoken", "admin_token"}
        }
    if isinstance(valor, list):
        return [sanitizar_resposta(item) for item in valor]
    return valor


class UazApiClient:
    def __init__(self, token_instancia: str | None = None):
        base_url = settings.uazapi_base_url.strip().rstrip("/")
        if not base_url:
            raise UazApiError("A URL da UazAPI não está configurada.", 503)
        if not base_url.startswith(("https://", "http://")):
            raise UazApiError("A URL configurada para a UazAPI é inválida.", 500)
        self.base_url = base_url
        self.token_instancia = token_instancia

    def _requisicao(
        self,
        metodo: str,
        caminho: str,
        *,
        json: dict | None = None,
        administrativo: bool = False,
    ) -> Any:
        if administrativo:
            token = settings.uazapi_admin_token.strip()
            if not token:
                raise UazApiError("O token administrativo da UazAPI não está configurado.", 503)
            headers = {"admintoken": token}
        else:
            if not self.token_instancia:
                raise UazApiError("A instância do WhatsApp ainda não foi configurada.", 503)
            headers = {"token": self.token_instancia}

        try:
            resposta = httpx.request(
                metodo,
                f"{self.base_url}{caminho}",
                headers=headers,
                json=json,
                timeout=httpx.Timeout(20.0, connect=10.0),
            )
        except httpx.TimeoutException as exc:
            raise UazApiError("A UazAPI demorou demais para responder. Tente novamente.") from exc
        except httpx.RequestError as exc:
            raise UazApiError(
                "Não foi possível acessar a UazAPI. O servidor pode ainda estar sendo preparado."
            ) from exc

        if resposta.is_error:
            mensagem = ""
            try:
                corpo = resposta.json()
                mensagem = (
                    corpo.get("message_ptbr")
                    or corpo.get("message")
                    or corpo.get("error")
                    or corpo.get("info")
                    or ""
                )
            except (ValueError, AttributeError):
                mensagem = resposta.text[:300]
            mensagens_padrao = {
                401: "Credencial da UazAPI inválida.",
                429: "A UazAPI atingiu o limite de requisições. Aguarde e tente novamente.",
                503: "A UazAPI está temporariamente sem capacidade. Tente novamente em instantes.",
            }
            detalhe = mensagem or mensagens_padrao.get(
                resposta.status_code, f"Erro {resposta.status_code} retornado pela UazAPI."
            )
            raise UazApiError(detalhe, 502)

        if not resposta.content:
            return {}
        try:
            return resposta.json()
        except ValueError as exc:
            raise UazApiError("A UazAPI retornou uma resposta inválida.") from exc

    def criar_instancia(self, nome: str) -> dict:
        return self._requisicao(
            "POST", "/instance/create", json={"name": nome}, administrativo=True
        )

    def status(self) -> dict:
        return self._requisicao("GET", "/instance/status")

    def conectar(self) -> dict:
        return self._requisicao("POST", "/instance/connect", json={})

    def desconectar(self) -> dict:
        return self._requisicao("POST", "/instance/disconnect", json={})

    def enviar_campanha_avancada(self, payload: dict) -> dict:
        return self._requisicao("POST", "/sender/advanced", json=payload)

    def listar_mensagens(self, pasta_id: str) -> list[dict]:
        mensagens: list[dict] = []
        offset = 0
        while True:
            resposta = self._requisicao(
                "POST",
                "/sender/listmessages",
                json={"folder_id": pasta_id, "limit": 1000, "offset": offset},
            )
            pagina = resposta.get("messages") or []
            mensagens.extend(pagina)
            total = (resposta.get("pagination") or {}).get("totalRecords", len(mensagens))
            if not pagina or len(mensagens) >= total:
                return mensagens
            offset += len(pagina)
