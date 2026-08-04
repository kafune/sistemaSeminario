from .academico import (
    AluNota,
    AluTurma,
    AtividadeAvaliativa,
    DocTurma,
    Materia,
    NotaAtividade,
    Turma,
)
from .pessoas import Aluno, Professor, MatProf, TitProf
from .auth import Usuario
from .integracoes import (
    ConviteAcessoProfessor,
    ConviteProfessor,
    ImportacaoGoogleForms,
    ItemImportacaoGoogleForms,
)
from .calendario import Aula, CalendarioPublico
from .presencas import Chamada, Presenca
from .whatsapp import (
    WhatsappArquivo,
    WhatsappConfiguracao,
    WhatsappDestinatario,
    WhatsappDisparo,
    WhatsappTemplate,
)
from .notificacoes import Notificacao, NotificacaoPreferencia, PushInscricao
from .materiais import MaterialDidatico
from .portal_professor import ComunicadoTurma, PlanejamentoAula
from .leads import (
    Lead,
    LeadConsentimentoEvento,
    LeadImportacao,
    LeadImportacaoItem,
    LeadInteracao,
)

__all__ = [
    "Materia", "Turma", "AluTurma", "DocTurma", "AluNota",
    "AtividadeAvaliativa", "NotaAtividade",
    "Aluno", "Professor", "MatProf", "TitProf",
    "Usuario", "ImportacaoGoogleForms", "ItemImportacaoGoogleForms",
    "ConviteProfessor", "ConviteAcessoProfessor",
    "Aula", "CalendarioPublico", "Chamada", "Presenca",
    "WhatsappConfiguracao", "WhatsappDisparo", "WhatsappDestinatario",
    "WhatsappArquivo", "WhatsappTemplate",
    "Notificacao", "NotificacaoPreferencia", "PushInscricao",
    "MaterialDidatico",
    "ComunicadoTurma", "PlanejamentoAula",
    "Lead", "LeadConsentimentoEvento", "LeadImportacao",
    "LeadImportacaoItem", "LeadInteracao",
]
