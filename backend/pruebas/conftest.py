"""
conftest.py (pytest exige este nombre exacto)
Prepara una base de datos de PRUEBAS, separada de Atlas, antes de importar la API.

Motor: un MongoDB real temporal (pymongo-inmemory). Se usa uno real, y no mongomock,
porque mongomock no aplica el indice unico sobre arreglos: no detecta que una reserva
de 7 a 9 p. m. se cruza con otra de 8 a 9 p. m., que es la regla mas importante.

Seguridad: antes de cualquier prueba se verifica que la base sea local y se llame
'parche_pruebas'. Si no, se detiene todo: las pruebas nunca tocan Atlas.
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from pymongo_inmemory import Mongod
from pymongo_inmemory.context import Context

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

# 1. Arrancar el MongoDB temporal y apuntar la API a el ANTES de importar app.*
#    (Config.py lee las variables al importarse; load_dotenv no pisa las que ya existen)
_mongod = Mongod(Context(os_name="windows" if os.name == "nt" else None, version="7.0"))  # MongoDB 7.0 oficial
_mongod.start()
os.environ["MONGODB_URI"] = _mongod.connection_string
os.environ["MONGODB_DB"] = "parche_pruebas"
os.environ["JWT_SECRET"] = "clave-solo-para-pruebas-no-es-secreta"
os.environ["FRONTEND_URL"] = "http://localhost:5173"

from fastapi.testclient import TestClient  # noqa: E402

from app import Config  # noqa: E402
from app.BaseDatos import db  # noqa: E402
from app.Config import COLOMBIA  # noqa: E402
from app.Main import app  # noqa: E402
from app.Seguridad import cifrar_clave, crear_token  # noqa: E402
from scripts.CrearColecciones import ESQUEMAS, INDICES, crear_indices, preparar_coleccion  # noqa: E402

# 2. Candado: jamas correr contra una base que no sea la local de pruebas
assert Config.MONGODB_DB == "parche_pruebas", "Las pruebas solo corren contra parche_pruebas"
assert Config.MONGODB_URI.startswith("mongodb://127.0.0.1") or Config.MONGODB_URI.startswith("mongodb://localhost"), \
    "Las pruebas solo corren contra un MongoDB local"

# "Ahora" fijo para que las reglas de tiempo den siempre lo mismo: martes 10 nov 2026, 10:00 a. m.
AHORA = datetime(2026, 11, 10, 10, 0, tzinfo=COLOMBIA)
PASADO_MANANA = (AHORA.date() + timedelta(days=2)).isoformat()  # jueves 12 nov
HORARIO = [{"dia": d, "abre": "06:00", "cierra": "23:00"}
           for d in ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]]


def pytest_sessionfinish(session, exitstatus):
    _mongod.stop()


@pytest.fixture(autouse=True)
def base_limpia(monkeypatch):
    """Antes de CADA prueba: colecciones vacias con el MISMO $jsonSchema e indices que Atlas, y reloj fijo."""
    for nombre in ESQUEMAS:
        db.drop_collection(nombre)
    for nombre, esquema in ESQUEMAS.items():
        preparar_coleccion(db, nombre, esquema)
    crear_indices(db)
    # Congelar el reloj en todos los modulos que usan ahora()
    import app.CicloDeVida, app.routers.Admin, app.routers.Canchas, app.routers.Partidos  # noqa: E401
    import app.routers.Propietario, app.routers.Reservas, app.Utilidades  # noqa: E401
    for modulo in (app.Utilidades, app.CicloDeVida, app.routers.Admin, app.routers.Canchas,
                   app.routers.Partidos, app.routers.Propietario, app.routers.Reservas):
        if hasattr(modulo, "ahora"):
            monkeypatch.setattr(modulo, "ahora", lambda: AHORA)
    yield


@pytest.fixture
def cliente_http():
    return TestClient(app)


def _usuario(nombre, email, rol, **extra):
    doc = {"nombre": nombre, "email": email, "password_hash": cifrar_clave("Clave-de-prueba-1"),
           "rol": rol, "ciudad": "Bogotá", "activo": True, "fecha_registro": datetime.now(timezone.utc), **extra}
    doc["_id"] = db.usuarios.insert_one(doc).inserted_id
    return doc


@pytest.fixture
def datos():
    """Escenario minimo: catalogo, dos propietarios con una cancha cada uno, tres jugadores y un admin."""
    db.deportes.insert_many([
        {"nombre": "Fútbol", "activo": True, "modalidades": [{"nombre": "Fútbol 5", "jugadores": 10, "duracion_min": 60}]},
        {"nombre": "Pádel", "activo": True, "modalidades": [
            {"nombre": "Pádel dobles", "jugadores": 4, "duracion_min": 60},
            {"nombre": "Pádel individual", "jugadores": 2, "duracion_min": 60}]},
    ])
    empresa = {"razon_social": "Canchas S.A.S.", "nit": "900123456"}
    laura = _usuario("Laura Gómez", "laura@prueba.co", "propietario", empresa=empresa)
    andres = _usuario("Andrés Ruiz", "andres@prueba.co", "propietario", empresa=empresa)
    jugadores = [_usuario(f"Jugador {i}", f"jugador{i}@prueba.co", "cliente") for i in range(1, 7)]
    admin = _usuario("Admin", "admin@prueba.co", "admin")

    def sede_y_cancha(dueno, nombre, deportes):
        sede = {"propietario_id": dueno["_id"], "nombre": nombre, "direccion": "Calle 1 # 2-3", "ciudad": "Bogotá",
                "zona": "Chapinero", "ubicacion": {"type": "Point", "coordinates": [-74.06, 4.65]},
                "horario": HORARIO, "servicios": [], "estado": "aprobada", "fecha_creacion": datetime.now(timezone.utc)}
        sede["_id"] = db.sedes.insert_one(sede).inserted_id
        cancha = {"sede_id": sede["_id"], "propietario_id": dueno["_id"],
                  "sede": {"nombre": nombre, "ciudad": "Bogotá", "zona": "Chapinero"}, "nombre": "Cancha 1",
                  "deportes": deportes, "superficie": "sintetica", "techada": False, "iluminacion": True,
                  "precio_hora": 100000, "precio_hora_pico": 130000, "estado": "activa"}
        cancha["_id"] = db.canchas.insert_one(cancha).inserted_id
        return sede, cancha

    sede_laura, cancha_laura = sede_y_cancha(laura, "El Golazo", [
        {"deporte": "Fútbol", "modalidad": "Fútbol 5"}, {"deporte": "Pádel", "modalidad": "Pádel dobles"}])
    sede_andres, cancha_andres = sede_y_cancha(andres, "La Bombonera", [{"deporte": "Fútbol", "modalidad": "Fútbol 5"}])

    return {
        "laura": laura, "andres": andres, "jugadores": jugadores, "admin": admin,
        "sede_laura": sede_laura, "cancha_laura": cancha_laura,
        "sede_andres": sede_andres, "cancha_andres": cancha_andres,
    }


def token(usuario) -> dict:
    """Encabezado Authorization con un token valido para ese usuario."""
    return {"Authorization": f"Bearer {crear_token(usuario)}"}


def reserva(cancha, hora, horas=1, modalidad="Fútbol 5", deporte="Fútbol", fecha=PASADO_MANANA, abierta=False):
    """Cuerpo de POST /api/reservas."""
    return {"cancha_id": str(cancha["_id"]), "fecha": fecha, "hora_inicio": hora, "horas": horas,
            "deporte": deporte, "modalidad": modalidad, "metodo_pago": "nequi", "abierta": abierta}


__all__ = ["AHORA", "PASADO_MANANA", "token", "reserva", "db", "date"]
