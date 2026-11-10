"""
Config.py
Lee la configuracion del backend. En local sale de backend/.env; en Render
sale de las variables de entorno del panel. Nunca hay secretos en el codigo.
"""
import os
from datetime import timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _obligatoria(nombre):
    """Lee una variable y detiene el arranque si no existe."""
    valor = os.getenv(nombre)
    if not valor:
        raise RuntimeError(f"Falta la variable {nombre} en backend/.env")
    return valor


MONGODB_URI = _obligatoria("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "parche")
JWT_SECRET = _obligatoria("JWT_SECRET")
JWT_MINUTOS = int(os.getenv("JWT_MINUTOS", "480"))  # duracion de la sesion: 8 horas
# Direcciones de la interfaz que pueden llamar a la API (CORS). Varias, separadas por coma:
# en Render queda "https://parche-xxx.vercel.app,http://localhost:5173"
FRONTEND_URLS = [u.strip().rstrip("/") for u in os.getenv("FRONTEND_URL", "http://localhost:5173").split(",") if u.strip()]

# Todas las reglas de tiempo usan la hora de Colombia del SERVIDOR, nunca la del usuario
COLOMBIA = timezone(timedelta(hours=-5))
