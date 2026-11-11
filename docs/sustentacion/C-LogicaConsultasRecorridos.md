# Parte C — Lógica de negocio, consultas y recorridos de código

Todo con archivo y línea del repositorio (rama `main`, commit de esta guía). Las pruebas están en `backend/pruebas/`. "Sin prueba" significa que ninguna de las 54 pruebas la cubre: se comprobó leyendo el código o a mano.

# C1. Reglas de negocio

Formato de cada regla: **enunciado** · capa · dónde · código clave · prueba · respuesta al violarla · demo.

### R1. Dos reservas activas no pueden ocupar la misma hora de la misma cancha
- **Capa:** base de datos (índice) + API (traduce el error). La interfaz solo orienta (deshabilita horas ocupadas).
- **Dónde:** índice en `backend/scripts/CrearColecciones.py:249`; inserción en `backend/app/routers/Reservas.py:131-135`.
```python
try:
    reserva["_id"] = db.reservas.insert_one(reserva).inserted_id
except DuplicateKeyError:
    # El indice unico detecto que alguna franja ya esta tomada (reserva o bloqueo activo)
    raise _horario_ocupado()
```
- **Pruebas:** `PruebaReservas.py:28` (cruce parcial), `:70` (6 a la vez, gana una), `:38` (otra cancha sí se permite).
- **Al violarla:** 409 "Ese horario ya está ocupado en esta cancha".
- **Demo:** `/docs`, reservar una hora "Ocupada" (evidencia E7).

### R2. Reservas y bloqueos tampoco se cruzan entre sí
- **Capa:** base (el mismo índice: un bloqueo es un documento de `reservas` con `tipo: "bloqueo"`).
- **Dónde:** `Reservas.py:221-250`; el mensaje del bloqueo en `:247-249`.
- **Prueba:** `PruebaReservas.py:55` (en los dos sentidos).
- **Al violarla:** reservar sobre un bloqueo → 409 "Ese horario ya está ocupado…"; bloquear sobre una reserva → 409 "Ya hay una reserva o bloqueo en esas horas".
- **Demo:** Mi panel → Agenda → bloquear una hora ya reservada.

### R3. Solo dentro del horario de la sede, nunca en el pasado ni a más de 30 días
- **Capa:** API, con la hora del **servidor** (Bogotá). La interfaz solo muestra horas válidas.
- **Dónde:** `Reservas.py:47-63`.
```python
if inicio <= ahora():
    raise HTTPException(400, "No puedes reservar en el pasado")
if dia > ahora().date() + timedelta(days=DIAS_MAXIMOS_ANTICIPACION):
    raise HTTPException(400, f"Solo se puede reservar con máximo {DIAS_MAXIMOS_ANTICIPACION} días de anticipación")
horario = horario_del_dia(sede, dia)
if horario is None:
    raise HTTPException(400, "La sede no abre ese día")
```
- **Prueba:** `PruebaReservas.py:83-88` (parametrizada: pasado, lejos, fuera de horario).
- **Al violarla:** 400 con el motivo ("No puedes reservar en el pasado", "Solo se puede reservar con máximo 30 días de anticipación", "La sede no abre ese día", "Fuera del horario de la sede (06:00 a 23:00)").
- **Demo:** `/docs` con una fecha pasada.

### R4. El precio lo calcula el servidor; la hora pico cuesta más
- **Capa:** API.
- **Dónde:** `backend/app/Utilidades.py:15` (`HORA_PICO = range(18, 22)`: franjas que empiezan de 6 a 9 p. m.) y `:61-62`; suma en `Reservas.py:94`.
```python
def precio_de_hora(cancha: dict, hora: int) -> int:
    return cancha["precio_hora_pico"] if hora in HORA_PICO else cancha["precio_hora"]
```
- **Prueba:** `PruebaReservas.py:18`.
- **Al violarla:** no aplica: el cuerpo no tiene precio, así que no se puede manipular. Además, al crear o editar una cancha, el precio pico no puede ser menor que el normal → 400 (`Propietario.py:69-72`).
- **Demo:** reservar una hora con "Pico" y ver el total.

