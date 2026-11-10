"""
Partidos abiertos: cupo, cuota y concurrencia al unirse (actualizacion atomica).
Pádel dobles = 4 jugadores: el organizador + 3 cupos libres.
"""
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.Main import app
from conftest import db, reserva, token


def _abrir_partido(cliente_http, datos):
    cuerpo = reserva(datos["cancha_laura"], 19, deporte="Pádel", modalidad="Pádel dobles", abierta=True)
    r = cliente_http.post("/api/reservas", json=cuerpo, headers=token(datos["jugadores"][0]))
    assert r.status_code == 201, r.text
    return r.json()


def prueba_cuota_es_precio_entre_jugadores_redondeada(cliente_http, datos):
    partido = _abrir_partido(cliente_http, datos)
    pa = partido["partido_abierto"]
    assert pa["cupos_totales"] == 4
    assert pa["cuota"] == 32500  # $130.000 (hora pico) / 4 = $32.500


def prueba_no_se_supera_el_cupo_ni_se_repite_jugador(cliente_http, datos):
    partido = _abrir_partido(cliente_http, datos)
    ruta = f"/api/partidos/{partido['_id']}/unirse"
    j = datos["jugadores"]
    assert cliente_http.post(ruta, headers=token(j[0])).status_code == 409      # el organizador no se une
    assert cliente_http.post(ruta, headers=token(j[1])).status_code == 200
    assert cliente_http.post(ruta, headers=token(j[1])).status_code == 409      # no se repite
    assert cliente_http.post(ruta, headers=token(j[2])).status_code == 200
    assert cliente_http.post(ruta, headers=token(j[3])).status_code == 200      # se llena
    lleno = cliente_http.post(ruta, headers=token(j[4]))
    assert lleno.status_code == 409 and "completo" in lleno.json()["detail"]
    guardado = db.reservas.find_one({"tipo": "reserva"})
    assert len(guardado["partido_abierto"]["participantes"]) == 3
    assert guardado["partido_abierto"]["estado"] == "completo"


def prueba_union_simultanea_respeta_el_cupo(cliente_http, datos):
    """5 jugadores se unen AL MISMO TIEMPO a 3 cupos: exactamente 3 lo logran."""
    partido = _abrir_partido(cliente_http, datos)

    def unirse(jugador):
        with TestClient(app) as cli:
            return cli.post(f"/api/partidos/{partido['_id']}/unirse", headers=token(jugador)).status_code

    with ThreadPoolExecutor(max_workers=5) as hilos:
        codigos = list(hilos.map(unirse, datos["jugadores"][1:6]))
    assert codigos.count(200) == 3 and codigos.count(409) == 2
    assert len(db.reservas.find_one({"tipo": "reserva"})["partido_abierto"]["participantes"]) == 3


def prueba_salir_devuelve_el_cupo(cliente_http, datos):
    partido = _abrir_partido(cliente_http, datos)
    j = datos["jugadores"]
    for jugador in j[1:4]:
        cliente_http.post(f"/api/partidos/{partido['_id']}/unirse", headers=token(jugador))
    r = cliente_http.post(f"/api/partidos/{partido['_id']}/salir", headers=token(j[1]))
    assert r.status_code == 200 and r.json()["reembolso"] is True  # faltan mas de 24 h
    assert db.reservas.find_one({"tipo": "reserva"})["partido_abierto"]["estado"] == "abierto"
    assert cliente_http.post(f"/api/partidos/{partido['_id']}/unirse", headers=token(j[4])).status_code == 200


def prueba_modalidad_de_menos_de_4_no_abre_partido(cliente_http, datos):
    cuerpo = reserva(datos["cancha_laura"], 19, deporte="Pádel", modalidad="Pádel individual", abierta=True)
    # Pádel individual no la ofrece la cancha de Laura en el escenario: primero se la agregamos
    db.canchas.update_one({"_id": datos["cancha_laura"]["_id"]},
                          {"$push": {"deportes": {"deporte": "Pádel", "modalidad": "Pádel individual"}}})
    r = cliente_http.post("/api/reservas", json=cuerpo, headers=token(datos["jugadores"][0]))
    assert r.status_code == 400 and "al menos 4" in r.json()["detail"]


def prueba_partido_finalizado_rechaza_unirse_salir_y_cancelar_con_mensaje_claro(cliente_http, datos, monkeypatch):
    """Despues de jugarse y pasar a 'finalizada', ninguna accion lo modifica y el motivo es claro."""
    from datetime import timedelta

    import app.CicloDeVida as CicloDeVida
    from app.CicloDeVida import finalizar_reservas_pasadas
    from conftest import AHORA

    partido = _abrir_partido(cliente_http, datos)
    j = datos["jugadores"]
    cliente_http.post(f"/api/partidos/{partido['_id']}/unirse", headers=token(j[1]))
    # El reloj avanza al dia siguiente del partido y se finaliza
    despues = AHORA + timedelta(days=3)
    monkeypatch.setattr(CicloDeVida, "ahora", lambda: despues)
    assert finalizar_reservas_pasadas(db) == 1
    assert db.reservas.find_one({"tipo": "reserva"})["estado"] == "finalizada"

    r = cliente_http.post(f"/api/partidos/{partido['_id']}/unirse", headers=token(j[2]))
    assert r.status_code == 409 and r.json()["detail"] == "Este partido ya se jugó"
    r = cliente_http.post(f"/api/partidos/{partido['_id']}/salir", headers=token(j[1]))
    assert r.status_code == 409 and r.json()["detail"] == "Este partido ya se jugó: ya no puedes salirte"
    r = cliente_http.post(f"/api/reservas/{partido['_id']}/cancelar", headers=token(j[0]))
    assert r.status_code == 409 and r.json()["detail"] == "Esta reserva ya se jugó: no se puede cancelar"
    # Sigue apareciendo en Mis reservas, con su estado, para que la interfaz la muestre en "Jugadas"
    mias = cliente_http.get("/api/reservas/mias", headers=token(j[0])).json()
    assert [m["estado"] for m in mias] == ["finalizada"]
    # Y el participante tambien la ve
    assert [m["estado"] for m in cliente_http.get("/api/reservas/mias", headers=token(j[1])).json()] == ["finalizada"]


def prueba_partido_cancelado_explica_el_motivo(cliente_http, datos):
    partido = _abrir_partido(cliente_http, datos)
    j = datos["jugadores"]
    cliente_http.post(f"/api/partidos/{partido['_id']}/unirse", headers=token(j[1]))
    assert cliente_http.post(f"/api/reservas/{partido['_id']}/cancelar", headers=token(j[0])).status_code == 200
    r = cliente_http.post(f"/api/partidos/{partido['_id']}/unirse", headers=token(j[2]))
    assert r.status_code == 409 and r.json()["detail"] == "El organizador canceló este partido"
    r = cliente_http.post(f"/api/reservas/{partido['_id']}/cancelar", headers=token(j[0]))
    assert r.status_code == 409 and r.json()["detail"] == "Esta reserva ya fue cancelada"
