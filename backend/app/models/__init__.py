from .academico import Materia, Turma, AluTurma, DocTurma, AluNota
from .pessoas import Aluno, Professor, MatProf, TitProf
from .auth import Usuario
from .integracoes import (
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
from .leads import (
    Lead,
    LeadConsentimentoEvento,
    LeadImportacao,
    LeadImportacaoItem,
    LeadInteracao,
)

__all__ = [
    "Materia", "Turma", "AluTurma", "DocTurma", "AluNota",
    "Aluno", "Professor", "MatProf", "TitProf",
    "Usuario", "ImportacaoGoogleForms", "ItemImportacaoGoogleForms",
    "ConviteProfessor",
    "Aula", "CalendarioPublico", "Chamada", "Presenca",
    "WhatsappConfiguracao", "WhatsappDisparo", "WhatsappDestinatario",
    "WhatsappArquivo", "WhatsappTemplate",
    "Notificacao", "NotificacaoPreferencia", "PushInscricao",
    "Lead", "LeadConsentimentoEvento", "LeadImportacao",
    "LeadImportacaoItem", "LeadInteracao",
]