### R5. Cancelar: solo el organizador, solo activas y con al menos 24 h
- **Capa:** API; la base garantiza que dos cancelaciones simultáneas no se pisen (el filtro exige `estado: "activa"`).
- **Dónde:** `Reservas.py:156-187`.
```python
inicio = momento(leer_fecha(reserva["fecha"]), reserva["hora_inicio"])
if inicio - ahora() < timedelta(hours=HORAS_MINIMAS_CANCELAR):
    raise HTTPException(409, f"Solo puedes cancelar con al menos {HORAS_MINIMAS_CANCELAR} horas de anticipación")
actualizada = db.reservas.find_one_and_update(
    {"_id": reserva["_id"], "estado": "activa"}, {"$set": cambios}, return_document=ReturnDocument.AFTER)
```
- **Pruebas:** `PruebaReservas.py:95` (24 h), `:106` (solo el organizador), `:45` (cancelar libera la franja).
- **Al violarla:** reserva ajena → 404 "Reserva no encontrada"; menos de 24 h → 409; ya finalizada → 409 "Esta reserva ya se jugó: no se puede cancelar"; ya cancelada → 409 "Esta reserva ya fue cancelada".
- **Efectos:** `estado → cancelada`, `pago.estado → reembolsado`, `partido_abierto.estado → cerrado` (`:171-177`).
- **Demo:** Mis reservas → Cancelar (en una reserva de pasado mañana).

### R6. Partido abierto: mínimo de jugadores, cuota y cupos
- **Capa:** API al crear; base (operación atómica) al unirse.
- **Dónde:** creación en `Reservas.py:115-129`; unirse en `backend/app/routers/Partidos.py:70-126`; salir en `:129-151`.
- **Reglas:**
  - Solo modalidades de **4 o más jugadores** (`MINIMO_JUGADORES_PARTIDO_ABIERTO`, `Reservas.py:29`) → si no, 400.
  - **Cuota** = `precio_total / cupos`, redondeada hacia arriba a la centena (`Reservas.py:126`).
  - **Unirse hasta 2 h antes** (`Partidos.py:23`, `:79-83`) → si no, 409 "Ya no puedes unirte: faltan menos de 2 horas".
  - **Cupo atómico:** una sola `find_one_and_update` exige que el partido siga abierto, que no seas el organizador, que no estés ya unido y que haya cupo (`Partidos.py:90-104`):
```python
actualizado = db.reservas.find_one_and_update(
    {"_id": rid, "estado": "activa", "partido_abierto.estado": "abierto",
     "usuario_id": {"$ne": usuario["_id"]},
     "partido_abierto.participantes.usuario_id": {"$ne": usuario["_id"]},
     "$expr": {"$lt": [{"$size": "$partido_abierto.participantes"},
                       {"$subtract": ["$partido_abierto.cupos_totales", 1]}]}},
    {"$push": {"partido_abierto.participantes": participante}},
    return_document=ReturnDocument.AFTER)
```
  - Si se llena → `completo` (`:118-123`).
  - **Salir:** se permite mientras no haya empezado; la cuota se devuelve **solo con 24 h o más** (`HORAS_REEMBOLSO_AL_SALIR`, `:24`, `:142`); al salir vuelve a `abierto` (`:144-148`).
- **Pruebas:** `PruebaPartidos.py:20` (cuota), `:27` (cupo y no repetir), `:43` (uniones simultáneas), `:57` (salir devuelve el cupo), `:68` (menos de 4 no abre). **Sin prueba:** el límite de 2 h y el reembolso de 24 h al salir.
- **Al violarla:** 409 con el motivo exacto: "Eres el organizador de este partido", "Ya estás en este partido", "El partido ya está completo", "El partido ya no está disponible".
- **Demo:** Partidos abiertos → Unirme (escribe en Atlas; revertir con "Salir").

### R7. Ciclo de vida: una reserva que ya terminó pasa a `finalizada`
- **Capa:** API (función idempotente), ejecutada a mano.
- **Dónde:** `backend/app/CicloDeVida.py:20-38`; ruta `backend/app/routers/Admin.py:109-112`; script `backend/scripts/FinalizarReservas.py`.
```python
return {"estado": "activa", "$or": [
    {"fecha": {"$lt": hoy}},
    {"fecha": hoy, "hora_fin": {"$lte": momento_actual.hour}}]}
```
- **Pruebas:** `PruebaReservas.py:114` (idempotente), `PruebaPartidos.py:77` y `:107` (mensajes claros).
- **Al violarla:** unirse, salir o cancelar una finalizada → 409 "Este partido ya se jugó" / "Esta reserva ya se jugó…".
- **Demo:** `python scripts/FinalizarReservas.py` (sin `--aplicar` solo cuenta; no escribe).

