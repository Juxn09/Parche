"""
CargarDatos.py
Llena la base 'parche' con datos de prueba realistas: deportes, usuarios,
sedes, canchas, reservas, partidos abiertos y bloqueos.

ATENCION: borra todos los documentos de las 5 colecciones antes de cargar
(pide escribir SI para confirmar). No borra las colecciones, ni su
validacion, ni sus indices.

Uso (desde la carpeta backend, con el .venv activo):
    python scripts/CargarDatos.py
"""
import math
import os
import random
import unicodedata
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

import bcrypt
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

# ---------------------------------------------------------------
# 1. Configuracion
# ---------------------------------------------------------------
RUTA_ENV = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(RUTA_ENV)

URI = os.getenv("MONGODB_URI")
NOMBRE_BD = os.getenv("MONGODB_DB", "parche")
CLAVE_PRUEBA = os.getenv("SEED_PASSWORD")  # contrasena de todos los usuarios de prueba

COLOMBIA = timezone(timedelta(hours=-5))
HOY = datetime.now(COLOMBIA).date()
DIAS_ATRAS = 56          # 8 semanas de historia
DIAS_ADELANTE = 13       # 2 semanas hacia el futuro
HORA_PICO = range(18, 22)  # franjas que empiezan entre 6 p. m. y 9 p. m.

random.seed(2026)  # semilla fija: mismo patron de datos en cada ejecucion

DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
HORARIO = (
    [{"dia": d, "abre": "06:00", "cierra": "23:00"} for d in DIAS_SEMANA[:5]]
    + [{"dia": "sabado", "abre": "07:00", "cierra": "22:00"},
       {"dia": "domingo", "abre": "07:00", "cierra": "20:00"}]
)
ABRE_CIERRA = {h["dia"]: (int(h["abre"][:2]), int(h["cierra"][:2])) for h in HORARIO}

# Que tan probable es cada hora de inicio (mas peso = mas reservas)
PESOS_ENTRE_SEMANA = {6: 1, 7: 2, 8: 2, 9: 2, 10: 2, 11: 1, 12: 1, 13: 1, 14: 1, 15: 2,
                      16: 3, 17: 4, 18: 8, 19: 9, 20: 8, 21: 4, 22: 1}
PESOS_FIN_DE_SEMANA = {7: 3, 8: 5, 9: 6, 10: 6, 11: 5, 12: 3, 13: 2, 14: 2, 15: 3,
                       16: 4, 17: 4, 18: 5, 19: 5, 20: 3, 21: 2}

METODOS_PAGO = ["nequi", "tarjeta", "daviplata", "pse", "efectivo"]
PESOS_PAGO = [40, 25, 15, 15, 5]

# ---------------------------------------------------------------
# 2. Datos base
# ---------------------------------------------------------------
DEPORTES = [
    {"nombre": "Fútbol", "modalidades": [
        {"nombre": "Fútbol 5", "jugadores": 10, "duracion_min": 60},
        {"nombre": "Fútbol 7", "jugadores": 14, "duracion_min": 60},
        {"nombre": "Fútbol 8", "jugadores": 16, "duracion_min": 60}]},
    {"nombre": "Pádel", "modalidades": [
        {"nombre": "Pádel dobles", "jugadores": 4, "duracion_min": 60},
        {"nombre": "Pádel individual", "jugadores": 2, "duracion_min": 60}]},
    {"nombre": "Baloncesto", "modalidades": [
        {"nombre": "Baloncesto 3x3", "jugadores": 6, "duracion_min": 60},
        {"nombre": "Baloncesto 5x5", "jugadores": 10, "duracion_min": 60}]},
    {"nombre": "Voleibol", "modalidades": [
        {"nombre": "Voleibol sala", "jugadores": 12, "duracion_min": 60},
        {"nombre": "Voleibol playa", "jugadores": 4, "duracion_min": 60}]},
    {"nombre": "Tenis", "modalidades": [
        {"nombre": "Tenis individual", "jugadores": 2, "duracion_min": 60},
        {"nombre": "Tenis dobles", "jugadores": 4, "duracion_min": 60}]},
]
JUGADORES = {m["nombre"]: m["jugadores"] for d in DEPORTES for m in d["modalidades"]}

