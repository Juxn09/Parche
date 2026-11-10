"""
Paginacion de GET /api/canchas con saltar/limite ("Cargar mas"): sin repetir ni perder canchas,
aun con empates de precio y nombre, y con cualquier filtro.
"""
from datetime import datetime, timezone

import pytest

from conftest import db


@pytest.fixture
def muchas_canchas(datos):
    """25 canchas mas en la sede de Laura, con muchos EMPATES: mismo nombre y mismo precio."""
    base = {k: v for k, v in datos["cancha_laura"].items() if k != "_id"}
    db.canchas.insert_many([
        {**base, "nombre": f"Cancha {1 + i % 3}", "precio_hora": 90000 + 10000 * (i % 2),
         "techada": i % 4 == 0, "superficie": "sintetica"}
        for i in range(25)
    ])
    return db.canchas.count_documents({"estado": "activa"})


def _todas_por_paginas(cliente_http, tamano, **filtros):
    vistas, saltar, total = [], 0, None
    while True:
        r = cliente_http.get("/api/canchas", params={**filtros, "limite": tamano, "saltar": saltar}).json()
        total = r["total"]
        vistas += [c["_id"] for c in r["resultados"]]
        saltar += tamano
        if saltar >= total:
            return vistas, total


@pytest.mark.parametrize("tamano", [1, 4, 7, 20])
@pytest.mark.parametrize("orden", ["precio", "nombre"])
def prueba_cargar_mas_no_repite_ni_pierde(cliente_http, muchas_canchas, tamano, orden):
    vistas, total = _todas_por_paginas(cliente_http, tamano, orden=orden)
    assert total == muchas_canchas == 27
    assert len(vistas) == len(set(vistas)) == total  # ni repetidas ni perdidas
    # Y en el mismo orden que pedir todo de una vez
    todo = [c["_id"] for c in cliente_http.get("/api/canchas", params={"orden": orden, "limite": 100}).json()["resultados"]]
    assert vistas == todo


def prueba_cargar_mas_con_filtro(cliente_http, muchas_canchas):
    """Al cambiar de filtro se empieza de cero: las paginas del filtro tampoco repiten ni pierden."""
    vistas, total = _todas_por_paginas(cliente_http, 3, techada="true")
    assert total == db.canchas.count_documents({"estado": "activa", "techada": True})
    assert len(vistas) == len(set(vistas)) == total