### R8. Estados de la sede: solo las aprobadas aparecen
- **Capa:** API.
- **Dónde:** creación `pendiente` (`Propietario.py:113`); búsqueda solo aprobadas (`Canchas.py:56-58` y `:80`); aprobar (`Admin.py:48-51`); rechazar con motivo de al menos 5 caracteres (`:63-80`); corregir una rechazada la devuelve a `pendiente` (`Propietario.py:134-135`).
- **Rechazo con reservas futuras:** responde 409 y pide reenviar con `confirmar: true`; las reservas existentes se respetan (`Admin.py:72-79`).
- **Pruebas:** `PruebaSeguridad.py:72` y `:85`; `PruebaLibresHoy.py:90` (no incluye canchas que no se muestran).
- **Al violarla:** cancha de sede no aprobada → 404 "Cancha no encontrada".
- **Demo:** buscar `zona=Fontibón` (0) → aprobar como admin → aparecen (escribe en Atlas).

### R9. Propietario desactivado: sus canchas desaparecen
- **Capa:** API.
- **Dónde:** `Utilidades.py:56` (`propietarios_inactivos()`), usado en la búsqueda (`Canchas.py:81`), el detalle (`:196-197`), libres-hoy (`:157`) y al reservar (`Reservas.py:37-38`).
- **Prueba:** `PruebaSeguridad.py:63`.
- **Al violarla:** 404 "Cancha no encontrada". Además, su token deja de servir: 401 (`Seguridad.py:79-81`) y su login → 403 "Tu cuenta está desactivada" (`Auth.py:70-71`).
- **Demo:** Administración → Usuarios → desactivar (escribe en Atlas; revertir activando).

### R10. Aislamiento entre propietarios (multi-tenant)
- **Capa:** API.
- **Dónde:** `Propietario.py:32-44` (`_mi_sede`, `_mi_cancha` filtran por el `propietario_id` del **token**); reportes en `Reportes.py:44-48`; agenda en `Reservas.py:203`.
- **Pruebas:** `PruebaSeguridad.py:38` y `:55`.
- **Al violarla:** 404, como si no existiera.

### R11. Roles y permisos
- **Capa:** API (`Depends(requiere_rol(...))`).
- **Dónde:** `backend/app/Seguridad.py:65-97`; ver el diagrama D4.
- **Pruebas:** `PruebaSeguridad.py:8` (401 y 403), `:15` (token falso y usuario desactivado).
- **Al violarla:** 401 "Debes iniciar sesión" / "Token inválido" / "Tu sesión expiró…"; 403 "No tienes permiso para esta acción".

### R12. Registro: rol, correo único y empresa del propietario
- **Capa:** Pydantic (rol), API (empresa) y base (correo único).
- **Dónde:** `Modelos.py:29` (rol solo `cliente` o `propietario`); `Auth.py:33-35` (propietario sin empresa → 400); `Auth.py:52-56` (índice `ux_email`); correo en minúsculas (`:39`).
- **Pruebas:** `PruebaSeguridad.py:23` (nadie se registra como admin), `:31` (correo repetido). **Sin prueba:** la empresa obligatoria.
- **Al violarla:** 422 (rol inválido), 400 "Un propietario debe registrar la razón social y el NIT de su empresa", 409 "Ya existe una cuenta con ese correo".

### R13. Canchas con historial no se borran; con reservas futuras no se tocan
- **Capa:** API.
- **Dónde:** `Propietario.py:217-233` (eliminar), `:205-210` (pasar a mantenimiento), `:148-157` (eliminar sede).
```python
if pendientes:
    raise HTTPException(409, f"No puedes eliminar una cancha con {pendientes} reservas futuras")
if db.reservas.count_documents({"cancha_id": cancha["_id"]}) > 0:
    db.canchas.update_one({"_id": cancha["_id"]}, {"$set": {"estado": "inactiva"}})
    return {"resultado": "desactivada", "motivo": "Tiene historial de reservas"}
```
- **Prueba:** sin prueba (comprobado leyendo el código).
- **Al violarla:** 409 con el número de reservas futuras; sede con canchas → 409 "Primero elimina o desactiva las canchas…".
- **Demo:** Mi panel → Mis canchas → Eliminar una con reservas (no escribe nada si responde 409).