# (nombre, email, telefono, ciudad, razon social, NIT)
PROPIETARIOS = [
    ("Laura Gómez", "laura.gomez@elgolazo.co", "3104567890", "Bogotá",
     "Canchas El Golazo S.A.S.", "901234567-8"),
    ("Andrés Restrepo", "andres.restrepo@padelandino.co", "3157654321", "Bogotá",
     "Pádel Club Andino S.A.S.", "901345678-2"),
    ("Diana Castro", "diana.castro@complejola70.co", "3002345678", "Medellín",
     "Complejo Deportivo La 70 S.A.S.", "900456789-5"),
    ("Jorge Ramírez", "jorge.ramirez@arenasport.co", "3209876543", "Bogotá",
     "Arena Sport S.A.S.", "901567890-1"),
]

NOMBRES = ["Santiago", "Valentina", "Mateo", "Isabella", "Sebastián", "Mariana", "Nicolás",
           "Gabriela", "Samuel", "Daniela", "Alejandro", "Sofía", "Juan David", "Camila",
           "Tomás", "Paula", "Felipe", "Natalia", "Esteban", "Luisa", "Miguel", "Juliana",
           "David", "Manuela", "Carlos", "Sara", "Andrés", "Valeria", "Julián", "Ana María"]
APELLIDOS = ["Rodríguez", "Martínez", "García", "López", "Hernández", "González", "Pérez",
             "Sánchez", "Ramírez", "Torres", "Díaz", "Vargas", "Moreno", "Rojas", "Castro",
             "Ortiz", "Jiménez", "Muñoz", "Suárez", "Cárdenas"]

# Cada cancha: (nombre, [(deporte, modalidad)], superficie, techada, precio, precio pico, estado)
F5 = ("Fútbol", "Fútbol 5")
F7 = ("Fútbol", "Fútbol 7")
F8 = ("Fútbol", "Fútbol 8")
PADEL = [("Pádel", "Pádel dobles"), ("Pádel", "Pádel individual")]
TENIS = [("Tenis", "Tenis individual"), ("Tenis", "Tenis dobles")]
BALONCESTO_3 = ("Baloncesto", "Baloncesto 3x3")
BALONCESTO_5 = ("Baloncesto", "Baloncesto 5x5")
VOLEIBOL = ("Voleibol", "Voleibol sala")

