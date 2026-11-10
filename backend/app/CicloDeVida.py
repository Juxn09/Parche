"""
CicloDeVida.py
Una reserva (o bloqueo) nace 'activa' y termina 'cancelada' o 'finalizada'.
Esta funcion pasa a 'finalizada' las que ya terminaron segun la hora del SERVIDOR.

- Es IDEMPOTENTE: ejecutarla dos veces da el mismo resultado (la segunda no cambia nada),
  porque solo toca documentos que todavia estan 'activa'.
- No cambia el indice unico: al dejar de ser 'activa', la reserva sale del indice parcial,
  pero sus franjas ya pasaron, asi que no libera nada que alguien pueda reservar.
- Los reportes no cambian: cuentan 'activa' y 'finalizada' juntas como reservas jugadas.

Se ejecuta desde la ruta del admin POST /api/admin/mantenimiento/finalizar-reservas
o con el script backend/scripts/FinalizarReservas.py.
"""
from datetime import datetime, timezone

from app.Utilidades import ahora


def filtro_terminadas(momento_actual: datetime) -> dict:
    """Activas cuya fecha ya paso, o que son de hoy y su hora de fin ya llego."""
    hoy = momento_actual.date().isoformat()
    return {
        "estado": "activa",
        "$or": [
            {"fecha": {"$lt": hoy}},
            {"fecha": hoy, "hora_fin": {"$lte": momento_actual.hour}},
        ],
    }


def finalizar_reservas_pasadas(db) -> int:
    """Marca como 'finalizada' toda reserva o bloqueo activo que ya termino. Devuelve cuantos cambio."""
    resultado = db.reservas.update_many(
        filtro_terminadas(ahora()),
        {"$set": {"estado": "finalizada", "fecha_finalizacion": datetime.now(timezone.utc)}},
    )
    return resultado.modified_count
