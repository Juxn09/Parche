"""
Seguridad.py
Contrasenas (bcrypt), tokens de sesion (JWT) y control de roles.
"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import Config
from app.BaseDatos import db

ALGORITMO = "HS256"
esquema_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------
# Contrasenas
# ---------------------------------------------------------------
def cifrar_clave(clave: str) -> str:
    """Hash bcrypt con sal aleatoria. No se puede revertir."""
    return bcrypt.hashpw(clave.encode(), bcrypt.gensalt()).decode()


def verificar_clave(clave: str, hash_guardado: str) -> bool:
    """bcrypt vuelve a calcular el hash con la sal guardada y compara."""
    return bcrypt.checkpw(clave.encode(), hash_guardado.encode())


# ---------------------------------------------------------------
# Tokens JWT
# ---------------------------------------------------------------
def crear_token(usuario: dict) -> str:
    """
    El token es como una manilla de evento: dice quien eres, que rol tienes
    y hasta cuando vale. Va firmado con JWT_SECRET, asi que si alguien lo
    modifica (por ejemplo, cambia su rol a admin) la firma deja de coincidir.
    """
    ahora = datetime.now(timezone.utc)
    datos = {
        "sub": str(usuario["_id"]),
        "rol": usuario["rol"],
        "nombre": usuario["nombre"],
        "iat": ahora,
        "exp": ahora + timedelta(minutes=Config.JWT_MINUTOS),
    }
    return jwt.encode(datos, Config.JWT_SECRET, algorithm=ALGORITMO)


def _no_autorizado(mensaje):
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=mensaje,
        headers={"WWW-Authenticate": "Bearer"},
    )


# ---------------------------------------------------------------
# Dependencias: FastAPI las ejecuta ANTES de la ruta que las pide
# ---------------------------------------------------------------
def usuario_actual(credenciales: HTTPAuthorizationCredentials = Depends(esquema_bearer)) -> dict:
    """Lee el token, verifica la firma y la expiracion, y trae al usuario de la base."""
    if credenciales is None:
        raise _no_autorizado("Debes iniciar sesión")
    try:
        datos = jwt.decode(credenciales.credentials, Config.JWT_SECRET, algorithms=[ALGORITMO])
        usuario_id = ObjectId(datos["sub"])
    except jwt.ExpiredSignatureError:
        raise _no_autorizado("Tu sesión expiró, inicia sesión de nuevo")
    except (jwt.InvalidTokenError, InvalidId, KeyError):
        raise _no_autorizado("Token inválido")

    # Se consulta la base en cada peticion: si el admin desactiva a alguien,
    # su token deja de servir de inmediato.
    usuario = db.usuarios.find_one({"_id": usuario_id, "activo": True}, {"password_hash": 0})
    if usuario is None:
        raise _no_autorizado("Usuario no encontrado o inactivo")
    return usuario


def requiere_rol(*roles):
    """
    Fabrica una dependencia que solo deja pasar a ciertos roles.
    Uso: usuario: dict = Depends(requiere_rol("propietario"))
    """
    def verificar(usuario: dict = Depends(usuario_actual)) -> dict:
        if usuario["rol"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para esta acción",
            )
        return usuario
    return verificar