SEDES = [
    {"propietario": 0, "nombre": "El Golazo Norte", "direccion": "Calle 140 # 15-20",
     "ciudad": "Bogotá", "zona": "Usaquén", "coordenadas": (-74.0431, 4.7215),
     "servicios": ["parqueadero", "duchas", "cafeteria"], "estado": "aprobada",
     "canchas": [
         ("Cancha 1", [F5], "sintetica", False, 120000, 150000, "activa"),
         ("Cancha 2", [F5, BALONCESTO_5], "sintetica", False, 120000, 150000, "activa"),
         ("Cancha 3", [F8], "sintetica", False, 200000, 250000, "activa")]},
    {"propietario": 0, "nombre": "El Golazo Suba", "direccion": "Avenida Suba # 115-40",
     "ciudad": "Bogotá", "zona": "Suba", "coordenadas": (-74.0700, 4.7240),
     "servicios": ["parqueadero", "cafeteria"], "estado": "aprobada",
     "canchas": [
         ("Cancha 1", [F5], "sintetica", False, 100000, 130000, "activa"),
         ("Cancha 2", [F7], "sintetica", False, 160000, 200000, "activa"),
         ("Cancha 3", [F5], "sintetica", False, 100000, 130000, "mantenimiento")]},
    {"propietario": 1, "nombre": "Pádel Club Chapinero", "direccion": "Carrera 7 # 63-12",
     "ciudad": "Bogotá", "zona": "Chapinero", "coordenadas": (-74.0590, 4.6480),
     "servicios": ["duchas", "tienda", "alquiler de raquetas"], "estado": "aprobada",
     "canchas": [
         ("Pista 1", PADEL, "sintetica", True, 90000, 120000, "activa"),
         ("Pista 2", PADEL, "sintetica", True, 90000, 120000, "activa"),
         ("Pista 3", PADEL, "sintetica", False, 80000, 100000, "activa")]},
    {"propietario": 1, "nombre": "Pádel Club Teusaquillo", "direccion": "Calle 39 # 20-15",
     "ciudad": "Bogotá", "zona": "Teusaquillo", "coordenadas": (-74.0700, 4.6290),
     "servicios": ["duchas", "alquiler de raquetas"], "estado": "aprobada",
     "canchas": [
         ("Pista 1", PADEL, "sintetica", True, 85000, 110000, "activa"),
         ("Cancha de tenis", TENIS, "arcilla", False, 70000, 90000, "activa")]},
    {"propietario": 2, "nombre": "La 70 Laureles", "direccion": "Carrera 70 # 44-30",
     "ciudad": "Medellín", "zona": "Laureles", "coordenadas": (-75.5900, 6.2480),
     "servicios": ["parqueadero", "duchas", "cafeteria"], "estado": "aprobada",
     "canchas": [
         ("Cancha 1", [F5], "sintetica", False, 110000, 140000, "activa"),
         ("Coliseo", [BALONCESTO_5, BALONCESTO_3, VOLEIBOL], "madera", True, 130000, 160000, "activa"),
         ("Cancha 2", [F7], "sintetica", False, 160000, 200000, "activa")]},
    {"propietario": 2, "nombre": "La 70 El Poblado", "direccion": "Calle 10 # 43D-25",
     "ciudad": "Medellín", "zona": "El Poblado", "coordenadas": (-75.5680, 6.2090),
     "servicios": ["parqueadero", "duchas", "tienda"], "estado": "aprobada",
     "canchas": [
         ("Pista 1", PADEL, "sintetica", True, 95000, 125000, "activa"),
         ("Pista 2", PADEL, "sintetica", True, 95000, 125000, "activa"),
         ("Cancha de tenis", TENIS, "cemento", False, 75000, 95000, "activa")]},
    {"propietario": 3, "nombre": "Arena Sport Kennedy", "direccion": "Avenida 1 de Mayo # 72-10",
     "ciudad": "Bogotá", "zona": "Kennedy", "coordenadas": (-74.1500, 4.6260),
     "servicios": ["parqueadero", "cafeteria"], "estado": "aprobada",
     "canchas": [
         ("Cancha 1", [F5], "sintetica", False, 90000, 120000, "activa"),
         ("Cancha 2", [F5], "sintetica", False, 90000, 120000, "activa"),
         ("Cancha 3", [F8], "sintetica", False, 170000, 220000, "activa"),
         ("Multiuso", [BALONCESTO_3, VOLEIBOL], "cemento", False, 60000, 80000, "activa")]},
    # Sede nueva esperando aprobacion del admin: no aparece en busquedas ni tiene reservas
    {"propietario": 3, "nombre": "Arena Sport Fontibón", "direccion": "Calle 17 # 99-40",
     "ciudad": "Bogotá", "zona": "Fontibón", "coordenadas": (-74.1450, 4.6720),
     "servicios": ["parqueadero"], "estado": "pendiente",
     "canchas": [
         ("Cancha 1", [F5], "sintetica", False, 100000, 130000, "activa"),
         ("Cancha 2", [F7], "sintetica", False, 150000, 190000, "activa")]},
]

MOTIVOS_BLOQUEO = ["Mantenimiento de la grama", "Torneo interno", "Revisión de iluminación"]


# ---------------------------------------------------------------
# 3. Funciones de ayuda
# ---------------------------------------------------------------
def momento(dia, hora, minuto=0):
    """Fecha y hora de Colombia como datetime con zona horaria."""
    return datetime.combine(dia, time(hora, minuto), tzinfo=COLOMBIA)


def franja(dia, hora):
    """Ejemplo: franja(12 nov 2026, 19) -> '2026-11-12T19'."""
    return f"{dia.isoformat()}T{hora:02d}"


def sin_tildes(texto):
    """'Sebastián Muñoz' -> 'sebastian munoz' (para armar correos)."""
    normal = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in normal if not unicodedata.combining(c)).lower()


def entre(desde, hasta):
    """Un momento al azar entre dos datetimes."""
    return desde + (hasta - desde) * random.random()


def nuevo_usuario(nombre, email, telefono, rol, ciudad, hashear, empresa=None, activo=True):
    doc = {
        "_id": ObjectId(),
        "nombre": nombre,
        "email": email,
        "telefono": telefono,
        "password_hash": hashear(),
        "rol": rol,
        "ciudad": ciudad,
        "activo": activo,
        "fecha_registro": momento(HOY - timedelta(days=random.randint(60, 200)), random.randint(7, 21)),
    }
    if empresa:
        doc["empresa"] = {"razon_social": empresa[0], "nit": empresa[1]}
    return doc


