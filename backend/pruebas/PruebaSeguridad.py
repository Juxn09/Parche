"""
Autenticacion, roles, aislamiento multi-tenant y moderacion del admin.
"""
from conftest import PASADO_MANANA, db, reserva, token


# ----------------------------- Autenticacion y roles -----------------------------
def prueba_sin_token_401_y_rol_equivocado_403(cliente_http, datos):
    assert cliente_http.get("/api/propietario/sedes").status_code == 401
    assert cliente_http.get("/api/propietario/sedes", headers=token(datos["jugadores"][0])).status_code == 403
    assert cliente_http.get("/api/reportes/zonas", headers=token(datos["laura"])).status_code == 403
    assert cliente_http.get("/api/propietario/sedes", headers=token(datos["laura"])).status_code == 200


def prueba_token_falso_y_usuario_desactivado(cliente_http, datos):
    assert cliente_http.get("/api/auth/yo", headers={"Authorization": "Bearer a.b.c"}).status_code == 401
    jugador = datos["jugadores"][0]
    db.usuarios.update_one({"_id": jugador["_id"]}, {"$set": {"activo": False}})
    # El token sigue firmado y vigente, pero la API consulta al usuario en cada peticion
    assert cliente_http.get("/api/auth/yo", headers=token(jugador)).status_code == 401


def prueba_nadie_se_registra_como_admin_y_el_error_va_en_espanol(cliente_http):
    r = cliente_http.post("/api/auth/registro", json={"nombre": "Ana", "email": "ana@prueba.co",
                                                       "clave": "12345678", "ciudad": "Bogotá", "rol": "admin"})
    assert r.status_code == 422
    assert r.json()["detail"] == "El tipo de cuenta debe ser una de estas opciones: cliente o propietario"
    assert db.usuarios.count_documents({"email": "ana@prueba.co"}) == 0


def prueba_correo_repetido_409_por_indice_unico(cliente_http):
    cuerpo = {"nombre": "Ana", "email": "ana@prueba.co", "clave": "12345678", "ciudad": "Bogotá"}
    assert cliente_http.post("/api/auth/registro", json=cuerpo).status_code == 201
    assert cliente_http.post("/api/auth/registro", json={**cuerpo, "email": "ANA@prueba.co"}).status_code == 409


# ----------------------------- Multi-tenant -----------------------------
def prueba_un_propietario_no_ve_ni_toca_lo_de_otro(cliente_http, datos):
    cancha_ajena = str(datos["cancha_laura"]["_id"])
    andres = token(datos["andres"])
    # No la ve en su lista
    ids = [c["_id"] for c in cliente_http.get("/api/propietario/canchas", headers=andres).json()]
    assert cancha_ajena not in ids
    # No la puede editar ni borrar: 404, como si no existiera
    assert cliente_http.put(f"/api/propietario/canchas/{cancha_ajena}", json={"precio_hora": 10000},
                            headers=andres).status_code == 404
    assert cliente_http.delete(f"/api/propietario/canchas/{cancha_ajena}", headers=andres).status_code == 404
    # No puede bloquear horas en ella
    bloqueo = {"cancha_id": cancha_ajena, "fecha": PASADO_MANANA, "hora_inicio": 8, "horas": 1, "motivo": "Intento ajeno"}
    assert cliente_http.post("/api/reservas/bloqueos", json=bloqueo, headers=andres).status_code == 404
    # El precio de Laura sigue igual
    assert db.canchas.find_one({"_id": datos["cancha_laura"]["_id"]})["precio_hora"] == 100000


def prueba_la_agenda_solo_trae_reservas_propias(cliente_http, datos):
    cliente_http.post("/api/reservas", json=reserva(datos["cancha_laura"], 19), headers=token(datos["jugadores"][0]))
    agenda_andres = cliente_http.get("/api/reservas/propietario", headers=token(datos["andres"])).json()
    agenda_laura = cliente_http.get("/api/reservas/propietario", headers=token(datos["laura"])).json()
    assert agenda_andres == [] and len(agenda_laura) == 1


# ----------------------------- Moderacion -----------------------------
def prueba_canchas_de_propietario_inactivo_no_se_muestran_ni_reservan(cliente_http, datos):
    db.usuarios.update_one({"_id": datos["laura"]["_id"]}, {"$set": {"activo": False}})
    nombres = [c["sede"]["nombre"] for c in cliente_http.get("/api/canchas").json()["resultados"]]
    assert "El Golazo" not in nombres and "La Bombonera" in nombres
    assert cliente_http.get(f"/api/canchas/{datos['cancha_laura']['_id']}").status_code == 404
    assert cliente_http.post("/api/reservas", json=reserva(datos["cancha_laura"], 19),
                             headers=token(datos["jugadores"][0])).status_code == 404


def prueba_rechazar_sede_con_reservas_futuras_pide_confirmacion(cliente_http, datos):
    cliente_http.post("/api/reservas", json=reserva(datos["cancha_laura"], 19), headers=token(datos["jugadores"][0]))
    ruta = f"/api/admin/sedes/{datos['sede_laura']['_id']}/rechazar"
    admin = token(datos["admin"])
    advertencia = cliente_http.post(ruta, json={"motivo": "Documentos incompletos"}, headers=admin)
    assert advertencia.status_code == 409 and "1 reserva activa" in advertencia.json()["detail"]
    assert db.sedes.find_one({"_id": datos["sede_laura"]["_id"]})["estado"] == "aprobada"
    confirmada = cliente_http.post(ruta, json={"motivo": "Documentos incompletos", "confirmar": True}, headers=admin)
    assert confirmada.status_code == 200 and confirmada.json()["estado"] == "rechazada"
    # La reserva existente se respeta
    assert db.reservas.count_documents({"estado": "activa"}) == 1


def prueba_sede_sin_reservas_se_rechaza_directo(cliente_http, datos):
    r = cliente_http.post(f"/api/admin/sedes/{datos['sede_andres']['_id']}/rechazar",
                          json={"motivo": "Dirección inexistente"}, headers=token(datos["admin"]))
    assert r.status_code == 200
