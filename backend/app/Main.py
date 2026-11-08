"""
Main.py
Punto de entrada de la API de Parche.

Ejecutar en local (desde la carpeta backend, con el .venv activo):
    uvicorn app.Main:app --reload
Documentacion interactiva: http://127.0.0.1:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import Config
from app.BaseDatos import a_json, comprobar_conexion, db
from app.routers import Admin, Auth, Canchas, Partidos, Propietario, Reservas


@asynccontextmanager
async def ciclo_de_vida(app):
    comprobar_conexion()  # si Atlas no responde, la API no arranca (falla rapido y claro)
    yield


app = FastAPI(
    title="Parche API",
    description="Reserva la cancha. Arma el parche. Backend del marketplace de reservas deportivas.",
    version="1.0.0",
    lifespan=ciclo_de_vida,
)

# CORS: el navegador solo deja que la pagina del frontend llame a esta API
# si su direccion esta en esta lista.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[Config.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cada router agrupa las rutas de un tema
app.include_router(Auth.router)
app.include_router(Canchas.router)
app.include_router(Propietario.router)
app.include_router(Reservas.router)
app.include_router(Partidos.router)
app.include_router(Admin.router)


@app.get("/api/salud", tags=["Sistema"])
def salud():
    """Comprueba que la API esta viva y conectada a Atlas."""
    comprobar_conexion()
    colecciones = ["usuarios", "deportes", "sedes", "canchas", "reservas"]
    return {
        "estado": "ok",
        "base_de_datos": Config.MONGODB_DB,
        "documentos": {n: db[n].estimated_document_count() for n in colecciones},
    }


@app.get("/api/deportes", tags=["Catalogo"])
def listar_deportes():
    """Catalogo de deportes y modalidades (alimenta los filtros de busqueda)."""
    deportes = db.deportes.find({"activo": True}).sort("nombre", 1)
    return a_json(list(deportes))
