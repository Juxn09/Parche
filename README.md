# Parche

Reserva la cancha. Arma el parche.

Parche es un marketplace de reservas deportivas. Los propietarios publican sus sedes y canchas, y los jugadores buscan por deporte, modalidad y zona, reservan y completan su equipo con partidos abiertos.

Es el proyecto final de Bases de Datos II.
Integrantes: Juan Camilo Moreno, Marshall Robinson y Carlos Palacios.

| | |
|---|---|
| Aplicación | https://parche-six.vercel.app |
| API (documentación interactiva) | https://parche-akv4.onrender.com/docs |
| Documento técnico | [docs/DocumentoTecnico.md](docs/DocumentoTecnico.md) |
| Modelo de datos | [docs/ModeloDeDatos.md](docs/ModeloDeDatos.md) |
| Consultas y reportes (mongosh) | [docs/Consultas.md](docs/Consultas.md) |

## Tecnologías

- **Base de datos:** MongoDB Atlas, con validación `$jsonSchema`, índices y Atlas Search.
- **API:** Python 3.13 o superior, FastAPI y PyMongo.
- **Interfaz:** React 19, Vite y Tailwind CSS 4.

## Estructura

```
backend/
  app/            API: Main.py, Config.py, BaseDatos.py, Seguridad.py, Modelos.py, Utilidades.py
  app/routers/    Auth, Canchas, Propietario, Reservas, Partidos, Admin, Reportes
  scripts/        CrearColecciones.py, CrearIndiceBusqueda.py, CargarDatos.py
frontend/
  src/paginas/    Inicio, Detalle, Partidos, MisReservas, PanelPropietario, PanelAdmin, Ingresar, Registro
  src/componentes/ piezas compartidas, gráficas y pictogramas
  src/servicios/  Api.js (único cliente HTTP) y Catalogo.js
docs/             documento técnico, modelo de datos y consultas
```

## Instalación local

### Requisitos
- Python 3.13 o superior y Node.js 20.19 o superior (o 22.12 o superior), como exige Vite 8.
- Un cluster de MongoDB Atlas, con un usuario de base de datos y tu IP en *Network Access*.

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1        # Windows PowerShell  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env            # macOS/Linux: cp .env.example .env
```

Llena `backend/.env` con tus valores:

| Variable | Qué es |
|---|---|
| `MONGODB_URI` | Cadena de conexión de Atlas (`mongodb+srv://usuario:contraseña@...`) |
| `MONGODB_DB` | Nombre de la base (`parche`) |
| `JWT_SECRET` | Clave larga y aleatoria para firmar las sesiones |
| `FRONTEND_URL` | Direcciones de la interfaz que pueden llamar a la API (CORS), separadas por coma |
| `SEED_PASSWORD` | Contraseña de las cuentas de prueba (solo la usa `CargarDatos.py`) |

> `.env` está en `.gitignore`. **Nunca** subas credenciales al repositorio.

Prepara la base y arranca la API:

```bash
python scripts/CrearColecciones.py      # colecciones, validación e índices (se puede repetir)
python scripts/CrearIndiceBusqueda.py   # índice de Atlas Search (se puede repetir)
python scripts/CargarDatos.py           # ⚠️ BORRA los datos y carga los de prueba (pide escribir SI)
uvicorn app.Main:app --reload
```

- API: http://127.0.0.1:8000
- Documentación interactiva: http://127.0.0.1:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env            # VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

Interfaz: http://localhost:5173

### Cuentas de prueba
Las crea `CargarDatos.py`, todas con la contraseña definida en `SEED_PASSWORD`:

| Rol | Correo |
|---|---|
| Jugador | `santiago.suarez@gmail.com` |
| Propietario | `laura.gomez@elgolazo.co` |
| Administrador | `admin@parche.co` |

## Pruebas y calidad

### Pruebas automáticas (backend)
Hay 30 pruebas, con pytest, de las reglas críticas:
- cruce de reservas, incluido un cruce parcial (7 a 9 contra 8 a 9);
- bloqueos;
- 6 reservas simultáneas, de las que solo una puede ganar;
- precio de hora pico;
- reglas de tiempo y cancelación con 24 h;
- cupos y uniones simultáneas a un partido;
- aislamiento multi-tenant, roles y moderación;
- paso a `finalizada`;
- validación `$jsonSchema`.

```bash
cd backend
pip install -r RequisitosPruebas.txt
python -m pytest
```

- Las pruebas **no tocan Atlas**. `pymongo-inmemory` levanta un **MongoDB 7.0 real y temporal** en tu PC; la primera vez descarga el servidor oficial desde `fastdl.mongodb.org`. Si la base no es local o no se llama `parche_pruebas`, las pruebas se detienen.
- Cada prueba crea las colecciones con **los mismos** `$jsonSchema` e índices de `scripts/CrearColecciones.py`, así que se prueba exactamente lo que está en Atlas.
- No se usa `mongomock` porque no aplica el índice único sobre arreglos: no detecta el cruce parcial de franjas.

### Linter (frontend)
```bash
cd frontend
npm run lint
```
ESLint revisa con las reglas recomendadas de JavaScript y de React Hooks.

### Mantenimiento
`python scripts/FinalizarReservas.py` cuenta las reservas activas que ya terminaron. Con `--aplicar`, las marca como `finalizada`; se puede repetir sin efectos extra. Lo mismo hace la ruta del admin `POST /api/admin/mantenimiento/finalizar-reservas`.

## Despliegue

| Pieza | Servicio | Configuración |
|---|---|---|
| API | **Render** (Web Service) | Root Directory `backend` · Build `pip install -r requirements.txt` · Start `uvicorn app.Main:app --host 0.0.0.0 --port $PORT` · Health check `/api/salud` · Variables `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `FRONTEND_URL` |
| Interfaz | **Vercel** | Root Directory `frontend` · Preset Vite · Variable `VITE_API_URL` = URL de Render · `vercel.json` reescribe las rutas del SPA |
| Base de datos | **MongoDB Atlas** | En *Network Access*, `0.0.0.0/0` (Render no tiene IP fija), compensado con un usuario de mínimo privilegio y TLS |

**Pasos:**
1. En `FRONTEND_URL` de Render pon la URL de Vercel y la local, separadas por coma: `https://<proyecto>.vercel.app,http://localhost:5173`.
2. Cada `git push` a `main` redespliega automáticamente.
3. El plan gratuito de Render se suspende tras 15 minutos sin uso. Abre la app un minuto antes de una demostración.

## Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| `SSL handshake failed ... tlsv1 alert internal error` | Tu IP no está en la lista de acceso de Atlas. Agrégala en *Network Access* |
| El navegador bloquea las llamadas (error de CORS) | La dirección de la interfaz no está en `FRONTEND_URL` |
| La interfaz carga una versión vieja | Detén Vite (Ctrl + C), corre `npm run dev` y recarga con Ctrl + Shift + R |
