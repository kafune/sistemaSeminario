"""Trilha de auditoria administrativa.

``registrar`` só adiciona a linha à sessão; quem chama decide o commit — assim
o registro nasce e morre na mesma transação da operação que ele descreve.
"""

from sqlalchemy.orm import Session

from ..models import RegistroAuditoria
from ..tempo import agora_utc


def registrar(
    db: Session,
    *,
    usuario,
    acao: str,
    entidade: str,
    entidade_id=None,
    detalhes: str | None = None,
) -> None:
    # Chamadas diretas (testes) passam o objeto ``Depends`` no lugar do nome.
    nome = usuario if isinstance(usuario, str) else None
    db.add(
        RegistroAuditoria(
            usuario=nome,
            acao=acao[:40],
            entidade=entidade[:40],
            entidade_id=str(entidade_id)[:40] if entidade_id is not None else None,
            detalhes=(detalhes or None) and detalhes[:2000],
            criado_em=agora_utc(),
        )
    )