# ---------------------------------------------------------------
# 4. Construccion de los documentos (todavia no toca la base)
# ---------------------------------------------------------------
def construir_usuarios(hashear):
    admin = nuevo_usuario("Administración Parche", "admin@parche.co", "3000000000",
                          "admin", "Bogotá", hashear)
    propietarios = [
        nuevo_usuario(n, e, t, "propietario", c, hashear, empresa=(rs, nit))
        for n, e, t, c, rs, nit in PROPIETARIOS
    ]
    clientes, correos = [], set()
    for i, nombre in enumerate(NOMBRES):
        apellido = random.choice(APELLIDOS)
        base = f"{sin_tildes(nombre).replace(' ', '')}.{sin_tildes(apellido)}"
        email = f"{base}@gmail.com"
        numero = 2
        while email in correos:
            email = f"{base}{numero}@gmail.com"
            numero += 1
        correos.add(email)
        ciudad = "Medellín" if i >= 22 else "Bogotá"
        telefono = "3" + "".join(random.choice("0123456789") for _ in range(9))
        activo = i != 29  # un cliente desactivado, para mostrar que no se borra
        clientes.append(nuevo_usuario(f"{nombre} {apellido}", email, telefono, "cliente",
                                      ciudad, hashear, activo=activo))
    return admin, propietarios, clientes


def construir_sedes_y_canchas(propietarios):
    sedes, canchas = [], []
    for spec in SEDES:
        propietario = propietarios[spec["propietario"]]
        dias_creada = 2 if spec["estado"] == "pendiente" else random.randint(90, 180)
        sede = {
            "_id": ObjectId(),
            "propietario_id": propietario["_id"],
            "nombre": spec["nombre"],
            "direccion": spec["direccion"],
            "ciudad": spec["ciudad"],
            "zona": spec["zona"],
            "ubicacion": {"type": "Point", "coordinates": list(spec["coordenadas"])},
            "horario": HORARIO,
            "servicios": spec["servicios"],
            "estado": spec["estado"],
            "fecha_creacion": momento(HOY - timedelta(days=dias_creada), 9),
        }
        sedes.append(sede)
        for nombre, deportes, superficie, techada, precio, pico, estado in spec["canchas"]:
            canchas.append({
                "_id": ObjectId(),
                "sede_id": sede["_id"],
                "propietario_id": propietario["_id"],
                "sede": {"nombre": sede["nombre"], "ciudad": sede["ciudad"], "zona": sede["zona"]},
                "nombre": nombre,
                "deportes": [{"deporte": d, "modalidad": m} for d, m in deportes],
                "superficie": superficie,
                "techada": techada,
                "iluminacion": True,
                "precio_hora": precio,
                "precio_hora_pico": pico,
                "estado": estado,
            })
    return sedes, canchas


