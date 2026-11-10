"""
FinalizarReservas.py
Pasa a 'finalizada' las reservas y bloqueos activos que ya terminaron.
No borra nada y se puede ejecutar las veces que se quiera (idempotente).

Uso (desde la carpeta backend, con el .venv activo):
    python scripts/FinalizarReservas.py           # solo cuenta cuantas cambiaria
    python scripts/FinalizarReservas.py --aplicar # las cambia
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # para importar app.*

from app.BaseDatos import db  # noqa: E402
from app.CicloDeVida import filtro_terminadas, finalizar_reservas_pasadas  # noqa: E402
from app.Utilidades import ahora  # noqa: E402


def main():
    pendientes = db.reservas.count_documents(filtro_terminadas(ahora()))
    print(f"Reservas y bloqueos activos que ya terminaron: {pendientes}")
    if "--aplicar" not in sys.argv:
        print("Modo de prueba: no se cambio nada. Agrega --aplicar para marcarlas como 'finalizada'.")
        return
    print(f"Marcadas como 'finalizada': {finalizar_reservas_pasadas(db)}")


if __name__ == "__main__":
    main()