### R14. El pago es simulado
- **Capa:** API.
- **Dónde:** `Reservas.py:110` (`"pago": {..., "estado": "pagado"}  # pago simulado`).
- **Qué significa:** no hay pasarela; el método de pago solo se guarda. Al cancelar, `pago.estado` pasa a `reembolsado` sin mover dinero.

### R15. La base valida la forma de cada documento
- **Capa:** base de datos (`$jsonSchema`, `validationLevel: strict`, `validationAction: error`).
- **Dónde:** `CrearColecciones.py:263-271`; enums y patrones en el diagrama D1.
- **Prueba:** `PruebaReservas.py:132`.
- **Al violarla:** `Document failed validation` (desde Compass o un script; la API nunca llega ahí porque valida antes).
- **Demo:** Compass, `insertOne` con `rol: "superman"` (evidencia E2).

### Ciclos de vida (diagrama D5)
```text
RESERVA / BLOQUEO (reservas.estado)
  [creada] ──► activa ──(jugador cancela ≥24 h / dueño quita bloqueo)──► cancelada
                 │
                 └──(ya pasó hora_fin: script o ruta del admin)────────► finalizada
  Solo "activa" ocupa el índice único: al salir de activa, la franja se libera.

PARTIDO ABIERTO (partido_abierto.estado)
  [reserva con abierta=true, modalidad ≥4] ──► abierto ──(último cupo)──► completo
                                                 ▲                          │
                                                 └──────(alguien sale)──────┘
  abierto / completo ──(el organizador cancela la reserva)──► cerrado
```

# C2. Consultas explicadas

## Reportes (`backend/app/routers/Reportes.py`)

Todos filtran por un periodo (por defecto, las últimas 8 semanas, `:35-41`) y cuentan como "jugadas" las reservas `activa` y `finalizada` (`:31`). Los del propietario filtran además por su `propietario_id` (`:44-48`). Interfaz: `frontend/src/componentes/ReportesPropietario.jsx` (1-5) y `MetricasAdmin.jsx` (6-9), ambos con `api(\`/api/reportes/${ruta}\`)` (línea 32 y 31).

Salidas de ejemplo: consulta de **solo lectura** en Atlas el 10 nov 2026 (propietaria Laura Gómez para 1-5).

### 1. Mapa de calor — `GET /api/reportes/mapa-calor` (`:54-88`)
- **Pregunta:** ¿qué días y horas se llenan mis canchas? **Utilidad:** subir precios o promocionar horas vacías.
- **Origen:** `reservas`.
- **Etapas:** `$match` (mis reservas jugadas del periodo) → `$unwind` `$franjas` (una reserva de 2 horas se vuelve 2 documentos, uno por hora) → `$project` (de `"2026-11-12T19"` saca día de la semana con `$dayOfWeek` y hora con `$toInt`) → `$group` por día y hora, contando → `$sort` por día y hora. Después Python calcula el % de ocupación con el número de canchas.
- **Salida:** 6 canchas; la celda más llena es sábado 7 p. m. con 11 reservas (22,9 %), luego domingo 6 p. m. (16,7 %).
- **Cambio sencillo:** periodo de 4 semanas (`?desde=`), o contar solo `finalizada`.

### 2. Ingresos por sede y mes — `GET /api/reportes/ingresos` (`:91-106`)
- **Pregunta:** ¿cuánto factura cada sede por mes? **Origen:** `reservas`.
- **Etapas:** `$match` → `$group` por `cancha.sede` (la **copia** del nombre: no necesita `$lookup`) y mes (`$substrBytes` de la fecha) sumando `precio_total` → `$project` → `$sort` por mes e ingresos.
- **Salida:** sep 2026: El Golazo Norte $6.020.000 (30 reservas), El Golazo Suba $3.270.000 (22).
- **Cambio sencillo:** agrupar por cancha en vez de sede (`cancha.nombre`).

