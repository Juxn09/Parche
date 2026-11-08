"""
CrearColecciones.py
Crea (o actualiza) las 5 colecciones de Parche con su validacion $jsonSchema
y sus indices. Se puede ejecutar varias veces: no duplica nada.

Uso (desde la carpeta backend, con el .venv activo):
    python scripts/CrearColecciones.py
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

# ---------------------------------------------------------------
# 1. Leer las credenciales del archivo backend/.env
# ---------------------------------------------------------------
RUTA_ENV = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(RUTA_ENV)

URI = os.getenv("MONGODB_URI")
NOMBRE_BD = os.getenv("MONGODB_DB", "parche")


# ---------------------------------------------------------------
# 2. Piezas reutilizables para los esquemas
# ---------------------------------------------------------------
TEXTO = {"bsonType": "string", "minLength": 1}
ID = {"bsonType": "objectId"}
FECHA = {"bsonType": "date"}
BOOLEANO = {"bsonType": "bool"}


def entero(minimo=0, maximo=None):
    """Numero entero con limite inferior (y superior opcional)."""
    regla = {"bsonType": ["int", "long"], "minimum": minimo}
    if maximo is not None:
        regla["maximum"] = maximo
    return regla


# ---------------------------------------------------------------
# 3. Esquemas $jsonSchema de cada coleccion
# ---------------------------------------------------------------
ESQUEMAS = {
    "usuarios": {
        "bsonType": "object",
        "required": ["nombre", "email", "password_hash", "rol", "activo", "fecha_registro"],
        "properties": {
            "nombre": TEXTO,
            "email": {"bsonType": "string", "pattern": r"^[^@\s]+@[^@\s]+\.[^@\s]+$"},
            "telefono": {"bsonType": "string"},
            "password_hash": TEXTO,
            "rol": {"enum": ["cliente", "propietario", "admin"]},
            "ciudad": {"bsonType": "string"},
            "empresa": {
                "bsonType": "object",
                "required": ["razon_social", "nit"],
                "properties": {"razon_social": TEXTO, "nit": TEXTO},
            },
            "activo": BOOLEANO,
            "fecha_registro": FECHA,
        },
    },
    "deportes": {
        "bsonType": "object",
        "required": ["nombre", "modalidades", "activo"],
        "properties": {
            "nombre": TEXTO,
            "modalidades": {
                "bsonType": "array",
                "minItems": 1,
                "items": {
                    "bsonType": "object",
                    "required": ["nombre", "jugadores", "duracion_min"],
                    "properties": {
                        "nombre": TEXTO,
                        "jugadores": entero(2),
                        "duracion_min": entero(30),
                    },
                },
            },
            "activo": BOOLEANO,
        },
    },
    "sedes": {
        "bsonType": "object",
        "required": ["propietario_id", "nombre", "direccion", "ciudad", "zona",
                     "ubicacion", "horario", "estado", "fecha_creacion"],
        "properties": {
            "propietario_id": ID,
            "nombre": TEXTO,
            "direccion": TEXTO,
            "ciudad": TEXTO,
            "zona": TEXTO,
            "ubicacion": {
                "bsonType": "object",
                "required": ["type", "coordinates"],
                "properties": {
                    "type": {"enum": ["Point"]},
                    "coordinates": {
                        "bsonType": "array",
                        "minItems": 2,
                        "maxItems": 2,
                        "items": {"bsonType": ["double", "int"]},
                    },
                },
            },
            "horario": {
                "bsonType": "array",
                "minItems": 1,
                "maxItems": 7,
                "items": {
                    "bsonType": "object",
                    "required": ["dia", "abre", "cierra"],
                    "properties": {
                        "dia": {"enum": ["lunes", "martes", "miercoles", "jueves",
                                         "viernes", "sabado", "domingo"]},
                        "abre": {"bsonType": "string", "pattern": r"^([01]\d|2[0-3]):[0-5]\d$"},
                        "cierra": {"bsonType": "string", "pattern": r"^([01]\d|2[0-3]):[0-5]\d$"},
                    },
                },
            },
            "servicios": {"bsonType": "array", "items": {"bsonType": "string"}},
            "estado": {"enum": ["pendiente", "aprobada", "rechazada"]},
            "fecha_creacion": FECHA,
        },
    },
    "canchas": {
        "bsonType": "object",
        "required": ["sede_id", "propietario_id", "sede", "nombre", "deportes",
                     "superficie", "precio_hora", "precio_hora_pico", "estado"],
        "properties": {
            "sede_id": ID,
            "propietario_id": ID,
            "sede": {
                "bsonType": "object",
                "required": ["nombre", "ciudad", "zona"],
                "properties": {"nombre": TEXTO, "ciudad": TEXTO, "zona": TEXTO},
            },
            "nombre": TEXTO,
            "deportes": {
                "bsonType": "array",
                "minItems": 1,
                "items": {
                    "bsonType": "object",
                    "required": ["deporte", "modalidad"],
                    "properties": {"deporte": TEXTO, "modalidad": TEXTO},
                },
            },
            "superficie": {"enum": ["sintetica", "natural", "cemento", "madera", "arcilla", "acrilico"]},
            "techada": BOOLEANO,
            "iluminacion": BOOLEANO,
            "precio_hora": entero(0),
            "precio_hora_pico": entero(0),
            "estado": {"enum": ["activa", "mantenimiento", "inactiva"]},
        },
    },
    "reservas": {
        "bsonType": "object",
        "required": ["tipo", "cancha_id", "propietario_id", "cancha", "fecha",
                     "hora_inicio", "hora_fin", "franjas", "estado", "fecha_creacion"],
        "properties": {
            "tipo": {"enum": ["reserva", "bloqueo"]},
            "cancha_id": ID,
            "propietario_id": ID,
            "usuario_id": ID,
            "cancha": {
                "bsonType": "object",
                "required": ["nombre", "sede", "zona"],
                "properties": {"nombre": TEXTO, "sede": TEXTO, "zona": TEXTO},
            },
            "usuario": {"bsonType": "object", "properties": {"nombre": TEXTO}},
            "deporte": {"bsonType": "string"},
            "modalidad": {"bsonType": "string"},
            "motivo": {"bsonType": "string"},
            "fecha": {"bsonType": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"},
            "hora_inicio": entero(0, 23),
            "hora_fin": entero(1, 24),
            "franjas": {
                "bsonType": "array",
                "minItems": 1,
                "items": {"bsonType": "string", "pattern": r"^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3])$"},
            },
            "precio_total": entero(0),
            "pago": {
                "bsonType": "object",
                "required": ["metodo", "valor", "estado"],
                "properties": {
                    "metodo": {"enum": ["nequi", "daviplata", "tarjeta", "pse", "efectivo"]},
                    "valor": entero(0),
                    "estado": {"enum": ["pendiente", "pagado", "reembolsado"]},
                },
            },
            "partido_abierto": {
                "bsonType": "object",
                "required": ["cupos_totales", "cuota", "estado", "participantes"],
                "properties": {
                    "cupos_totales": entero(2),
                    "cuota": entero(0),
                    "estado": {"enum": ["abierto", "completo", "cerrado"]},
                    "participantes": {
                        "bsonType": "array",
                        "items": {
                            "bsonType": "object",
                            "required": ["usuario_id", "nombre", "cuota_pagada", "fecha_union"],
                            "properties": {
                                "usuario_id": ID,
                                "nombre": TEXTO,
                                "cuota_pagada": entero(0),
                                "fecha_union": FECHA,
                            },
                        },
                    },
                },
            },
            "estado": {"enum": ["activa", "cancelada", "finalizada"]},
            "fecha_creacion": FECHA,
        },
    },
}


# ---------------------------------------------------------------
# 4. Indices de cada coleccion: (campos, opciones)
#    1 = orden ascendente, -1 = descendente
# ---------------------------------------------------------------
INDICES = {
    "usuarios": [
        ([("email", 1)], {"name": "ux_email", "unique": True}),
        ([("rol", 1)], {"name": "ix_rol"}),
    ],
    "deportes": [
        ([("nombre", 1)], {"name": "ux_nombre", "unique": True}),
    ],
    "sedes": [
        ([("propietario_id", 1)], {"name": "ix_propietario"}),
        ([("estado", 1), ("ciudad", 1), ("zona", 1)], {"name": "ix_estado_ciudad_zona"}),
        ([("ubicacion", "2dsphere")], {"name": "ix_ubicacion_geo"}),
    ],
    "canchas": [
        ([("sede_id", 1)], {"name": "ix_sede"}),
        ([("propietario_id", 1)], {"name": "ix_propietario"}),
        ([("deportes.deporte", 1), ("deportes.modalidad", 1)], {"name": "ix_deporte_modalidad"}),
    ],
    "reservas": [
        # La regla estrella: ninguna reserva ni bloqueo activo se cruza en la misma cancha
        ([("cancha_id", 1), ("franjas", 1)], {
            "name": "ux_cancha_franja_activa",
            "unique": True,
            "partialFilterExpression": {"estado": "activa"},
        }),
        ([("usuario_id", 1), ("fecha", -1)], {"name": "ix_usuario_fecha"}),
        ([("propietario_id", 1), ("fecha", -1)], {"name": "ix_propietario_fecha"}),
        ([("partido_abierto.estado", 1), ("fecha", 1)], {"name": "ix_partidos_abiertos"}),
    ],
}


# ---------------------------------------------------------------
# 5. Funciones que aplican todo en Atlas
# ---------------------------------------------------------------
def preparar_coleccion(db, nombre, esquema):
    """Crea la coleccion con su validador, o actualiza el validador si ya existe."""
    opciones = {
        "validator": {"$jsonSchema": esquema},
        "validationLevel": "strict",   # revisa todas las inserciones y actualizaciones
        "validationAction": "error",   # si no cumple, rechaza la operacion
    }
    if nombre in db.list_collection_names():
        db.command("collMod", nombre, **opciones)
        print(f"  ~ {nombre}: validacion actualizada")
    else:
        db.create_collection(nombre, **opciones)
        print(f"  + {nombre}: coleccion creada")


def crear_indices(db):
    for coleccion, lista in INDICES.items():
        for campos, opciones in lista:
            db[coleccion].create_index(campos, **opciones)
            print(f"  + {coleccion}.{opciones['name']}")


def main():
    if not URI:
        raise SystemExit("Falta MONGODB_URI en backend/.env")

    cliente = MongoClient(URI)
    cliente.admin.command("ping")  # falla aqui si la conexion no sirve
    db = cliente[NOMBRE_BD]
    print(f"Conectado a la base '{NOMBRE_BD}' en Atlas\n")

    print("1) Colecciones y validacion $jsonSchema")
    for nombre, esquema in ESQUEMAS.items():
        preparar_coleccion(db, nombre, esquema)

    print("\n2) Indices")
    crear_indices(db)

    cliente.close()
    print("\nListo.")


if __name__ == "__main__":
    main()