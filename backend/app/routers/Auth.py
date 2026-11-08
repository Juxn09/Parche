"""
Auth.py
Registro, inicio de sesion y "quien soy".
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.BaseDatos import a_json, db
from app.Modelos import LoginEntrada, RegistroEntrada
from app.Seguridad import cifrar_clave, crear_token, usuario_actual, verificar_clave

router = APIRouter(prefix="/api/auth", tags=["Autenticacion"])


def _respuesta_sesion(usuario: dict) -> dict:
    return {
        "token": crear_token(usuario),
        "usuario": a_json({
            "_id": usuario["_id"],
            "nombre": usuario["nombre"],
            "email": usuario["email"],
            "rol": usuario["rol"],
        }),
    }


@router.post("/registro", status_code=status.HTTP_201_CREATED)
def registrar(datos: RegistroEntrada):
    """Crea una cuenta de cliente o de propietario e inicia sesion."""
    # Regla de negocio: un propietario debe registrar los datos de su empresa
    if datos.rol == "propietario" and datos.empresa is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Un propietario debe registrar la razón social y el NIT de su empresa")

    usuario = {
        "nombre": datos.nombre.strip(),
        "email": datos.email.strip().lower(),
        "telefono": datos.telefono,
        "password_hash": cifrar_clave(datos.clave),
        "rol": datos.rol,
        "ciudad": datos.ciudad.strip(),
        "activo": True,
        "fecha_registro": datetime.now(timezone.utc),
    }
    if datos.rol == "propietario":
        usuario["empresa"] = datos.empresa.model_dump()
    if usuario["telefono"] is None:
        del usuario["telefono"]

    try:
        resultado = db.usuarios.insert_one(usuario)
    except DuplicateKeyError:
        # El indice unico ux_email es quien detecta el correo repetido
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo")

    usuario["_id"] = resultado.inserted_id
    return _respuesta_sesion(usuario)


@router.post("/login")
def iniciar_sesion(datos: LoginEntrada):
    """Verifica correo y contrasena y entrega un token JWT."""
    usuario = db.usuarios.find_one({"email": datos.email.strip().lower()})
    # Mismo mensaje si el correo no existe o si la clave esta mal:
    # asi nadie puede averiguar que correos estan registrados.
    if usuario is None or not verificar_clave(datos.clave, usuario["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Correo o contraseña incorrectos")
    if not usuario["activo"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tu cuenta está desactivada")
    return _respuesta_sesion(usuario)


@router.get("/yo")
def quien_soy(usuario: dict = Depends(usuario_actual)):
    """Devuelve los datos del usuario dueño del token."""
    return a_json(usuario)
