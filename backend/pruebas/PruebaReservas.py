"""
Reglas de reservas: precio pico, cruce de reservas (indice unico parcial),
bloqueos, concurrencia, cancelacion con 24 h y ciclo de vida a 'finalizada'.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import WriteError

from app.CicloDeVida import finalizar_reservas_pasadas
from app.Main import app
from conftest import AHORA, PASADO_MANANA, db, reserva, token


# ----------------------------- Precio -----------------------------
def prueba_precio_lo_calcula_el_servidor_con_hora_pico(cliente_http, datos):
    """5 p. m. es normal ($100.000) y 6 p. m. es pico ($130.000): 2 horas = $230.000."""
    r = cliente_http.post("/api/reservas", json=reserva(datos["cancha_laura"], 17, horas=2),
                          headers=token(datos["jugadores"][0]))
    assert r.status_code == 201, r.text
    assert r.json()["precio_total"] == 230000
    assert r.json()["franjas"] == [f"{PASADO_MANANA}T17", f"{PASADO_MANANA}T18"]


# ----------------------------- Cruces -----------------------------
def prueba_reserva_que_se_cruza_parcialmente_es_rechazada(cliente_http, datos):
    """7 a 9 p. m. ocupa 19 y 20: una de 8 a 9 p. m. se cruza en la franja 20 -> 409."""
    cancha = datos["cancha_laura"]
    assert cliente_http.post("/api/reservas", json=reserva(cancha, 19, horas=2),
                             headers=token(datos["jugadores"][0])).status_code == 201
    r = cliente_http.post("/api/reservas", json=reserva(cancha, 20), headers=token(datos["jugadores"][1]))
    assert r.status_code == 409
    assert "ocupado" in r.json()["detail"]


def prueba_misma_hora_en_otra_cancha_si_se_permite(cliente_http, datos):
    assert cliente_http.post("/api/reservas", json=reserva(datos["cancha_laura"], 19),
                             headers=token(datos["jugadores"][0])).status_code == 201
    assert cliente_http.post("/api/reservas", json=reserva(datos["cancha_andres"], 19),
                             headers=token(datos["jugadores"][1])).status_code == 201


def prueba_cancelar_libera_la_franja(cliente_http, datos):
    """El indice es PARCIAL (solo 'activa'): al cancelar, otra persona puede tomar esa hora."""
    cancha = datos["cancha_laura"]
    creada = cliente_http.post("/api/reservas", json=reserva(cancha, 19), headers=token(datos["jugadores"][0])).json()
    assert cliente_http.post(f"/api/reservas/{creada['_id']}/cancelar",
                             headers=token(datos["jugadores"][0])).status_code == 200
    assert cliente_http.post("/api/reservas", json=reserva(cancha, 19),
                             headers=token(datos["jugadores"][1])).status_code == 201


def prueba_bloqueo_y_reserva_no_se_cruzan_en_ningun_sentido(cliente_http, datos):
    cancha = datos["cancha_laura"]
    bloqueo = {"cancha_id": str(cancha["_id"]), "fecha": PASADO_MANANA, "hora_inicio": 8, "horas": 2,
               "motivo": "Mantenimiento de la grama"}
    assert cliente_http.post("/api/reservas/bloqueos", json=bloqueo, headers=token(datos["laura"])).status_code == 201
    # 1) un jugador no puede reservar una hora bloqueada
    assert cliente_http.post("/api/reservas", json=reserva(cancha, 9),
                             headers=token(datos["jugadores"][0])).status_code == 409
    # 2) el propietario no puede bloquear una hora ya reservada
    assert cliente_http.post("/api/reservas", json=reserva(cancha, 15),
                             headers=token(datos["jugadores"][0])).status_code == 201
    otro = {**bloqueo, "hora_inicio": 15, "horas": 1}
    assert cliente_http.post("/api/reservas/bloqueos", json=otro, headers=token(datos["laura"])).status_code == 409


def prueba_reservas_simultaneas_solo_una_gana(datos):
    """6 jugadores piden la misma hora AL MISMO TIEMPO: exactamente 1 obtiene 201 y los demas 409."""
    def intentar(jugador):
        with TestClient(app) as cli:
            return cli.post("/api/reservas", json=reserva(datos["cancha_laura"], 20), headers=token(jugador)).status_code

    with ThreadPoolExecutor(max_workers=6) as hilos:
        codigos = list(hilos.map(intentar, datos["jugadores"]))
    assert sorted(codigos) == [201] + [409] * 5
    assert db.reservas.count_documents({"estado": "activa"}) == 1


# ----------------------------- Reglas de tiempo -----------------------------
@pytest.mark.parametrize("fecha, hora, motivo", [
    (AHORA.date().isoformat(), 8, "pasado"),                             # hoy 8 a. m. ya paso (son las 10)
    ((AHORA.date() + timedelta(days=31)).isoformat(), 19, "anticipación"),  # mas de 30 dias
    (PASADO_MANANA, 23, "horario"),                                       # la sede cierra a las 11 p. m.
])
def prueba_no_se_reserva_en_el_pasado_ni_lejos_ni_fuera_de_horario(cliente_http, datos, fecha, hora, motivo):
    r = cliente_http.post("/api/reservas", json=reserva(datos["cancha_laura"], hora, fecha=fecha),
                          headers=token(datos["jugadores"][0]))
    assert r.status_code == 400
    assert motivo in r.json()["detail"].lower()


def prueba_cancelar_exige_24_horas(cliente_http, datos, monkeypatch):
    creada = cliente_http.post("/api/reservas", json=reserva(datos["cancha_laura"], 19),
                               headers=token(datos["jugadores"][0])).json()
    # Movemos el reloj a 10 horas antes del partido
    import app.routers.Reservas as Reservas
    monkeypatch.setattr(Reservas, "ahora", lambda: AHORA + timedelta(days=2, hours=-1))  # jueves 9 a. m.
    r = cliente_http.post(f"/api/reservas/{creada['_id']}/cancelar", headers=token(datos["jugadores"][0]))
    assert r.status_code == 409
    assert "24 horas" in r.json()["detail"]


def prueba_solo_el_organizador_cancela(cliente_http, datos):
    creada = cliente_http.post("/api/reservas", json=reserva(datos["cancha_laura"], 19),
                               headers=token(datos["jugadores"][0])).json()
    r = cliente_http.post(f"/api/reservas/{creada['_id']}/cancelar", headers=token(datos["jugadores"][1]))
    assert r.status_code == 404


# ----------------------------- Ciclo de vida -----------------------------
def prueba_finalizar_reservas_es_idempotente(datos):
    """Una reserva de ayer y una de hoy que ya termino pasan a 'finalizada'; la futura no. Repetir no cambia nada."""
    base = {"tipo": "reserva", "cancha_id": datos["cancha_laura"]["_id"], "propietario_id": datos["laura"]["_id"],
            "usuario_id": datos["jugadores"][0]["_id"], "cancha": {"nombre": "Cancha 1", "sede": "El Golazo", "zona": "Chapinero"},
            "estado": "activa", "fecha_creacion": AHORA}
    ayer = (AHORA.date() - timedelta(days=1)).isoformat()
    hoy = AHORA.date().isoformat()
    db.reservas.insert_many([
        {**base, "fecha": ayer, "hora_inicio": 19, "hora_fin": 20, "franjas": [f"{ayer}T19"]},
        {**base, "fecha": hoy, "hora_inicio": 8, "hora_fin": 9, "franjas": [f"{hoy}T08"]},     # termino a las 9
        {**base, "fecha": hoy, "hora_inicio": 18, "hora_fin": 19, "franjas": [f"{hoy}T18"]},   # aun no empieza
    ])
    assert finalizar_reservas_pasadas(db) == 2
    assert finalizar_reservas_pasadas(db) == 0  # idempotente
    assert db.reservas.count_documents({"estado": "activa"}) == 1


# ----------------------------- Validacion en la base -----------------------------
def prueba_la_base_rechaza_un_documento_invalido(datos):
    """$jsonSchema: aunque alguien se salte la API, MongoDB no acepta un rol inexistente."""
    with pytest.raises(WriteError):
        db.usuarios.insert_one({"nombre": "X", "email": "no-es-correo", "rol": "superman"})