def crear_reserva(cancha, sede, dia, horas, clientes_ciudad, ahora):
    organizador = random.choice(clientes_ciudad)
    eleccion = random.choice(cancha["deportes"])
    inicio = momento(dia, horas[0])
    pasada = dia < HOY

    # Precio: cada hora vale normal o pico (lo calcula el sistema, nunca el usuario)
    precio_total = sum(cancha["precio_hora_pico"] if h in HORA_PICO else cancha["precio_hora"]
                       for h in horas)

    creada = inicio - timedelta(days=random.randint(1, 10), hours=random.randint(0, 12))
    if creada > ahora:
        creada = ahora - timedelta(minutes=random.randint(5, 600))

    # Cancelacion: solo es valida con 24 h de anticipacion y antes de "ahora"
    cancelada = random.random() < (0.10 if pasada else 0.07)
    limite_cancelar = min(inicio - timedelta(hours=24), ahora)
    if cancelada and limite_cancelar <= creada:
        cancelada = False

    if cancelada:
        estado = "cancelada"
    elif pasada:
        estado = "finalizada"
    else:
        estado = "activa"

    reserva = {
        "_id": ObjectId(),
        "tipo": "reserva",
        "cancha_id": cancha["_id"],
        "propietario_id": cancha["propietario_id"],
        "usuario_id": organizador["_id"],
        "cancha": {"nombre": cancha["nombre"], "sede": sede["nombre"], "zona": sede["zona"]},
        "usuario": {"nombre": organizador["nombre"]},
        "deporte": eleccion["deporte"],
        "modalidad": eleccion["modalidad"],
        "fecha": dia.isoformat(),
        "hora_inicio": horas[0],
        "hora_fin": horas[-1] + 1,
        "franjas": [franja(dia, h) for h in horas],
        "precio_total": precio_total,
        "pago": {
            "metodo": random.choices(METODOS_PAGO, weights=PESOS_PAGO)[0],
            "valor": precio_total,
            "estado": "reembolsado" if cancelada else "pagado",
        },
        "estado": estado,
        "fecha_creacion": creada,
    }
    if cancelada:
        reserva["fecha_cancelacion"] = entre(creada, limite_cancelar)

    # Partido abierto (modelo B): el organizador ya pago todo; cada jugador que se une
    # paga su cuota y esa plata vuelve al organizador.
    cupos = JUGADORES[eleccion["modalidad"]]
    if cupos >= 4 and random.random() < 0.22:
        cuota = math.ceil(precio_total / cupos / 100) * 100
        maximo = cupos - 1  # el organizador ya ocupa un cupo
        candidatos = [c for c in clientes_ciudad if c["_id"] != organizador["_id"]]
        cantidad = random.randint(maximo // 2, maximo) if pasada else random.randint(0, maximo)
        cantidad = min(cantidad, len(candidatos))
        limite_unirse = min(inicio - timedelta(hours=2), ahora)
        if limite_unirse <= creada:
            cantidad = 0
        participantes = [
            {"usuario_id": c["_id"], "nombre": c["nombre"], "cuota_pagada": cuota,
             "fecha_union": entre(creada, limite_unirse)}
            for c in random.sample(candidatos, cantidad)
        ]
        if len(participantes) == maximo:
            estado_partido = "completo"
        elif cancelada or pasada:
            estado_partido = "cerrado"
        else:
            estado_partido = "abierto"
        reserva["partido_abierto"] = {
            "cupos_totales": cupos,
            "cuota": cuota,
            "estado": estado_partido,
            "participantes": sorted(participantes, key=lambda p: p["fecha_union"]),
        }
    return reserva


def construir_reservas(sedes, canchas, clientes, ahora):
    sedes_por_id = {s["_id"]: s for s in sedes}
    activos = [c for c in clientes if c["activo"]]
    por_ciudad = {
        ciudad: [c for c in activos if c["ciudad"] == ciudad]
        for ciudad in {c["ciudad"] for c in activos}
    }
    reservas = []
    ocupadas = set()  # (cancha_id, franja) ya tomadas: asi ninguna reserva se cruza

    for cancha in canchas:
        sede = sedes_por_id[cancha["sede_id"]]
        if sede["estado"] != "aprobada" or cancha["estado"] != "activa":
            continue
        popularidad = random.uniform(0.6, 1.3)
        for desplazamiento in range(-DIAS_ATRAS, DIAS_ADELANTE + 1):
            dia = HOY + timedelta(days=desplazamiento)
            abre, cierra = ABRE_CIERRA[DIAS_SEMANA[dia.weekday()]]
            fin_de_semana = dia.weekday() >= 5
            media = (1.3 if fin_de_semana else 0.55) * popularidad
            if desplazamiento > 0:
                media *= 0.5  # el futuro todavia se esta llenando
            cantidad = int(media) + (1 if random.random() < media - int(media) else 0)
            pesos = PESOS_FIN_DE_SEMANA if fin_de_semana else PESOS_ENTRE_SEMANA

            for _ in range(cantidad):
                for _intento in range(10):
                    hora = random.choices(list(pesos), weights=list(pesos.values()))[0]
                    duracion = 2 if random.random() < 0.3 else 1
                    horas = list(range(hora, hora + duracion))
                    if hora < abre or hora + duracion > cierra:
                        continue
                    claves = {(cancha["_id"], franja(dia, h)) for h in horas}
                    if claves & ocupadas:
                        continue
                    reserva = crear_reserva(cancha, sede, dia, horas, por_ciudad[sede["ciudad"]], ahora)
                    reservas.append(reserva)
                    if reserva["estado"] != "cancelada":
                        ocupadas |= claves
                    break
    return reservas, ocupadas


def construir_bloqueos(sedes, canchas, ocupadas, ahora):
    """Un bloqueo futuro por sede aprobada (mantenimiento, torneo...)."""
    bloqueos = []
    for sede in sedes:
        if sede["estado"] != "aprobada":
            continue
        opciones = [c for c in canchas if c["sede_id"] == sede["_id"] and c["estado"] == "activa"]
        cancha = random.choice(opciones)
        for _intento in range(20):
            dia = HOY + timedelta(days=random.randint(2, DIAS_ADELANTE))
            abre, _cierra = ABRE_CIERRA[DIAS_SEMANA[dia.weekday()]]
            horas = [abre, abre + 1]
            claves = {(cancha["_id"], franja(dia, h)) for h in horas}
            if claves & ocupadas:
                continue
            ocupadas |= claves
            bloqueos.append({
                "_id": ObjectId(),
                "tipo": "bloqueo",
                "cancha_id": cancha["_id"],
                "propietario_id": cancha["propietario_id"],
                "cancha": {"nombre": cancha["nombre"], "sede": sede["nombre"], "zona": sede["zona"]},
                "motivo": random.choice(MOTIVOS_BLOQUEO),
                "fecha": dia.isoformat(),
                "hora_inicio": horas[0],
                "hora_fin": horas[-1] + 1,
                "franjas": [franja(dia, h) for h in horas],
                "estado": "activa",
                "fecha_creacion": ahora - timedelta(hours=random.randint(1, 72)),
            })
            break
    return bloqueos


def construir_datos(hashear):
    """Arma todos los documentos en memoria. No se conecta a la base."""
    ahora = datetime.now(COLOMBIA)
    deportes = [{"_id": ObjectId(), **d, "activo": True} for d in DEPORTES]
    admin, propietarios, clientes = construir_usuarios(hashear)
    sedes, canchas = construir_sedes_y_canchas(propietarios)
    reservas, ocupadas = construir_reservas(sedes, canchas, clientes, ahora)
    bloqueos = construir_bloqueos(sedes, canchas, ocupadas, ahora)
    return {
        "deportes": deportes,
        "usuarios": [admin] + propietarios + clientes,
        "sedes": sedes,
        "canchas": canchas,
        "reservas": reservas + bloqueos,
    }


# ---------------------------------------------------------------
# 5. Programa principal
# ---------------------------------------------------------------
def main():
    if not URI:
        raise SystemExit("Falta MONGODB_URI en backend/.env")
    if not CLAVE_PRUEBA:
        raise SystemExit("Falta SEED_PASSWORD en backend/.env")

    print(f"Base destino: '{NOMBRE_BD}' en Atlas")
    print("ATENCION: se borraran TODOS los documentos de usuarios, deportes, sedes,")
    print("canchas y reservas (las colecciones, su validacion y sus indices se conservan).")
    if input("Escribe SI para continuar: ").strip() != "SI":
        print("Cancelado. No se borro nada.")
        return

    # Primero se arma todo en memoria: si algo falla aqui, no se ha borrado nada
    print("\nCifrando contrasenas con bcrypt y armando los datos...")
    datos = construir_datos(lambda: bcrypt.hashpw(CLAVE_PRUEBA.encode(), bcrypt.gensalt()).decode())

    cliente = MongoClient(URI)
    cliente.admin.command("ping")
    db = cliente[NOMBRE_BD]

    print("\n1) Vaciando colecciones")
    for nombre in ["reservas", "canchas", "sedes", "deportes", "usuarios"]:
        borrados = db[nombre].delete_many({}).deleted_count
        print(f"  - {nombre}: {borrados} documentos borrados")

    print("\n2) Insertando datos")
    for nombre in ["deportes", "usuarios", "sedes", "canchas", "reservas"]:
        db[nombre].insert_many(datos[nombre])
        print(f"  + {nombre}: {len(datos[nombre])} documentos")

    reservas = [r for r in datos["reservas"] if r["tipo"] == "reserva"]
    print("\n3) Resumen de reservas")
    for estado in ["finalizada", "activa", "cancelada"]:
        print(f"  {estado}: {sum(r['estado'] == estado for r in reservas)}")
    print(f"  partidos abiertos: {sum('partido_abierto' in r for r in reservas)}")
    print(f"  bloqueos: {len(datos['reservas']) - len(reservas)}")

    print("\nCuentas de prueba (contrasena: SEED_PASSWORD del .env):")
    print("  admin       -> admin@parche.co")
    print("  propietario -> laura.gomez@elgolazo.co")
    print(f"  cliente     -> {datos['usuarios'][5]['email']}")

    cliente.close()
    print("\nListo.")


if __name__ == "__main__":
    main()
