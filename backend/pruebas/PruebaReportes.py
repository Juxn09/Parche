"""
Reportes: el desempate del reporte de deportes (unica edicion a un pipeline protegido).
Sin desempate, MongoDB no garantiza el orden de dos modalidades con las mismas reservas.
"""
from datetime import timedelta

from conftest import AHORA, db, token


def _reserva_pasada(datos, modalidad, deporte, dias_atras, hora):
    fecha = (AHORA.date() - timedelta(days=dias_atras)).isoformat()
    return {"tipo": "reserva", "cancha_id": datos["cancha_laura"]["_id"], "propietario_id": datos["laura"]["_id"],
            "usuario_id": datos["jugadores"][0]["_id"], "cancha": {"nombre": "Cancha 1", "sede": "El Golazo", "zona": "Chapinero"},
            "deporte": deporte, "modalidad": modalidad, "fecha": fecha, "hora_inicio": hora, "hora_fin": hora + 1,
            "franjas": [f"{fecha}T{hora:02d}"], "precio_total": 100000, "estado": "finalizada", "fecha_creacion": AHORA}


def prueba_reporte_de_deportes_desempata_alfabeticamente(cliente_http, datos):
    # Fútbol 5 = 3 reservas; Pádel dobles y Baloncesto 3x3 = 2 cada una (empate)
    docs = [_reserva_pasada(datos, "Pádel dobles", "Pádel", d, 9) for d in (1, 2)]
    docs += [_reserva_pasada(datos, "Fútbol 5", "Fútbol", d, 10) for d in (1, 2)]
    docs += [_reserva_pasada(datos, "Fútbol 5", "Fútbol", 3, 11)]  # Fútbol 5 = 3, Pádel dobles = 2
    db.reservas.insert_many(docs)
    db.reservas.insert_many([_reserva_pasada(datos, "Baloncesto 3x3", "Baloncesto", d, 12) for d in (1, 2)])  # empata con Pádel

    admin = token(datos["admin"])
    resultados = [cliente_http.get("/api/reportes/deportes", headers=admin).json() for _ in range(5)]
    orden = [(r["modalidad"], r["reservas"]) for r in resultados[0]]
    assert orden == [("Fútbol 5", 3), ("Baloncesto 3x3", 2), ("Pádel dobles", 2)]  # empate a 2: orden alfabético
    assert all(r == resultados[0] for r in resultados)  # siempre el mismo orden
    # Los totales no dependen del desempate
    assert sum(r["reservas"] for r in resultados[0]) == 7
