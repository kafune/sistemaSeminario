"""Ajudantes de consulta compartilhados pelos routers."""


def termo_like(busca: str | None) -> str:
    """Monta o padrão ``%termo%`` escapando os curingas digitados pelo usuário.

    Sem isso, buscar ``_`` casa com tudo e ``%`` vira coringa. Use sempre com
    ``.like(termo_like(x), escape="\\")``.
    """
    texto = (busca or "").strip()
    texto = texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{texto}%"
