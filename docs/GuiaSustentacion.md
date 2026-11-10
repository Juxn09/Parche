# Guía de sustentación — Parche

## Recorrido de una reserva, de punta a punta

> Un jugador abre la Pista 3 del Pádel Club Chapinero, toca **mañana a las 9 p. m.** (hora pico) y luego **"Reservar y pagar $100.000"**.

| # | Capa | Qué pasa | Dónde mostrarlo |
|---|---|---|---|
| 1 | **Regleta** | Pinta cada hora según `GET /api/canchas/{id}/disponibilidad`: libre (tiza con el precio), pico (línea punteada y "Pico"), ocupada (rayado, deshabilitada) y elegida (naranja, "1 de 2"). Solo dibuja: no decide el precio ni la disponibilidad | `frontend/src/componentes/Regleta.jsx:17` |
| 2 | **Interfaz** | `reservar()` arma el cuerpo con `cancha_id`, `fecha`, `hora_inicio`, `horas`, `deporte`, `modalidad`, `metodo_pago` y `abierta`. **No envía el precio**: ese lo decide el servidor | `frontend/src/paginas/Detalle.jsx:110` |
| 3 | **Api.js** | `api()` hace `fetch POST /api/reservas` con `Authorization: Bearer <token>`. Corta la petición a los 45 s (`AbortController`); si responde 401 cierra la sesión y lleva a Ingresar; si no es 2xx convierte el `detail` en un mensaje | `frontend/src/servicios/Api.js:24`, `:33`, `:62` y `:66` |
| 4 | **Pydantic** | `ReservaEntrada` valida la forma: fecha `AAAA-MM-DD`, horas entre 1 y 3, método de pago válido. Si algo falla responde **422**, con el mensaje traducido al español | `backend/app/Modelos.py:104` · traducción en `backend/app/Errores.py:89` |
| 5 | **Autorización** | `Depends(solo_cliente)` ejecuta `usuario_actual` (verifica firma y expiración del JWT y trae al usuario activo) y `requiere_rol("cliente")`. Sin token **401**; con otro rol **403** | `backend/app/Seguridad.py:65` y `:85` |
| 6 | **Reglas** | Cancha activa de una sede aprobada y de un propietario activo; la cancha ofrece ese deporte y modalidad; la hora no es pasada, no supera 30 días y está dentro del horario de la sede, con la hora del **servidor** en Bogotá | `backend/app/routers/Reservas.py:36-62` y `:83-88` |
| 7 | **Precio** | `precio_total = sum(precio_de_hora(...))`: hora normal, o pico si empieza entre 6 y 9 p. m. Aquí: $100.000 | `Reservas.py:94` · `backend/app/Utilidades.py:15` y `:61` |
| 8 | **Base de datos** | `insert_one(reserva)` con `franjas: ["2026-11-11T21"]` y `estado: "activa"`. El índice **`ux_cancha_franja_activa`** (único y parcial sobre `cancha_id` + `franjas`, solo para `estado: "activa"`) **rechaza** el documento si otra reserva o bloqueo activo ya tiene esa franja | `Reservas.py:132` · índice en `backend/scripts/CrearColecciones.py:249` |
| 9 | **Respuesta** | **201** con la reserva. Si el índice la rechaza, la API atrapa el `DuplicateKeyError` y responde **409** "Ese horario ya está ocupado en esta cancha" | `Reservas.py:133-135` |
| 10 | **Interfaz** | Con 201 muestra la reserva confirmada. Con 409 muestra el mensaje y **vuelve a cargar la regleta**, porque alguien tomó la hora | `Detalle.jsx:133` |

🗣 *"El cruce no se revisa con un if: si dos personas reservan a la vez, ambas pasarían el if. El índice único parcial hace que la base acepte la primera y rechace la segunda."*

**Para demostrarlo en vivo:** en `/docs` intenta reservar una hora que la regleta muestra como "Ocupada" → 409, y en Atlas el conteo de reservas no cambia (evidencia E7 del documento técnico).

