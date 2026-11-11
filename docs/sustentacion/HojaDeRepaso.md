# Hoja de repaso — Parche

**En una frase:** marketplace de reservas deportivas (Bogotá y Medellín) para jugadores, propietarios y administrador: interfaz React en **Vercel** → API FastAPI en **Render** → **MongoDB Atlas**.

**Enlaces:** app `parche-six.vercel.app` · API `parche-akv4.onrender.com/docs` · salud `/api/salud` · repo `github.com/Juxn09/Parche`.

**Números:** 5 colecciones · 41 rutas · 9 reportes · 13 índices propios (+ `_id` en cada colección) y 1 de Atlas Search · 54 pruebas (≈2 min) · datos de prueba: 35 usuarios, 8 sedes, 23 canchas, ~966 reservas.

## Arquitectura (D2)
- La interfaz **nunca** habla con la base: todo pasa por `frontend/src/servicios/Api.js` con el token JWT.
- La API usa **un solo `MongoClient`** (`backend/app/BaseDatos.py:15`), timeout 8 s.
- Credenciales: `backend/.env` (ignorado por Git) y variables de Render: `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `FRONTEND_URL`. Vercel: `VITE_API_URL`.
- Atlas: M0, AWS us-east-1, usuario `parche_app` (solo base `parche`), Network Access `0.0.0.0/0` porque Render no tiene IP fija.
- Push a `main` → Vercel compila cada commit; Render redespliega solo si cambió `backend/`.

## Modelo (D1)
- **Embebido:** empresa en usuario, horario en sede, modalidades en deporte, pago y partido abierto en reserva, participantes en partido.
- **Referencia:** sede→propietario, cancha→sede, reserva→cancha y jugador.
- **Copia sincronizada:** `canchas.sede` (`update_many` si cambia el nombre). **Copia histórica:** precio y nombres en la reserva.
- **Bloqueos** son documentos de `reservas` con `tipo: "bloqueo"`.
- **Índice clave:** `ux_cancha_franja_activa`, único sobre `{cancha_id, franjas}` y parcial (`estado: "activa"`).
- `$jsonSchema` en las 5 colecciones con `strict` + `error`.

🗣 *"El cruce no se revisa con un if: dos personas a la vez pasarían el if. El índice único hace que la base acepte la primera y rechace la segunda."*

## Recorrido de una reserva (D3)
Regleta → `reservar()` (sin precio) → `Api.js` POST con token → **permisos** (401/403) → **Pydantic** (422) → reglas: cancha activa, sede aprobada, modalidad, horario, ni pasado ni +30 días (400/404/409) → precio normal o pico (6-9 p. m.) → `insert_one` con `franjas` → índice: 201 o `DuplicateKeyError` → **409** → la interfaz recarga la regleta.

## Reglas que más preguntan
| Regla | Dónde | Respuesta |
|---|---|---|
| Sin cruces (reservas y bloqueos) | índice + `Reservas.py:131-135` | 409 |
| Cancelar: solo el organizador, ≥ 24 h | `Reservas.py:156-187` | 404 / 409 |
| Unirse: hasta 2 h antes, cupo atómico | `Partidos.py:79-104` | 409 con motivo |
| Salir: cuota se devuelve solo con ≥ 24 h | `Partidos.py:129-151` | 200 con `reembolso` |
| Partido solo en modalidades ≥ 4 jugadores | `Reservas.py:115-123` | 400 |
| Sede visible solo si está aprobada | `Canchas.py:56-58` | 404 |
| Rechazar sede con reservas futuras pide confirmar | `Admin.py:72-79` | 409 |
| Dueño solo ve lo suyo (id del token) | `Propietario.py:32-44` | 404 |
| Cancha con historial se desactiva, no se borra | `Propietario.py:217-233` | 409 / `inactiva` |
| Nadie se registra como admin; correo único | `Modelos.py:29` · `Auth.py:52-56` | 422 / 409 |

## Reportes (Aggregation Pipeline)
Dueño: 1 mapa de calor (`$unwind` las franjas) · 2 ingresos por sede y mes · 3 top 10 clientes (`$lookup`) · 4 cancelaciones (`$cond`) · 5 subutilizadas (desde `canchas` con `$lookup`). Admin: 6 deportes · 7 zonas (Kennedy primero) · 8 partidos (`$facet`) · 9 por mes.
Operadores del enunciado: `$lookup` (3, 5) · `$match`, `$project`, `$sort` (todos) · `$limit` (3, 7) · `$group` (todos menos 5) · `$unwind` (1, 3).

## Calidad
54 pruebas con pytest contra un **MongoDB 7.0 real temporal** (no mongomock: no aplica índices únicos sobre arreglos). Nunca tocan Atlas. Comando: `python -m pytest` en `backend`.

## Cambios en vivo
Hora pico `Utilidades.py:15` · cancelar 12 h `Reservas.py:28` · top 5 `Reportes.py:123` · unirse 1 h `Partidos.py:23` · condición de búsqueda: diccionario `filtro` de `GET /api/canchas` en `Canchas.py`.

## Límites (decirlos si preguntan)
Pago simulado · finalización manual · NIT sin validar · sin límite de intentos de login · deportes por nombre.

## Plan B
Render dormido → abrir `/api/salud` 5 min antes. Red del salón falla con Atlas (ya pasó un error TLS en otra red, causa no determinada) → hotspot; la app publicada no depende de esa red. Sin internet → PDF con capturas y las pruebas locales.

## 10 minutos antes
1 `/api/salud` · 2 app con sesión de jugador · 3 ventana privada con propietario/admin · 4 `/docs` · 5 Atlas · 6 Compass (`use parche`) · 7 VS Code con terminal en `backend` · 8 guion.
