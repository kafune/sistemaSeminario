from .academico import Materia, Turma, AluTurma, DocTurma, AluNota
from .pessoas import Aluno, Professor, MatProf, TitProf
from .auth import Usuario
from .integracoes import (
    ConviteProfessor,
    ImportacaoGoogleForms,
    ItemImportacaoGoogleForms,
)
from .calendario import Aula, CalendarioPublico
from .whatsapp import WhatsappConfiguracao, WhatsappDestinatario, WhatsappDisparo

__all__ = [
    "Materia", "Turma", "AluTurma", "DocTurma", "AluNota",
    "Aluno", "Professor", "MatProf", "TitProf",
    "Usuario", "ImportacaoGoogleForms", "ItemImportacaoGoogleForms",
    "ConviteProfessor",
    "Aula", "CalendarioPublico",
    "WhatsappConfiguracao", "WhatsappDisparo", "WhatsappDestinatario",
]