### 3. Top 10 clientes — `GET /api/reportes/clientes` (`:109-135`)
- **Pregunta:** ¿quiénes son mis mejores clientes? **Origen:** `reservas`.
- **Etapas:** `$match` → `$group` por `usuario_id` (reservas, gastado, última reserva) → `$sort` por reservas y gastado → `$limit` 10 → `$lookup` a `usuarios` (trae nombre, correo y teléfono **actuales**, con un sub-pipeline que proyecta solo esos campos) → `$unwind` → `$project`.
- **Salida:** Mariana Sánchez, 13 reservas, $2.490.000; Juliana Ramírez, 13, $2.390.000.
- **Cambio sencillo:** top 5 → `{"$limit": 5}` en `:123`.

### 4. Cancelaciones por cancha — `GET /api/reportes/cancelaciones` (`:138-156`)
- **Pregunta:** ¿qué cancha tiene más cancelaciones? **Origen:** `reservas` (todas, no solo jugadas).
- **Etapas:** `$match` → `$group` por cancha con `$sum` de `$cond` (cuenta 1 solo si `estado` es `cancelada`) → `$project` con la tasa `$round(canceladas / total × 100)` → `$sort` por tasa.
- **Salida:** Cancha 2 de El Golazo Norte: 6 de 56 (10,7 %).
- **Cambio sencillo:** mostrar solo canchas con tasa > 10 % (agregar `$match` después del `$project`).

### 5. Canchas subutilizadas — `GET /api/reportes/subutilizadas` (`:159-192`)
- **Pregunta:** ¿qué canchas casi no se usan? **Origen:** `canchas` (no `reservas`): así aparecen también las que tienen **cero** reservas.
- **Etapas:** `$match` (mis canchas no inactivas) → `$lookup` con `let` y sub-pipeline a `reservas` (filtra las de esa cancha, jugadas y del periodo; proyecta horas con `$size` de `franjas`) → `$project` (reservas, horas, ingresos con `$size` y `$sum`) → `$sort` por horas ascendente.
- **Salida:** Cancha 3 de El Golazo Suba (en mantenimiento): 0 reservas, 0 horas.
- **Cambio sencillo:** ordenar por ingresos.

### 6. Deportes y modalidades — `GET /api/reportes/deportes` (admin, `:198-214`)
- **Pregunta:** ¿qué se reserva más? **Origen:** `reservas`.
- **Etapas:** `$match` → `$group` por deporte y modalidad → `$project` → `$sort` por reservas y, en empate, por modalidad (orden estable; la única edición hecha a un pipeline en la evolución).
- **Salida:** Fútbol 5 (194), Pádel dobles (103), Pádel individual (95).

### 7. Zonas con más demanda — `GET /api/reportes/zonas` (admin, `:217-229`)
- **Pregunta:** ¿dónde abrir nuevas sedes? **Origen:** `reservas`.
- **Etapas:** `$match` → `$group` por `cancha.zona` (copia: sin `$lookup`) → `$sort` → `$limit` 10 → `$project`.
- **Salida:** Kennedy (156), Usaquén (122), Laureles (107).
- **Cambio sencillo:** top 3 → `{"$limit": 3}` en `:226`.

### 8. ¿Se llenan los partidos? — `GET /api/reportes/partidos` (admin, `:232-266`)
- **Origen:** `reservas` con `partido_abierto`.
- **Etapas:** `$match` → `$project` (llenado = (participantes + 1) / cupos; `completo` con `$cond`) → `$facet` con dos sub-pipelines a la vez: `general` (`$group` total, promedio, completos → `$project`) y `por_deporte` (`$group` → `$project` → `$sort`).
- **Salida:** 140 partidos, 24 completos, llenado promedio 70,6 %.

### 9. Reservas por mes — `GET /api/reportes/mensual` (admin, `:269-283`)
- **Origen:** `reservas` (todo el historial).
- **Etapas:** `$match` tipo reserva → `$group` por mes con tres `$sum` condicionales (`$cond`): jugadas, canceladas e ingresos → `$project` → `$sort` por mes.
- **Salida:** sep 233 / oct 417 / nov 207 reservas jugadas (nov sigue en curso).

## Otras consultas

