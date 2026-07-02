from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .security import usuario_atual
from .routers import (
    alunos,
    apoio,
    auth,
    grades,
    materias,
    notas,
    professores,
    relatorios,
    turmas,
)

app = FastAPI(
    title="STG Web",
    description="Sistema acadêmico do Seminário Teológico de Guarulhos",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Login é público; todo o resto exige token
app.include_router(auth.router)
protegido = [Depends(usuario_atual)]
app.include_router(alunos.router, dependencies=protegido)
app.include_router(professores.router, dependencies=protegido)
app.include_router(materias.router, dependencies=protegido)
app.include_router(turmas.router, dependencies=protegido)
app.include_router(grades.router, dependencies=protegido)
app.include_router(notas.router, dependencies=protegido)
app.include_router(apoio.router, dependencies=protegido)
app.include_router(relatorios.router, dependencies=protegido)


@app.get("/health")
def health():
    return {"status": "ok"}
