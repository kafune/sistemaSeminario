"""Uma única convenção de data e hora para todo o backend.

* Carimbos de **instante** (``criado_em``, ``registrado_em``, ``conciliada_em``…)
  são gravados em **UTC ingênuo** — ``agora_utc()``. O MySQL não guarda
  offset; o frontend acrescenta o ``Z`` ao exibir.
* Decisões de **dia** ("venceu?", "a chamada é de hoje?") usam a data do
  fuso da instituição — ``hoje_local()`` —, porque o vencimento de uma
  mensalidade é um dia do calendário brasileiro, não um instante em UTC.

Antes coexistiam três convenções (hora local do servidor, UTC e
America/Sao_Paulo), e ``datetime.now()`` só coincidia com UTC por acaso, no
Docker. Toda leitura de relógio deve passar por aqui.
"""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from .config import settings


def fuso_local() -> ZoneInfo:
    return ZoneInfo(settings.timezone)


def agora_utc() -> datetime:
    """Instante atual em UTC, sem tzinfo (formato gravado no banco)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def agora_local() -> datetime:
    """Instante atual no fuso da instituição, com tzinfo."""
    return datetime.now(fuso_local())


def hoje_local() -> date:
    """Data de hoje no fuso da instituição."""
    return agora_local().date()


def para_local(valor: datetime | None) -> datetime | None:
    """Converte um carimbo UTC ingênuo do banco para o fuso da instituição."""
    if valor is None:
        return None
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(fuso_local())