| Consulta | Dónde | Qué hace | Por qué así |
|---|---|---|---|
| Detalle de cancha con `$lookup` | `Canchas.py:192-205` | `$match` cancha visible → `$lookup` a `sedes` → `$unwind` → `$match` sede aprobada | La copia `sede{}` solo tiene nombre, ciudad y zona; el detalle necesita dirección, horario y servicios |
| Mis sedes | `Propietario.py:85-96` | `$match` mis sedes → `$lookup` a `canchas` → `$addFields` total de canchas no inactivas (`$filter` + `$size`) → `$project` → `$sort` | Una sola consulta da las sedes con su conteo |
| Sedes para el admin | `Admin.py:21-35` | `$match` por estado → `$lookup` a `usuarios` → `$unwind` → `$project` (oculta `password_hash`) → `$sort` | Muestra el dueño y su empresa, sin datos sensibles |
| Partidos abiertos | `Partidos.py:33-67` | `$match` (activos, abiertos, de hoy en adelante) → `$addFields` `cupos_libres` → `$project` (oculta el pago) → `$sort` → `$limit` 200; luego Python deja solo los que empiezan en 2 h o más | Calcula cupos dentro de la base |
| libres-hoy | `Canchas.py:145-189` | Una sola consulta a `reservas` con `cancha_id $in`, `franjas $in` (las 24 de hoy) y `estado: activa` | Usa el índice único: `explain()` en Atlas dio IXSCAN, 27 claves, 5 de 964 documentos (Evidencias/ExplainLibresHoy.txt) |
| Atlas Search con respaldo | `Canchas.py:26-53` | `$search` con `text`, `fuzzy` (`maxEdits: 1`, `prefixLength: 1`) sobre 5 campos → `$limit` → `$project` `_id`; si falla o no encuentra, `$regex` escapado (`re.escape`) | Tolera errores; el respaldo funciona sin el índice (y con pedazos de palabra) |
| Filtro "libre a las" | `Canchas.py:107-113` | `distinct("cancha_id")` de reservas activas en esa franja → `$nin` | Quita las canchas ocupadas a esa hora |
| Unirse (atómico) | `Partidos.py:90-104` | `find_one_and_update` con condiciones + `$push` | Imposible pasarse del cupo (ver R6) |
| Cancelar (atómico) | `Reservas.py:180-186` | `find_one_and_update` con `estado: activa` en el filtro | Dos cancelaciones a la vez: solo una cambia el documento |

## Operadores que pide el enunciado

| Operador | Reportes donde aparece | Otras consultas |
|---|---|---|
| Aggregation Pipeline | Los 9 | Detalle de cancha, mis sedes, sedes del admin, partidos, Atlas Search |
| `$lookup` | 3, 5 | Detalle de cancha, mis sedes, sedes del admin |
| `$match` | 1 a 9 | Todas las anteriores |
| `$project` | 1 a 9 | Mis sedes, sedes del admin, partidos, Atlas Search |
| `$sort` | 1 a 9 | Mis sedes, sedes del admin, partidos |
| `$limit` | 3, 7 | Partidos, Atlas Search |
| `$group` | 1, 2, 3, 4, 6, 7, 8, 9 | — |
| `$unwind` | 1, 3 | Detalle de cancha, sedes del admin |
| Extras | `$cond` (4, 8, 9), `$facet` (8) | `$addFields`, `$filter`, `$size`, `$expr`, `$search` |

## Índice → qué consulta o regla lo usa

Ver el diagrama D6. Solo el uso de `ux_cancha_franja_activa` en libres-hoy está comprobado con `explain()`; los demás son el uso esperado según el filtro de cada consulta.

# C3. Recorridos de código

Mismo formato que el recorrido de la reserva (Parte A): capa · qué pasa · archivo:línea.

