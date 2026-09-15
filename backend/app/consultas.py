"""Ajudantes de consulta compartilhados pelos routers."""

import re
import unicodedata


def normalizar_nome(valor: str | None) -> str:
    """Sem acento, sem espaço duplo, em maiúsculas: chave de comparação de nomes."""
    sem_acento = unicodedata.normalize("NFKD", valor or "")
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sem_acento).strip().upper()


def termo_like(busca: str | None) -> str:
    """Monta o padrão ``%termo%`` escapando os curingas digitados pelo usuário.

    Sem isso, buscar ``_`` casa com tudo e ``%`` vira coringa. Use sempre com
    ``.like(termo_like(x), escape="\\")``.
    """
    texto = (busca or "").strip()
    texto = texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{texto}%"
