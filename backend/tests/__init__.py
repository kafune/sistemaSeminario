"""Testes automatizados do backend."""

# Estes testes chamam funções de router diretamente, sem passar pela resolução
# de dependências do FastAPI, então o argumento ``user`` precisa vir explícito.
# ``""`` é um login que nunca existe (``usuario_atual`` recusa ``sub`` vazio):
# a consulta ao usuário devolve ``None`` e o router trata como sem restrição de
# professor — sem nenhum desvio no código de produção (AUDITORIA.md F1).
SEM_LOGIN = ""