### Registro e inicio de sesión
| # | Capa | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Interfaz | `Registro.jsx` / `Ingresar.jsx` llaman a `registrar` / `ingresar` de la sesión | `Registro.jsx:26` · `Ingresar.jsx:32` |
| 2 | Sesión | `api("/api/auth/registro" o "/login", POST)` | `contexto/Sesion.jsx:41` y `:36` |
| 3 | Pydantic | `RegistroEntrada` (correo, clave 8-72, rol cliente o propietario) / `LoginEntrada` | `Modelos.py:22-35` |
| 4 | Reglas | Propietario sin empresa → 400; correo en minúsculas | `Auth.py:33-39` |
| 5 | Contraseña | `cifrar_clave` (bcrypt) en el registro; `verificar_clave` en el login | `Seguridad.py:24-31` |
| 6 | Base | `insert_one`; `ux_email` rechaza un correo repetido → 409 | `Auth.py:52-56` |
| 7 | Login | Mismo mensaje si no existe el correo o la clave está mal (401); cuenta desactivada → 403 | `Auth.py:65-71` |
| 8 | Token | `crear_token`: `sub`, `rol`, `nombre`, `exp` (8 h), firmado HS256 | `Seguridad.py:37-51` |
| 9 | Interfaz | Guarda `{token, usuario}` en `localStorage` (`parche.sesion`) | `Sesion.jsx:17-21` y `:31` |

### Consultar canchas con filtros
| # | Capa | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Interfaz | Los chips y "Más filtros" arman los parámetros; `api("/api/canchas", {parametros})` | `Inicio.jsx:134` y `:151` (Cargar más) |
| 2 | API | Filtro base: cancha activa, sede aprobada, dueño activo | `Canchas.py:78-81` |
| 3 | API | Deporte/modalidad (`$elemMatch`), ciudad, zona, superficie, techo, precio máximo | `Canchas.py:85-101` |
| 4 | API | Texto: Atlas Search o `$regex` | `Canchas.py:103-105` |
| 5 | API | "Libre a las": quita las canchas ocupadas en esa franja | `Canchas.py:107-113` |
| 6 | Base | `find(filtro).sort(...)` con `_id` al final, `skip`/`limit` y `count_documents` | `Canchas.py:115-121` |
| 7 | Interfaz | Agrupa por sede y pide "Libre hoy" para las canchas de la página | `Inicio.jsx:74` |

### Crear, editar y eliminar o desactivar una cancha y una sede
| # | Capa | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Interfaz | Mi panel: crear sede / editar / eliminar | `PanelPropietario.jsx:693` · `:586` · `:597` |
| 2 | API | Crear sede: `propietario_id` del token, horario estándar si no envía, `estado: pendiente` | `Propietario.py:99-117` |
| 3 | API | Editar sede: solo la mía; si cambia nombre, ciudad o zona, `update_many` sincroniza la copia en sus canchas; si estaba rechazada, vuelve a pendiente | `Propietario.py:120-145` |
| 4 | API | Eliminar sede: solo sin canchas (activas ni con historial) | `Propietario.py:148-157` |
| 5 | Interfaz | Mis canchas: crear / editar / eliminar | `PanelPropietario.jsx:478` · `:340` · `:351` |
| 6 | API | Crear cancha: en una sede mía; deportes del catálogo; pico ≥ normal; copia `sede{}` | `Propietario.py:171-191` |
| 7 | API | Editar cancha: si pasa a mantenimiento con reservas futuras → 409; el precio nuevo solo afecta reservas futuras | `Propietario.py:194-214` |
| 8 | API | Eliminar cancha: con reservas futuras → 409; con historial → `inactiva`; sin nada → se borra | `Propietario.py:217-233` |

### Unirse a un partido
| # | Capa | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Interfaz | Partidos abiertos → Unirme | `Partidos.jsx:39` |
| 2 | API | Rol cliente; el partido existe; no está finalizado ni cancelado | `Partidos.py:70-77` |
| 3 | API | Faltan 2 h o más | `Partidos.py:79-83` |
| 4 | Base | `find_one_and_update` atómico con `$push` | `Partidos.py:90-104` |
| 5 | API | Si no cambió nada, explica por qué (409) | `Partidos.py:106-116` |
| 6 | Base | Si se llenó, `estado → completo` | `Partidos.py:118-123` |

### Cancelar una reserva
| # | Capa | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Interfaz | Mis reservas → Cancelar (o Salir si eres participante) | `MisReservas.jsx:54` |
| 2 | API | Solo la mía (si no, 404); solo activa; con 24 h o más | `Reservas.py:156-169` |
| 3 | Base | `find_one_and_update` con `estado: activa`: cancelada, reembolsado, partido cerrado | `Reservas.py:171-187` |
| 4 | Base | Al dejar de ser activa, sale del índice parcial: la hora queda libre | `CrearColecciones.py:249` |