## Lo nuevo de la evolución (rama `evolucion`, ya en `main`)

**"Libre hoy" en la lista — `GET /api/canchas/libres-hoy?ids=`** (`backend/app/routers/Canchas.py:145`)
- Una sola consulta a `reservas` para toda la página: `cancha_id $in ids`, `franjas $in` las 24 franjas de hoy, `estado: "activa"`. Con `explain()` en Atlas usa `IXSCAN` sobre `ux_cancha_franja_activa` y examina 5 de 964 documentos.
- Máximo 50 ids (`MAXIMO_IDS_LIBRES`, línea 128) y validación de cada id (`_leer_ids`, línea 131). Usa la hora de Bogotá: no cuenta horas que ya pasaron y dice si la sede está cerrada hoy (`motivo`).
- Va antes de `/{cancha_id}` en el router; si no, FastAPI tomaría "libres-hoy" como un id.
- Si falla, la lista se muestra igual, sin la etiqueta (`frontend/src/paginas/Inicio.jsx:74`).

🗣 *"No hicimos una consulta por cancha: es una sola consulta con `$in`, y el índice que evita cruces también sirve para contar horas libres."*

**Paginación estable** (`Canchas.py:118`): se agregó `("_id", 1)` como último criterio de `$sort`. Sin él, dos canchas con igual precio y nombre cambiaban de lugar entre páginas y "Cargar más" repetía una y perdía otra. 8 de las 9 pruebas de paginación fallan si se quita.

**Filtros** (`Inicio.jsx`, desde la línea 493): chips de deporte, modalidad, ciudad y "Cuándo" (hoy, mañana, otro día y "libre a las…"); el panel "Más filtros" (precio, techo, zona, orden) se cierra con Esc o con un clic fuera (línea 227) y devuelve el foco al botón; contador de filtros activos y "Limpiar todo". Todo se traduce a parámetros de `GET /api/canchas`; la búsqueda por texto usa Atlas Search y, si no está disponible, `$regex` (`Canchas.py:26`).

**Regleta** (`Regleta.jsx`): cada estado se entiende sin color (texto "Ocupada", "Pico", ✓ y "1 de 2"). Se opera con teclado: las flechas recorren solo horas libres, Inicio y Fin van a la primera y la última, Enter elige. Si el enlace trae una hora ocupada (`?hora=19`), no se preselecciona (`Detalle.jsx:68`). Contraste medido con axe: 0 violaciones en modo claro y oscuro.

**Finalización de reservas** (`backend/app/CicloDeVida.py:20` y `:32`): las reservas activas cuya hora ya terminó pasan a `finalizada`. Es idempotente: correrla dos veces no cambia nada la segunda.
- Script `backend/scripts/FinalizarReservas.py`: por defecto solo muestra qué cambiaría; aplica con `--aplicar`.
- En Atlas se aplicó a 29 reservas, después de un respaldo de las 964, y los reportes dieron los mismos números antes y después.
- También existe `POST /api/admin/mantenimiento/finalizar-reservas`, solo para el administrador (401 sin token).
- Unirse, salir o cancelar una reserva `finalizada` o `cancelada` responde con un mensaje específico.

**Manejo de errores** (`backend/app/Errores.py`, registrado en `backend/app/Main.py:37-38`, antes de CORS):
- 422 de Pydantic traducido al español, con el campo que falló.
- Si Atlas no responde, **503** "La base de datos no está disponible en este momento…"; cualquier otro error, **500** "Ocurrió un error inesperado en el servidor…", siempre en JSON. Ambos con cabeceras CORS, para que la interfaz muestre el mensaje real en vez de un error de red.
- En la interfaz: tiempo máximo de 45 s, sesión vencida (401) → Ingresar con aviso, estados de error distintos del estado vacío y página 404 "Balón por fuera".

**Moderación:** las canchas de propietarios desactivados no aparecen ni se pueden reservar (`Utilidades.py:56`). Rechazar una sede con reservas futuras pide confirmación (409 y luego `confirmar: true`, `backend/app/routers/Admin.py:65-73`).

