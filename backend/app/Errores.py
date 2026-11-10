"""
Errores.py
Respuestas de error claras y siempre en JSON.

1. Validacion (422): Pydantic responde en ingles ("Input should be..."). Aqui se
   traduce cada error a una frase en espanol que la interfaz muestra tal cual.
2. Errores inesperados (500) y base de datos caida (503): sin esto, FastAPI responde
   texto plano SIN las cabeceras CORS, y el navegador lo confunde con "no hay conexion".
"""
import logging

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import AutoReconnect, ConnectionFailure, ServerSelectionTimeoutError

registro = logging.getLogger("parche")

# Nombres de campos como los ve el usuario
NOMBRES_CAMPOS = {
    "clave": "La contraseña",
    "email": "El correo",
    "nombre": "El nombre",
    "telefono": "El celular",
    "ciudad": "La ciudad",
    "zona": "La zona",
    "direccion": "La dirección",
    "rol": "El tipo de cuenta",
    "fecha": "La fecha",
    "hora_inicio": "La hora de inicio",
    "horas": "La duración",
    "motivo": "El motivo",
    "metodo_pago": "El método de pago",
    "precio_hora": "El precio por hora",
    "precio_hora_pico": "El precio de hora pico",
    "razon_social": "La razón social",
    "nit": "El NIT",
    "latitud": "La latitud",
    "longitud": "La longitud",
    "deportes": "Las modalidades",
    "horario": "El horario",
    "abre": "La hora de apertura",
    "cierra": "La hora de cierre",
}


def _campo(error: dict) -> str:
    """Toma el ultimo nombre de la ruta del error ('body' -> 'empresa' -> 'nit' => 'El NIT')."""
    nombres = [str(p) for p in error.get("loc", []) if isinstance(p, str) and p not in ("body", "query", "path")]
    if not nombres:
        return "El dato enviado"
    return NOMBRES_CAMPOS.get(nombres[-1], f"El campo '{nombres[-1]}'")


def traducir(error: dict) -> str:
    """Convierte un error de Pydantic en una frase en espanol."""
    campo, tipo, ctx = _campo(error), error.get("type", ""), error.get("ctx") or {}
    if tipo == "missing":
        return f"{campo} es obligatorio"
    if tipo == "string_too_short":
        return f"{campo} debe tener al menos {ctx.get('min_length')} caracteres"
    if tipo == "string_too_long":
        return f"{campo} debe tener como máximo {ctx.get('max_length')} caracteres"
    if tipo == "string_pattern_mismatch":
        return f"{campo} no tiene el formato correcto"
    if tipo == "literal_error":
        return f"{campo} debe ser una de estas opciones: {ctx.get('expected', '')}".replace("'", "").replace(" or ", " o ")
    if tipo in ("int_parsing", "int_type", "int_from_float"):
        return f"{campo} debe ser un número entero"
    if tipo in ("float_parsing", "float_type"):
        return f"{campo} debe ser un número"
    if tipo in ("bool_parsing", "bool_type"):
        return f"{campo} debe ser verdadero o falso"
    if tipo in ("greater_than_equal", "greater_than"):
        return f"{campo} debe ser mayor o igual a {ctx.get('ge', ctx.get('gt'))}"
    if tipo in ("less_than_equal", "less_than"):
        return f"{campo} debe ser menor o igual a {ctx.get('le', ctx.get('lt'))}"
    if tipo == "too_short":
        return f"{campo} debe tener al menos {ctx.get('min_length')} elemento(s)"
    if tipo == "too_long":
        return f"{campo} debe tener como máximo {ctx.get('max_length')} elemento(s)"
    if tipo == "json_invalid":
        return "Los datos enviados no son un JSON válido"
    if tipo in ("string_type", "dict_type", "list_type", "model_type", "model_attributes_type"):
        return f"{campo} tiene un tipo de dato incorrecto"
    return f"{campo} no es válido"


async def error_de_validacion(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 con 'detail' en espanol (una frase por error) y la lista original para depurar."""
    errores = exc.errors()
    mensajes = list(dict.fromkeys(traducir(e) for e in errores))  # sin repetidos, en orden
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": ". ".join(mensajes), "errores": [
            {"campo": ".".join(str(p) for p in e.get("loc", [])), "tipo": e.get("type")} for e in errores
        ]},
    )


async def capturar_errores(request: Request, siguiente):
    """
    Middleware: envuelve cada peticion. Si algo explota sin control, responde JSON.
    Se registra ANTES que CORS en Main.py, asi CORS queda por fuera y le agrega sus
    cabeceras tambien a estas respuestas de error.
    """
    try:
        return await siguiente(request)
    except (ServerSelectionTimeoutError, ConnectionFailure, AutoReconnect):
        registro.exception("La base de datos no responde")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "La base de datos no está disponible en este momento. Intenta de nuevo en unos minutos."},
        )
    except Exception:
        registro.exception("Error inesperado")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Ocurrió un error inesperado en el servidor. Intenta de nuevo."},
        )
