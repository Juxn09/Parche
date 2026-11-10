# Guía de sustentación — Parche (1 página)

## Recorrido de una reserva, de punta a punta

> Un jugador toca **"Reservar y pagar $80.000"** para la Pista 3, mañana a las 7 p. m.

| # | Capa | Qué pasa | Dónde mostrarlo |
|---|---|---|---|
| 1 | **Interfaz** | `reservar()` arma el cuerpo con `cancha_id`, `fecha`, `hora_inicio`, `horas`, `modalidad`, `metodo_pago` y `abierta`. **No envía el precio**: ese lo decide el servidor | `frontend/src/paginas/Detalle.jsx:101` |
| 2 | **Api.js** | `api()` hace `fetch POST /api/reservas` con el token en `Authorization: Bearer …`. Si la respuesta no es 2xx, convierte el `detail` de FastAPI en un mensaje | `frontend/src/servicios/Api.js:13` y `:27` |
| 3 | **Pydantic** | `ReservaEntrada` valida la forma: fecha `AAAA-MM-DD`, horas entre 1 y 3, método de pago válido. Si algo falla, responde **422** sin ejecutar la ruta | `backend/app/Modelos.py` (`ReservaEntrada`) |
| 4 | **Autorización** | `Depends(solo_cliente)` ejecuta `usuario_actual` (verifica la firma y la expiración del JWT y trae al usuario activo de la base) y `requiere_rol("cliente")`. Sin token responde **401**; con otro rol, **403** | `backend/app/Seguridad.py:65` y `:85` |
| 5 | **Reglas** | Verifica que la cancha esté activa y la sede aprobada, que la modalidad la ofrezca la cancha, y que la hora no sea pasada, no supere los 30 días y esté dentro del horario (hora del **servidor**) | `backend/app/routers/Reservas.py:73-82` |
| 6 | **Precio** | `precio_total = sum(precio_de_hora(...))`: hora normal, o pico de 6 a 10 p. m. | `Reservas.py:86` |
| 7 | **Base de datos** | `insert_one(reserva)` con `franjas: ["2026-11-11T19"]` y `estado: "activa"`. El índice **`ux_cancha_franja_activa`** (único y parcial) **rechaza** el documento si ya existe una reserva o un bloqueo activo con esa `cancha_id` y esa franja | `Reservas.py:122` · índice en `backend/scripts/CrearColecciones.py:249` |
| 8 | **Respuesta** | Si todo sale bien: **201** con la reserva. Si el índice la rechaza, la API atrapa el `DuplicateKeyError` y responde **409** "Ese horario ya está ocupado" | `Reservas.py:123-125` |
| 9 | **Interfaz** | Con 201 muestra "Reserva confirmada". Con 409 muestra el mensaje y **vuelve a cargar la regleta**, porque alguien tomó la hora | `Detalle.jsx:124` |

🗣 *"El cruce no se revisa con un if: si dos personas reservan a la vez, ambas pasarían el if. El índice único parcial hace que la base acepte la primera y rechace la segunda."*

## Cinco preguntas probables

**1. ¿Por qué embebieron el partido abierto en la reserva y no hicieron otra colección?**
Porque nace y muere con la reserva, se lee siempre junto con ella y su tamaño está acotado por los jugadores de la modalidad (máximo 16). Así, unirse al partido es **una sola actualización atómica** sobre un solo documento.

**2. ¿Cómo evitan que dos jugadores tomen el último cupo de un partido?**
Con `find_one_and_update`. El filtro exige que el partido esté abierto, que el jugador no esté ya en él y, con `$expr`, que `size(participantes) < cupos - 1`. El `$push` solo ocurre si todo se cumple, en una única operación de MongoDB (`Partidos.py`). En la prueba de concurrencia, de 6 intentos simultáneos con 3 cupos libres, entraron exactamente 3.

**3. ¿Por qué hay datos duplicados, como el nombre de la sede en la cancha y en la reserva?**
Son decisiones distintas:
- En `canchas`, la copia es una **referencia extendida** para buscar sin `$lookup`, y se sincroniza con `update_many` si la sede cambia de nombre.
- En `reservas`, la copia es **histórica**: el precio y los nombres del momento no deben cambiar.

**4. ¿Cómo aseguran que un propietario no vea los datos de otro?**
El `propietario_id` sale **del token**, nunca de la petición, y todas las consultas lo incluyen en el filtro. Si alguien pide una sede ajena, la API responde **404**, como si no existiera, para no revelar que existe.

**5. ¿Dónde están las credenciales y cómo se conecta la API a Atlas?**
En `backend/.env`, que Git ignora (`git check-ignore -v backend/.env`), y en las variables de entorno de Render. PyMongo usa un único `MongoClient` con TLS y el usuario `parche_app`, que solo tiene permisos sobre la base `parche`.

## Cambios en vivo que podrían pedir (y dónde hacerlos)

| Cambio | Archivo | Qué tocar |
|---|---|---|
| Cambiar la hora pico | `backend/app/Utilidades.py` | `HORA_PICO = range(18, 22)` |
| Cancelar con 12 h en vez de 24 | `backend/app/routers/Reservas.py` | `HORAS_MINIMAS_CANCELAR` |
| Reservar con más anticipación | `Reservas.py` | `DIAS_MAXIMOS_ANTICIPACION` |
| Cambiar el top 10 de clientes a top 5 | `backend/app/routers/Reportes.py` | `{"$limit": 10}` del reporte de clientes |
| Unirse hasta 1 h antes | `backend/app/routers/Partidos.py` | `HORAS_LIMITE_UNIRSE` |