## Las 54 pruebas automáticas (`backend/pruebas/`)

Corren con `pytest` contra un **MongoDB real temporal** (pymongo-inmemory), con las mismas colecciones, validadores e índices de Atlas, y con el reloj congelado en el 10 nov 2026, 10:00 a. m. en Bogotá. Nunca tocan Atlas: el `conftest.py` se niega a correr si la base no es la local `parche_pruebas`.

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `PruebaReservas.py` | 13 | Cruces parciales y simultáneos (409), reserva contra bloqueo, precio pico calculado por el servidor, pasado/30 días/horario, cancelación con 24 h, finalización idempotente, `$jsonSchema` rechazando un documento |
| `PruebaLibresHoy.py` | 15 | Conteo de horas libres, horas pasadas, sede cerrada, límite de 50 ids, ids inválidos |
| `PruebaPaginacion.py` | 9 | Páginas sin repetidos ni perdidos con empates de precio y nombre |
| `PruebaSeguridad.py` | 9 | 401/403, token falso, nadie se registra como admin, correo repetido (409 por índice único), aislamiento entre propietarios, propietario desactivado, rechazo de sede con confirmación |
| `PruebaPartidos.py` | 7 | Cupo con uniones simultáneas, cuota, salir devuelve el cupo, partidos finalizados o cancelados |
| `PruebaReportes.py` | 1 | Reporte de deportes con desempate estable |

🗣 *"No usamos mongomock porque no aplica índices únicos sobre arreglos: con él, un cruce parcial de horas pasaba sin error. Por eso las pruebas usan un MongoDB real."*

Correrlas: `cd backend` y `python -m pytest -q` (instalar antes `pip install -r RequisitosPruebas.txt`).

## Cinco preguntas probables

**1. ¿Por qué embebieron el partido abierto en la reserva y no hicieron otra colección?**
Porque nace y muere con la reserva, se lee siempre junto con ella y su tamaño está acotado por los jugadores de la modalidad (máximo 16). Así, unirse al partido es **una sola actualización atómica** sobre un solo documento.

**2. ¿Cómo evitan que dos jugadores tomen el último cupo de un partido?**
Con `find_one_and_update` (`backend/app/routers/Partidos.py:90`). El filtro exige que el partido esté abierto, que el jugador no esté ya en él y, con `$expr`, que `size(participantes) < cupos - 1`. El `$push` solo ocurre si todo se cumple, en una única operación de MongoDB. En la prueba de concurrencia, de 6 intentos simultáneos con 3 cupos libres, entraron exactamente 3.

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
| Cambiar la hora pico | `backend/app/Utilidades.py:15` | `HORA_PICO = range(18, 22)` (y `esPico` en `Regleta.jsx:15` para el dibujo) |
| Cancelar con 12 h en vez de 24 | `backend/app/routers/Reservas.py:28` | `HORAS_MINIMAS_CANCELAR` |
| Reservar con más anticipación | `Reservas.py:27` | `DIAS_MAXIMOS_ANTICIPACION` |
| Cambiar el top 10 de clientes a top 5 | `backend/app/routers/Reportes.py:123` | `{"$limit": 10}` de `mejores_clientes` (el de la línea 226 es el de zonas) |
| Unirse hasta 1 h antes | `backend/app/routers/Partidos.py:23` | `HORAS_LIMITE_UNIRSE` |
| Permitir más canchas en "Libre hoy" | `backend/app/routers/Canchas.py:128` | `MAXIMO_IDS_LIBRES` |

Después de un cambio en el backend, correr las pruebas: si alguna regla cambia a propósito, la prueba que la cubre debe fallar y ajustarse.

## Antes de presentar

- Abrir https://parche-akv4.onrender.com/api/salud unos minutos antes: el plan gratuito de Render se duerme y la primera respuesta tarda cerca de un minuto.
- Compartir solo https://parche-six.vercel.app: las direcciones de rama y de despliegue de Vercel piden iniciar sesión.