### Aprobar o rechazar una sede
| # | Capa | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Interfaz | Administración → Sedes → Aprobar / Rechazar | `PanelAdmin.jsx:56` y `:65` |
| 2 | API | Solo admin; aprobar cambia `estado` y guarda `revision` | `Admin.py:38-51` |
| 3 | API | Rechazar: motivo ≥ 5 caracteres; con reservas futuras → 409 hasta `confirmar: true` | `Admin.py:63-80` |
| 4 | Efecto | La búsqueda solo muestra canchas de sedes aprobadas | `Canchas.py:56-58` |

### Bloquear una hora
| # | Capa | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Interfaz | Mi panel → Agenda → tocar una casilla libre | `PanelPropietario.jsx:134` (quitar: `:150`) |
| 2 | API | Rol propietario; cancha mía; mismas reglas de horario | `Reservas.py:221-229` |
| 3 | Base | `insert_one` con `tipo: "bloqueo"`; el índice único impide bloquear sobre una reserva → 409 | `Reservas.py:232-250` |

### Recorrido del frontend
| # | Pieza | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Arranque | `index.html` carga `Main.jsx`; monta `<BrowserRouter>` → `<ProveedorSesion>` → `<App>` | `frontend/src/Main.jsx:8-16` |
| 2 | Rutas | `App.jsx` dibuja el encabezado, las rutas dentro de `ErrorPantalla` y la barra inferior | `App.jsx:19-39` |
| 3 | Sesión | Lee la sesión guardada; expone `ingresar`, `registrar`, `salir`; si la API responde 401, cierra la sesión y lleva a Ingresar | `Sesion.jsx:9-12`, `:26-77`, `:55` |
| 4 | Api.js | `api(ruta, {metodo, cuerpo, token, parametros})`: arma la URL con `VITE_API_URL`, agrega el token, corta a los 45 s, convierte errores | `Api.js:24-70` |
| 5 | Página | `Inicio.jsx`: al montar pide deportes y canchas en paralelo (`Promise.all`), guarda en el estado (`setDeportes`, `setCatalogo`) y React vuelve a dibujar | `Inicio.jsx:82-88` |
| 6 | Pintar | Con los datos en el estado, dibuja filtros, filas por sede y "Libre hoy"; con error, un aviso distinto del estado vacío | `Inicio.jsx` (desde la línea 400) |

# C4. Limitaciones y mejoras

Lo que el sistema **no** hace hoy, dicho con honestidad:

| Limitación | Qué pasa hoy | Mejora propuesta |
|---|---|---|
| Pago simulado | Se guarda `pago.estado = "pagado"` sin pasarela; el reembolso tampoco mueve dinero | Integrar una pasarela de pagos real con confirmación por webhook |
| Finalización manual | Las reservas pasan a `finalizada` solo cuando el admin o el script lo ejecutan | Tarea programada diaria (cron de Render) |
| NIT autodeclarado | El NIT de la empresa no se valida contra ninguna fuente | Validar el dígito de verificación y revisar el RUT al aprobar |
| Sin límite de intentos de login | No hay bloqueo por intentos fallidos | Limitar intentos por IP y correo |
| Catálogo de deportes por nombre | La cancha guarda el deporte como texto; si se renombra en el catálogo, no se actualiza | Referenciar por `_id` o sincronizar con `update_many` |
| Sin transacciones multi-documento | Al cancelar un partido, los reembolsos de los participantes no se registran uno por uno | Transacción que registre cada reembolso |
| Token en `localStorage` | Accesible desde JavaScript de la página | Cookie `HttpOnly` |
| Sin notificaciones | Nadie recibe correo al reservar, unirse o cancelar | Correos transaccionales |
| Búsqueda por cercanía | El índice 2dsphere existe pero no se usa | `$geoNear` para "canchas cerca de mí" |
| Render se duerme | Primera visita lenta en el plan gratuito | Plan pago o un "ping" periódico |
| Pruebas de 2 h y 24 h al salir | No las cubre ninguna prueba | Agregarlas a `PruebaPartidos.py` |

**Respuestas cortas para "¿qué mejorarían?":**
- 🗣 "Primero, un pago real con pasarela; hoy es simulado."
- 🗣 "Segundo, que la finalización de reservas corra sola todos los días."
- 🗣 "Tercero, seguridad: límite de intentos de login y token en cookie segura."
