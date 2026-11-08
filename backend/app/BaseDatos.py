"""
BaseDatos.py
Unica conexion del backend con MongoDB Atlas, mas utilidades para
convertir los documentos a JSON.
"""
from datetime import datetime

from bson import ObjectId
from pymongo import MongoClient

from app import Config

# Un solo cliente para toda la API: PyMongo mantiene un "pool" de conexiones
# abiertas y las reutiliza en cada peticion (abrir una conexion por peticion seria lento).
cliente = MongoClient(
    Config.MONGODB_URI,
    appname="Parche API",
    serverSelectionTimeoutMS=8000,  # si Atlas no responde en 8 s, error claro
    tz_aware=True,                  # las fechas vuelven con zona horaria (UTC)
)
db = cliente[Config.MONGODB_DB]


def comprobar_conexion():
    """Lanza un error si Atlas no responde."""
    cliente.admin.command("ping")


def a_json(valor):
    """
    Convierte lo que JSON no entiende: ObjectId -> texto y fechas -> texto ISO.
    Funciona con documentos, listas y documentos dentro de documentos.
    """
    if isinstance(valor, ObjectId):
        return str(valor)
    if isinstance(valor, datetime):
        return valor.isoformat()
    if isinstance(valor, list):
        return [a_json(v) for v in valor]
    if isinstance(valor, dict):
        return {clave: a_json(v) for clave, v in valor.items()}
    return valor
