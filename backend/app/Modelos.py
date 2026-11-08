"""
Modelos.py
Forma de los datos que ENTRAN a la API (Pydantic). FastAPI los valida
automaticamente: si falta un campo o el tipo esta mal, responde 422
sin ejecutar la ruta.
"""
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

PATRON_EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
PATRON_HORA = r"^([01]\d|2[0-3]):00$"  # horas en punto: las reservas son por horas completas
Dia = Literal["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
Superficie = Literal["sintetica", "natural", "cemento", "madera", "arcilla", "acrilico"]


class EmpresaEntrada(BaseModel):
    razon_social: str = Field(min_length=2, max_length=120)
    nit: str = Field(min_length=5, max_length=20)


class RegistroEntrada(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    email: str = Field(pattern=PATRON_EMAIL, max_length=120)
    clave: str = Field(min_length=8, max_length=72)
    telefono: Optional[str] = Field(default=None, pattern=r"^3\d{9}$")
    ciudad: str = Field(min_length=2, max_length=60)
    # El rol admin NO se puede elegir al registrarse
    rol: Literal["cliente", "propietario"] = "cliente"
    empresa: Optional[EmpresaEntrada] = None


class LoginEntrada(BaseModel):
    email: str = Field(pattern=PATRON_EMAIL)
    clave: str = Field(min_length=1)


# ---------------------------------------------------------------
# Sedes y canchas (panel del propietario)
# ---------------------------------------------------------------
class HorarioDia(BaseModel):
    dia: Dia
    abre: str = Field(pattern=PATRON_HORA, examples=["06:00"])
    cierra: str = Field(pattern=PATRON_HORA, examples=["23:00"])


class SedeEntrada(BaseModel):
    nombre: str = Field(min_length=3, max_length=80)
    direccion: str = Field(min_length=5, max_length=120)
    ciudad: str = Field(min_length=2, max_length=60)
    zona: str = Field(min_length=2, max_length=60)
    latitud: float = Field(ge=-90, le=90, examples=[4.7215])
    longitud: float = Field(ge=-180, le=180, examples=[-74.0431])
    servicios: List[str] = []
    horario: Optional[List[HorarioDia]] = Field(default=None, max_length=7,
                                                description="Si no se envia, se usa el horario estandar")


class SedeActualizar(BaseModel):
    """Todos opcionales: solo se cambia lo que se envia."""
    nombre: Optional[str] = Field(default=None, min_length=3, max_length=80)
    direccion: Optional[str] = Field(default=None, min_length=5, max_length=120)
    ciudad: Optional[str] = Field(default=None, min_length=2, max_length=60)
    zona: Optional[str] = Field(default=None, min_length=2, max_length=60)
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)
    servicios: Optional[List[str]] = None
    horario: Optional[List[HorarioDia]] = Field(default=None, max_length=7)


class DeporteCancha(BaseModel):
    deporte: str = Field(examples=["Fútbol"])
    modalidad: str = Field(examples=["Fútbol 5"])


class CanchaEntrada(BaseModel):
    sede_id: str
    nombre: str = Field(min_length=2, max_length=60)
    deportes: List[DeporteCancha] = Field(min_length=1, max_length=5)
    superficie: Superficie
    techada: bool = False
    iluminacion: bool = True
    precio_hora: int = Field(ge=10000, le=2000000)
    precio_hora_pico: int = Field(ge=10000, le=2000000)


class CanchaActualizar(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=60)
    deportes: Optional[List[DeporteCancha]] = Field(default=None, min_length=1, max_length=5)
    superficie: Optional[Superficie] = None
    techada: Optional[bool] = None
    iluminacion: Optional[bool] = None
    precio_hora: Optional[int] = Field(default=None, ge=10000, le=2000000)
    precio_hora_pico: Optional[int] = Field(default=None, ge=10000, le=2000000)
    estado: Optional[Literal["activa", "mantenimiento"]] = None


# ---------------------------------------------------------------
# Reservas y bloqueos
# ---------------------------------------------------------------
PATRON_FECHA = r"^\d{4}-\d{2}-\d{2}$"


class ReservaEntrada(BaseModel):
    cancha_id: str
    fecha: str = Field(pattern=PATRON_FECHA, examples=["2026-11-12"])
    hora_inicio: int = Field(ge=0, le=23, examples=[19])
    horas: int = Field(default=1, ge=1, le=3, description="Duracion en horas completas")
    deporte: str = Field(examples=["Fútbol"])
    modalidad: str = Field(examples=["Fútbol 5"])
    metodo_pago: Literal["nequi", "daviplata", "tarjeta", "pse", "efectivo"] = "nequi"
    abierta: bool = Field(default=False, description="Partido abierto: otros pueden unirse pagando su cuota")


class BloqueoEntrada(BaseModel):
    cancha_id: str
    fecha: str = Field(pattern=PATRON_FECHA, examples=["2026-11-12"])
    hora_inicio: int = Field(ge=0, le=23, examples=[6])
    horas: int = Field(default=1, ge=1, le=12)
    motivo: str = Field(min_length=3, max_length=120, examples=["Mantenimiento de la grama"])
