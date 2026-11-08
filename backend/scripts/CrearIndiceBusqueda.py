"""
CrearIndiceBusqueda.py
Crea (o actualiza) el indice de Atlas Search "busqueda_canchas" sobre la coleccion canchas.

Atlas Search es un motor de busqueda (Apache Lucene) que vive junto al cluster de Atlas.
A diferencia de $regex, entiende palabras: tolera errores de escritura ("golaso" -> Golazo),
ignora tildes y mayusculas ("fontibon" -> Fontibón) y ordena por relevancia.

Uso (desde la carpeta backend, con el .venv activo):
    python scripts/CrearIndiceBusqueda.py

No borra datos. Se puede ejecutar varias veces: si el indice ya existe, lo actualiza.
Atlas tarda alrededor de un minuto en construirlo; el script espera hasta que este listo.
"""
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.operations import SearchIndexModel

RUTA_ENV = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(RUTA_ENV)

URI = os.getenv("MONGODB_URI")
NOMBRE_BD = os.getenv("MONGODB_DB", "parche")
NOMBRE_INDICE = "busqueda_canchas"

# Que campos se indexan y como se "entienden" las palabras.
DEFINICION = {
    # Analizador propio: parte el texto en palabras, pasa a minusculas y quita tildes
    # (icuFolding convierte "Fontibón" en "fontibon"). Se usa al guardar y al buscar.
    "analyzer": "espanol_sin_tildes",
    "searchAnalyzer": "espanol_sin_tildes",
    "analyzers": [
        {
            "name": "espanol_sin_tildes",
            "tokenizer": {"type": "standard"},
            "tokenFilters": [{"type": "lowercase"}, {"type": "icuFolding"}],
        }
    ],
    # dynamic: False -> solo se indexan los campos listados (indice pequeno y rapido)
    "mappings": {
        "dynamic": False,
        "fields": {
            "nombre": {"type": "string"},
            "sede": {
                "type": "document",
                "fields": {
                    "nombre": {"type": "string"},
                    "zona": {"type": "string"},
                    "ciudad": {"type": "string"},
                },
            },
            "deportes": {
                "type": "document",
                "fields": {
                    "deporte": {"type": "string"},
                    "modalidad": {"type": "string"},
                },
            },
        },
    },
}


def main():
    if not URI:
        raise SystemExit("Falta MONGODB_URI en backend/.env")

    cliente = MongoClient(URI)
    cliente.admin.command("ping")
    canchas = cliente[NOMBRE_BD]["canchas"]
    print(f"Conectado a la base '{NOMBRE_BD}' en Atlas")

    existentes = {i["name"] for i in canchas.list_search_indexes()}
    if NOMBRE_INDICE in existentes:
        canchas.update_search_index(NOMBRE_INDICE, DEFINICION)
        print(f"Indice '{NOMBRE_INDICE}' actualizado")
    else:
        canchas.create_search_index(SearchIndexModel(definition=DEFINICION, name=NOMBRE_INDICE))
        print(f"Indice '{NOMBRE_INDICE}' creado")

    print("Esperando a que Atlas lo construya", end="", flush=True)
    for _ in range(60):  # hasta 5 minutos
        indice = next(iter(canchas.list_search_indexes(NOMBRE_INDICE)), None)
        if indice and indice.get("queryable") and indice.get("status") == "READY":
            print(f"\nListo: estado {indice['status']}, ya se puede buscar con $search")
            break
        print(".", end="", flush=True)
        time.sleep(5)
    else:
        print("\nAtlas sigue construyendolo. Revisa en Atlas -> Search & Vector Search en unos minutos.")

    # Prueba rapida: una busqueda con error de escritura
    prueba = list(canchas.aggregate([
        {"$search": {"index": NOMBRE_INDICE, "text": {
            "query": "golaso", "path": ["nombre", "sede.nombre", "sede.zona"],
            "fuzzy": {"maxEdits": 1}}}},
        {"$limit": 3},
        {"$project": {"_id": 0, "nombre": 1, "sede": "$sede.nombre"}},
    ]))
    print(f"Prueba 'golaso' -> {prueba}")
    cliente.close()


if __name__ == "__main__":
    main()
