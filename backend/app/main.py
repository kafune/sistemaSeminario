import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, SessionLocal, engine
from .schema import atualizar_schema
from .security import exigir_perfis, usuario_atual
from .routers import (
    alunos,
    auth,
    dashboard,
    calendario,
    integracoes,
    importacoes,
    leads,
    materias,
    notas,
    professores,
    relatorios,
    turmas,
    usuarios,
    whatsapp,
    notificacoes,
)
from .services.notificacoes import entregar_lista, gerar_lembretes_aulas, limpar_notificacoes_antigas


async def _rotina_notificacoes() -> None:
    """Rotina simples para a única instância Uvicorn prevista no deploy."""
    while True:
        db = SessionLocal()
        try:
            limpar_notificacoes_antigas(db)
            lembretes = gerar_lembretes_aulas(db)
            if lembretes:
                entregar_lista(db, lembretes)
        except Exception:
            db.rollback()
        finally:
            db.close()
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Cria bancos novos e aplica ajustes aditivos em instalações existentes.
    Base.metadata.create_all(engine)
    atualizar_schema(engine)
    tarefa = asyncio.create_task(_rotina_notificacoes())
    try:
        yield
    finally:
        tarefa.cancel()
        try:
            await tarefa
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Centro TOV",
    description="Sistema acadêmico do Centro TOV de Formação Teológica",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Login e webhook do Forms são públicos; o restante exige token
app.include_router(auth.router)
app.include_router(integracoes.router)
app.include_router(calendario.public_router)
app.include_router(professores.public_router)
app.include_router(whatsapp.public_router)
protegido = [Depends(usuario_atual)]
academico = [
    Depends(usuario_atual),
    Depends(exigir_perfis("ADMIN", "SECRETARIA")),
]
administracao = [Depends(usuario_atual), Depends(exigir_perfis("ADMIN"))]
app.include_router(alunos.router, dependencies=academico)
app.include_router(calendario.router, dependencies=academico)
app.include_router(importacoes.router, dependencies=academico)
app.include_router(leads.router, dependencies=protegido)
app.include_router(professores.router, dependencies=academico)
app.include_router(materias.router, dependencies=academico)
app.include_router(turmas.router, dependencies=academico)
app.include_router(notas.router, dependencies=academico)
app.include_router(relatorios.router, dependencies=academico)
app.include_router(dashboard.router, dependencies=academico)
app.include_router(usuarios.router, dependencies=administracao)
app.include_router(whatsapp.router, dependencies=protegido)
app.include_router(notificacoes.router, dependencies=protegido)


@app.get("/health")
def health():
    return {"status": "ok"}
