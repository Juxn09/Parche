# Parte B — Anexo de herramientas

Inventario de **todo** lo que usa Parche, sacado de `backend/requirements.txt`, `backend/RequisitosPruebas.txt`, `frontend/package.json`, `frontend/vercel.json`, `backend/.python-version`, los archivos de configuración y lo visto en los paneles. Cada ficha tiene los mismos 9 campos. Las variables de entorno aparecen **solo por nombre**.

## B0. Lo que debes completar tú (CONFIGURADO EN PANEL)

Estos datos se configuraron en un panel web y no quedaron en el código. Complétalos antes de presentar:

| # | Panel | Dato | Tu respuesta |
|---|---|---|---|
| 1 | Atlas → Network Access | ¿Sigue `0.0.0.0/0`? ¿Quedan IP del equipo de desarrollo en la lista? | ______ |
| 2 | Atlas → Database Access | Confirmar que `parche_app` tiene solo `readWrite` y `dbAdmin` sobre `parche` | ______ |
| 3 | Atlas → Compass | ¿Con qué usuario se conecta Compass ("Parche Atlas")? | ______ |
| 4 | Atlas | ¿Hay alertas o copias de seguridad configuradas? (el panel muestra "Backups Inactive") | ______ |
| 5 | Render | Plan (Free), región del servicio y si el auto-deploy desde `main` está activo | ______ |
| 6 | Render | Health Check Path configurado (el README dice `/api/salud`) | ______ |
| 7 | Vercel | Comando de build y carpeta de salida (por defecto del preset Vite: `npm run build` y `dist`) | ______ |
| 8 | Vercel | Versión de Node.js del proyecto | ______ |
| 9 | Vercel | Modo exacto de Deployment Protection (Standard, Only Preview…) | ______ |
| 10 | Vercel | Rama de producción (se espera `main`) y dominio `parche-six.vercel.app` como Production | ______ |
| 11 | GitHub | ¿El repositorio es público? ¿Quiénes son colaboradores? | ______ |
| 12 | Equipo | Alternativas que se descartaron al elegir cada herramienta (donde dice "sin registro") | ______ |

## B1. Matriz de conexiones

| Enlace | Protocolo y puerto | Credencial | Dónde se configura | Cómo verificarlo |
|---|---|---|---|---|
| Navegador → Vercel | HTTPS, 443 | Ninguna (sitio público) | Proyecto de Vercel, dominio `parche-six.vercel.app` | Abrir la URL sin sesión → 200 con la portada |
| Navegador → Render (API) | HTTPS, 443; `fetch` con JSON | Token JWT en `Authorization: Bearer` (rutas privadas). La URL sale de `VITE_API_URL` | `frontend/src/servicios/Api.js:24`; variable `VITE_API_URL` en Vercel; CORS con `FRONTEND_URL` en Render | DevTools → Red: peticiones a `parche-akv4.onrender.com` con 200; cabecera `access-control-allow-origin` |
| Navegador → Google Fonts | HTTPS, 443 | Ninguna | `frontend/index.html:8-15` | DevTools → Red: `fonts.googleapis.com` |
| Render → Atlas | `mongodb+srv` (DNS SRV) sobre TLS, puerto 27017 | Usuario `parche_app` dentro de `MONGODB_URI` | Variable `MONGODB_URI` en Render; `backend/app/BaseDatos.py:15-21`; Network Access en Atlas | `GET /api/salud` → `"estado": "ok"` |
| GitHub → Render | Webhook HTTPS (lo gestiona Render) | Conexión de Render con la cuenta de GitHub | Panel de Render (repositorio y rama `main`) | Un push a `main` dispara un despliegue en ~1 min (comprobado el 10 nov 2026) |
| GitHub → Vercel | Webhook HTTPS (lo gestiona Vercel) | Integración de Vercel con GitHub | Panel de Vercel | Cada commit muestra el estado "Vercel" en GitHub (comprobado en la API pública de GitHub) |
| VS Code → GitHub | Git sobre HTTPS, 443 | Credencial de GitHub del usuario (no está en el repositorio) | Configuración de Git del equipo | `git push origin main` |
| Compass → Atlas | `mongodb+srv` sobre TLS, 27017 | Usuario de base de datos guardado en la conexión "Parche Atlas" | Compass | Abrir la conexión y ver la base `parche` |
| Scripts → Atlas | `mongodb+srv` sobre TLS, 27017 | `MONGODB_URI` de `backend/.env` | `backend/scripts/*.py` (cargan `backend/.env`) | `python scripts/FinalizarReservas.py` (sin `--aplicar` solo cuenta) |
| pytest → MongoDB temporal | `mongodb://127.0.0.1:<puerto aleatorio>` | Ninguna (servidor local temporal) | `backend/pruebas/conftest.py:18-43` | `python -m pytest` → "54 passed" |

---

## B2. Fichas: servicios en la nube

### MongoDB Atlas
1. **Qué es:** el servicio administrado de MongoDB en la nube.
2. **Qué hace en Parche:** guarda la base `parche` con 5 colecciones; la API se conecta en `backend/app/BaseDatos.py:15`.
3. **Importancia:** sin Atlas no se cumple el requisito de "base de datos en la nube" y la app no tiene datos.
4. **Por qué:** permite `$jsonSchema`, índices únicos parciales, Aggregation Pipeline y Atlas Search, que solo existe en Atlas. Alternativa descartada: base local (no cumple la nube). Otras opciones del enunciado (Firestore, DynamoDB, Cosmos DB): sin registro de por qué se descartaron → ______
5. **Cómo se configuró:** cluster M0 `Parche` en AWS us-east-1 (versión 8.0, réplica de 3 nodos, visto en el panel) → usuario `parche_app` con `readWrite` + `dbAdmin` sobre `parche` → Network Access `0.0.0.0/0` → cadena en `MONGODB_URI` → `python scripts/CrearColecciones.py` → `python scripts/CrearIndiceBusqueda.py`.
6. **Cómo se conecta:** con Render, Compass y los scripts, por `mongodb+srv` sobre TLS, con el usuario de `MONGODB_URI`; se configura en la variable de entorno y en Network Access.
7. **Si falla:** la API responde 503 en JSON y, al arrancar, no inicia (`backend/app/Main.py:23`). Se comprueba con `/api/salud`.
8. **Cómo mostrarla:** Atlas web → Clusters → `Parche`; Browse Collections.
9. **Pregunta:** "¿Por qué `0.0.0.0/0`?" → "Render no tiene IP fija; lo compensan el usuario con mínimo privilegio, la contraseña fuera del código y TLS."

### Atlas Search
1. **Qué es:** el motor de búsqueda de texto (Apache Lucene) integrado en Atlas.
2. **Qué hace:** índice `busqueda_canchas` sobre `canchas`; la API lo usa con `$search` y `fuzzy` en `backend/app/routers/Canchas.py:36-47`.
3. **Importancia:** sin él, la búsqueda no tolera errores ("golaso") ni tildes ("fontibon"); quedaría solo `$regex`.
4. **Por qué:** tolera errores y ordena por relevancia. Alternativa: índice de texto clásico de MongoDB o solo `$regex` (sin registro de comparación formal) → ______
5. **Cómo se configuró:** `python scripts/CrearIndiceBusqueda.py` (crea o actualiza; espera a que quede listo). Analizador propio `espanol_sin_tildes` (tokenizador `standard`, filtros `lowercase` e `icuFolding`), `dynamic: false`, campos `nombre`, `sede.nombre/zona/ciudad`, `deportes.deporte/modalidad` (`backend/scripts/CrearIndiceBusqueda.py:30-60`).
6. **Cómo se conecta:** vive en el mismo cluster; la API lo consulta por la misma conexión de PyMongo.
7. **Si falla:** la API atrapa `OperationFailure` y usa `$regex` (`Canchas.py:48-53`); la respuesta dice `"motor_busqueda": "regex"`.
8. **Cómo mostrarla:** app → buscar `golaso`; `/docs` → `GET /api/canchas?texto=golaso` → `"atlas_search"`; Atlas → Search & Vector Search.
9. **Pregunta:** "¿Qué pasa si escribo mal?" → "`fuzzy` con `maxEdits: 1` acepta una letra de diferencia; si aun así no hay nada, cae a `$regex`."

### Render
1. **Qué es:** plataforma en la nube que ejecuta servicios web.
2. **Qué hace:** corre la API en `https://parche-akv4.onrender.com`.
3. **Importancia:** sin Render la API no está en internet y la app publicada no funciona.
4. **Por qué:** plan gratuito para Python con despliegue desde GitHub. Alternativas: sin registro → ______
5. **Cómo se configuró (README):** Web Service, rama `main`, Root `backend`, Build `pip install -r requirements.txt`, Start `uvicorn app.Main:app --host 0.0.0.0 --port $PORT`, Health check `/api/salud`, Python 3.13 por `backend/.python-version`. Variables: `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `FRONTEND_URL`. Plan y región: **CONFIGURADO EN PANEL: confirmar** (B0 #5).
6. **Cómo se conecta:** recibe HTTPS del navegador (CORS con `FRONTEND_URL`), habla con Atlas por `mongodb+srv`, y GitHub le avisa de cada push.
7. **Si falla:** la app muestra errores de red; el plan gratuito se duerme tras unos 15 min y la primera petición tarda cerca de un minuto. Se comprueba con `/api/salud`.
8. **Cómo mostrarlo:** pestaña con `/api/salud`; panel de Render (Events / Logs).
9. **Pregunta:** "¿Cómo llega un cambio a producción?" → "Push a `main`; Render reconstruye y reinicia solo."

### Health check de Render
1. **Qué es:** una ruta que Render consulta para saber si el servicio está sano.
2. **Qué hace:** `GET /api/salud` hace `ping` a Atlas y cuenta documentos (`backend/app/Main.py:60-69`).
3. **Importancia:** si la API no responde, Render no da por bueno el despliegue; sirve además para despertar el servicio.
4. **Por qué:** comprueba API y base a la vez. Sin alternativa registrada.
5. **Cómo se configuró:** Health Check Path `/api/salud` en Render (**CONFIGURADO EN PANEL: confirmar**, B0 #6).
6. **Cómo se conecta:** Render → API → Atlas.
7. **Si falla:** responde 503 si Atlas no contesta.
8. **Cómo mostrarlo:** abrir `https://parche-akv4.onrender.com/api/salud`.
9. **Pregunta:** "¿Cómo saben que está conectada a Atlas?" → "`/api/salud` hace ping y cuenta documentos de cada colección."

### Vercel
1. **Qué es:** plataforma que compila y publica sitios web.
2. **Qué hace:** publica la interfaz en `https://parche-six.vercel.app`; `frontend/vercel.json` reescribe todas las rutas a `index.html`.
3. **Importancia:** sin Vercel la interfaz no está en internet.
4. **Por qué:** preset de Vite y despliegue desde GitHub. Alternativas: sin registro → ______
5. **Cómo se configuró:** proyecto `parche` del equipo `juxn-s-projects`, Root `frontend`, preset Vite, variable `VITE_API_URL` = URL de Render. Build, salida y Node: **CONFIGURADO EN PANEL: confirmar** (B0 #7 y #8).
6. **Cómo se conecta:** sirve HTTPS al navegador; GitHub le avisa de cada push; la URL de la API queda incrustada al compilar.
7. **Si falla:** la app no carga; se comprueba con una petición sin sesión a la URL de producción (200).
8. **Cómo mostrarlo:** la app; panel de Vercel → Deployments.
9. **Pregunta:** "¿Por qué a otros les pedía iniciar sesión?" → "Abrían una dirección de rama o de despliegue, que Vercel protege; la de producción es pública."

### Deployment Protection de Vercel
1. **Qué es:** la protección de Vercel que exige iniciar sesión para ver ciertas direcciones.
2. **Qué hace:** las direcciones de rama (`parche-git-…-juxn-s-projects.vercel.app`) y de despliegue responden 302 a `vercel.com/sso-api`; `parche-six.vercel.app` responde 200.
3. **Importancia:** si se comparte una dirección protegida, el profesor no puede abrir la app.
4. **Por qué:** es el valor por defecto de Vercel; no se cambió.
5. **Cómo se configuró:** Settings → Deployment Protection (**CONFIGURADO EN PANEL: confirmar**, B0 #9).
6. **Cómo se conecta:** actúa entre el navegador y Vercel.
7. **Si falla / cómo se comprueba:** `curl -I` sin cookies a cada dirección (hecho el 10 nov 2026).
8. **Cómo mostrarla:** no se muestra; solo se comparte `parche-six.vercel.app`.
9. **Pregunta:** "¿Cuál es la URL pública?" → "`https://parche-six.vercel.app`, la de producción."

### GitHub (y como disparador de despliegues)
1. **Qué es:** el servicio que aloja el repositorio Git.
2. **Qué hace:** guarda el código en `https://github.com/Juxn09/Parche` (ramas `main` y `evolucion`, tags `respaldo-pre-evolucion` y `respaldo-main-9ba9116`) y avisa a Render y Vercel de cada push a `main`.
3. **Importancia:** sin él no hay despliegue automático ni el "enlace al repositorio" que pide el enunciado.
4. **Por qué:** estándar para Git y compatible con Render y Vercel. Sin alternativa registrada.
5. **Cómo se configuró:** repositorio creado en la cuenta `Juxn09`; Render y Vercel conectados desde sus paneles (B0 #11).
6. **Cómo se conecta:** recibe `git push` desde el equipo (HTTPS) y llama por webhook a Render y Vercel.
7. **Si falla:** no hay despliegues nuevos; lo publicado sigue funcionando.
8. **Cómo mostrarlo:** la página del repositorio; los estados "Vercel" junto a cada commit.
9. **Pregunta:** "¿Cómo despliegan?" → "Push a `main`; GitHub avisa y cada plataforma reconstruye."

### Google Fonts
1. **Qué es:** el servicio de fuentes tipográficas de Google.
2. **Qué hace:** carga la tipografía Archivo (`frontend/index.html:8-15`).
3. **Importancia:** si falla, la app usa una fuente del sistema; todo sigue funcionando.
4. **Por qué:** Archivo da la identidad visual (titulares anchos). Sin alternativa registrada.
5. **Cómo se configuró:** `<link rel="preconnect">` y la hoja de estilos de `fonts.googleapis.com` en `index.html`.
6. **Cómo se conecta:** el navegador la pide por HTTPS, sin credencial.
7. **Si falla:** cambia la apariencia, no la funcionalidad.
8. **Cómo mostrarla:** DevTools → Red.
9. **Pregunta:** "¿La app depende de servicios externos además de los tres?" → "Solo de Google Fonts para la tipografía; si falla, se usa otra fuente."

---

## B3. Fichas: backend

### Python y entorno virtual (`.venv`, pip, `requirements.txt`, `.python-version`)
1. **Qué es:** el lenguaje del backend; `.venv` aísla las librerías del proyecto; `pip` las instala.
2. **Qué hace:** ejecuta la API y los scripts. `requirements.txt` fija versiones exactas; `backend/.python-version` dice `3.13`.
3. **Importancia:** sin versiones fijas, Render podría instalar otras y romper la API.
4. **Por qué:** FastAPI y PyMongo son de Python. Sin alternativa registrada.
5. **Cómo se configuró:** `python -m venv .venv` → activar → `pip install -r requirements.txt` (y `-r RequisitosPruebas.txt` para pruebas). **Diferencia de versión:** en el equipo de desarrollo el `.venv` usa **Python 3.14**; Render usa **3.13**. Las 54 pruebas pasan en 3.14; en 3.13 corre la producción.
6. **Cómo se conecta:** Render instala lo mismo con el comando de build.
7. **Si falla:** el build de Render falla y no se publica; se ve en los logs.
8. **Cómo mostrarlo:** VS Code → `backend/requirements.txt`, `backend/.python-version`.
9. **Pregunta:** "¿Qué versión de Python usan?" → "3.13 en Render, fijada en `.python-version`; en desarrollo 3.14."

### FastAPI
1. **Qué es:** framework web de Python para construir APIs.
2. **Qué hace:** `backend/app/Main.py:27` crea la app; 7 routers (`Main.py:51-57`) y 41 rutas en total; documentación en `/docs`.
3. **Importancia:** es la API completa; sin ella no hay backend.
4. **Por qué:** valida con Pydantic y genera `/docs` solo. Alternativa: sin registro (¿Flask, Django?) → ______
5. **Cómo se configuró:** `fastapi==0.162.2` en `requirements.txt`; routers en `backend/app/routers/`; manejo de errores y CORS en `Main.py:37-48`.
6. **Cómo se conecta:** recibe HTTPS del navegador (vía Uvicorn) y usa PyMongo para Atlas.
7. **Si falla:** errores 500 en JSON (`backend/app/Errores.py`).
8. **Cómo mostrarlo:** `https://parche-akv4.onrender.com/docs`.
9. **Pregunta:** "¿Dónde se definen las rutas?" → "Un router por tema en `backend/app/routers/`, registrados en `Main.py`."

### Starlette
1. **Qué es:** el framework ASGI sobre el que está construido FastAPI.
2. **Qué hace:** da los middlewares (CORS, el capturador de errores) y el cliente de pruebas (`fastapi.testclient`, `conftest.py:33`).
3. **Importancia:** FastAPI no funciona sin Starlette.
4. **Por qué:** viene con FastAPI.
5. **Cómo se configuró:** `starlette==1.10.0`, instalado como dependencia.
6. **Cómo se conecta:** por dentro de FastAPI.
7. **Si falla:** la API no arranca.
8. **Cómo mostrarlo:** `Main.py:13` (`CORSMiddleware` viene de Starlette a través de FastAPI).
9. **Pregunta:** "¿Qué es CORS y dónde está?" → "La regla del navegador que solo deja llamar a la API desde orígenes permitidos; `Main.py:42-48` con `FRONTEND_URL`."

### Uvicorn
1. **Qué es:** el servidor ASGI que ejecuta la app de FastAPI.
2. **Qué hace:** en local `uvicorn app.Main:app --reload` (puerto 8000); en Render, con `--host 0.0.0.0 --port $PORT`.
3. **Importancia:** sin servidor, la API no escucha peticiones.
4. **Por qué:** es el servidor recomendado para FastAPI.
5. **Cómo se configuró:** `uvicorn==0.54.0` con sus extras `httptools`, `watchfiles` (recarga en desarrollo), `websockets`, `PyYAML`, `click`, `h11`.
6. **Cómo se conecta:** recibe HTTP y lo pasa a FastAPI.
7. **Si falla:** Render marca el servicio caído.
8. **Cómo mostrarlo:** comando de inicio en el README.
9. **Pregunta:** "¿Qué ejecuta Render?" → "`uvicorn app.Main:app` en el puerto que Render asigna."

### PyMongo (y dnspython)
1. **Qué es:** el driver oficial de MongoDB para Python; dnspython resuelve las direcciones `mongodb+srv`.
2. **Qué hace:** un único `MongoClient` con `serverSelectionTimeoutMS=8000`, `tz_aware=True` y `appname="Parche API"` (`backend/app/BaseDatos.py:15-21`).
3. **Importancia:** es el único camino entre la API y Atlas.
4. **Por qué:** driver oficial y sincrónico, simple de explicar. Alternativa: Motor (asíncrono), sin registro → ______
5. **Cómo se configuró:** `pymongo==4.19.0`, `dnspython==2.9.2`; la cadena viene de `MONGODB_URI`.
6. **Cómo se conecta:** con Atlas por `mongodb+srv` sobre TLS (TLS lo activa la cadena de Atlas; el código no lo configura aparte).
7. **Si falla:** a los 8 s lanza `ServerSelectionTimeoutError` → 503 (`Errores.py`).
8. **Cómo mostrarlo:** `BaseDatos.py:15-21`.
9. **Pregunta:** "¿Abren una conexión por petición?" → "No: un solo cliente con un pool de conexiones que se reutiliza."

### Pydantic
1. **Qué es:** librería que valida datos con tipos de Python.
2. **Qué hace:** modelos de entrada en `backend/app/Modelos.py` (por ejemplo `ReservaEntrada`, línea 104: horas 1..3; `RegistroEntrada`, línea 29: rol solo cliente o propietario).
3. **Importancia:** sin ella, datos mal formados llegarían a las reglas y a la base.
4. **Por qué:** viene integrada con FastAPI.
5. **Cómo se configuró:** `pydantic==2.14.3` (con `pydantic_core`, `annotated-types`, `typing-inspection`, `typing_extensions`).
6. **Cómo se conecta:** FastAPI la usa antes de ejecutar cada ruta.
7. **Si falla una validación:** 422, traducido al español (`backend/app/Errores.py:55` y `:89`).
8. **Cómo mostrarlo:** `/docs` con un cuerpo inválido (como cliente).
9. **Pregunta:** "¿Qué pasa si mando horas = 9?" → "422 con el campo y el motivo en español."

### PyJWT
1. **Qué es:** librería para crear y verificar tokens JWT.
2. **Qué hace:** `crear_token` (`backend/app/Seguridad.py:37-51`) firma con HS256 y `JWT_SECRET`; `usuario_actual` (`:65-82`) verifica firma y expiración.
3. **Importancia:** sin tokens no hay sesiones ni roles.
4. **Por qué:** estándar simple para APIs sin estado. Sin alternativa registrada.
5. **Cómo se configuró:** `PyJWT==2.15.1`; variables `JWT_SECRET` (obligatoria) y `JWT_MINUTOS` (opcional, 480).
6. **Cómo se conecta:** el navegador guarda el token y lo envía en `Authorization`.
7. **Si falla:** 401 "Token inválido" o "Tu sesión expiró"; la interfaz lleva a Ingresar.
8. **Cómo mostrarlo:** `/docs` → Authorize.
9. **Pregunta:** "¿Puedo cambiar mi rol en el token?" → "No: la firma deja de coincidir y la API responde 401."

### bcrypt
1. **Qué es:** algoritmo y librería para guardar contraseñas como hash con sal.
2. **Qué hace:** `cifrar_clave` y `verificar_clave` (`backend/app/Seguridad.py:24-31`).
3. **Importancia:** sin él, las contraseñas quedarían legibles en la base.
4. **Por qué:** es lento a propósito y lleva sal. Sin alternativa registrada.
5. **Cómo se configuró:** `bcrypt==5.0.0`.
6. **Cómo se conecta:** el registro guarda `password_hash`; el login lo compara.
7. **Si falla:** el login responde 401 "Correo o contraseña incorrectos".
8. **Cómo mostrarlo:** Compass → `usuarios` (se ve el hash, nunca la clave; no proyectar en pantalla).
9. **Pregunta:** "¿Pueden ver mi contraseña?" → "No: guardamos un hash bcrypt que no se puede revertir."

### python-dotenv, `.env`, `.env.example` y `.gitignore`
1. **Qué es:** python-dotenv lee variables desde un archivo `.env`; `.gitignore` le dice a Git qué no subir.
2. **Qué hace:** `backend/app/Config.py:12` carga `backend/.env`; `MONGODB_URI` y `JWT_SECRET` son obligatorias (`:15-25`).
3. **Importancia:** es lo que mantiene las credenciales fuera del repositorio, como pide el enunciado.
4. **Por qué:** forma estándar de separar configuración y código.
5. **Cómo se configuró:** `python-dotenv==1.2.4`. Variables del backend: `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `FRONTEND_URL`, `SEED_PASSWORD` (solo `CargarDatos.py`) y, opcional, `JWT_MINUTOS`. Frontend: `VITE_API_URL`. `.gitignore` excluye `.env` y `.env.*` y permite `.env.example`.
6. **Cómo se conecta:** en local desde `.env`; en Render y Vercel, desde sus paneles.
7. **Si falla:** sin `MONGODB_URI` o `JWT_SECRET`, la API no arranca con un mensaje claro.
8. **Cómo mostrarlo:** `git check-ignore -v backend/.env` → `.gitignore:2:.env`.
9. **Pregunta:** "¿Dónde están las credenciales?" → "En `backend/.env` (ignorado por Git) y en las variables de Render."

### Otras dependencias del backend (transitivas)
1. **Qué son:** librerías que instalan FastAPI, Uvicorn o Pydantic por su cuenta: `anyio`, `idna`, `h11`, `click`, `httptools`, `watchfiles`, `websockets`, `PyYAML`, `annotated-doc`, `annotated-types`, `typing-inspection`, `typing_extensions`, `pydantic_core`, `opentelemetry-api`.
2. **Qué hacen:** soporte interno (asincronía, HTTP, recarga, tipos). El código de Parche no las importa directamente.
3. **Importancia:** sin ellas no arrancan FastAPI o Uvicorn.
4. **Por qué:** vienen con las librerías principales; se fijaron con `pip freeze` en `requirements.txt`.
5. **Cómo se configuró:** versiones exactas en `requirements.txt`.
6. **Cómo se conectan:** por dentro de las librerías principales.
7. **Si fallan:** falla el build en Render.
8. **Cómo mostrarlas:** `backend/requirements.txt`.
9. **Pregunta:** "¿Usan todas esas librerías?" → "Directamente no: son dependencias de FastAPI y Uvicorn; las fijamos para que Render instale lo mismo."

---

## B4. Fichas: pruebas y calidad

### pytest
1. **Qué es:** el framework de pruebas de Python.
2. **Qué hace:** corre las 54 pruebas de `backend/pruebas/` (archivos `Prueba*.py`, funciones `prueba_*`, `backend/pytest.ini`).
3. **Importancia:** demuestra que las reglas críticas (cruces, cupos, permisos) funcionan.
4. **Por qué:** estándar en Python. Sin alternativa registrada.
5. **Cómo se configuró:** `pytest==9.2.0` en `RequisitosPruebas.txt` (no se instala en Render); `pytest.ini` ya incluye `-q`.
6. **Cómo se conecta:** con un MongoDB temporal local, nunca con Atlas.
7. **Si falla una regla:** la prueba correspondiente falla. Comando: `python -m pytest` (sin `-q` adicional) → "54 passed" (117 s el 10 nov 2026).
8. **Cómo mostrarlo:** VS Code, terminal en `backend`.
9. **Pregunta:** "¿Cómo saben que el índice evita cruces?" → "`prueba_reservas_simultaneas_solo_una_gana` lanza 6 reservas a la vez y solo una gana."

### httpx
1. **Qué es:** cliente HTTP de Python.
2. **Qué hace:** lo usa `TestClient` de FastAPI para llamar a la API en las pruebas (`conftest.py:33`).
3. **Importancia:** sin él, `TestClient` no funciona.
4. **Por qué:** dependencia exigida por `TestClient`.
5. **Cómo se configuró:** `httpx==0.28.1` en `RequisitosPruebas.txt`.
6. **Cómo se conecta:** con la app en memoria, sin red.
7. **Si falla:** las pruebas no corren.
8. **Cómo mostrarlo:** `backend/RequisitosPruebas.txt`.
9. **Pregunta:** "¿Las pruebas levantan un servidor?" → "No: TestClient llama a la app en memoria."

### pymongo-inmemory (MongoDB 7.0 temporal)
1. **Qué es:** librería que descarga y arranca un MongoDB real y temporal para pruebas.
2. **Qué hace:** `Mongod(Context(..., version="7.0"))` en `backend/pruebas/conftest.py:26`; base `parche_pruebas` con los mismos validadores e índices; `conftest.py:43` se niega a correr contra otra base; reloj congelado en `AHORA` (`:48`).
3. **Importancia:** permite probar el índice único sobre arreglos, que un simulador no aplica.
4. **Por qué:** se descartó **mongomock** porque no aplica índices únicos sobre arreglos: un cruce parcial pasaba sin error.
5. **Cómo se configuró:** `pymongo-inmemory==0.5.0`; la primera vez descarga el binario de MongoDB 7.0.
6. **Cómo se conecta:** `mongodb://127.0.0.1` en un puerto aleatorio, sin credencial.
7. **Si falla:** las pruebas no arrancan.
8. **Cómo mostrarlo:** `conftest.py:18-43`.
9. **Pregunta:** "¿Por qué la versión 7.0 si Atlas tiene 8.0?" → "Para pruebas basta una versión con el mismo comportamiento de índices y validación; la diferencia está anotada."

### ESLint
1. **Qué es:** analizador de código JavaScript.
2. **Qué hace:** `npm run lint` con `frontend/eslint.config.js` (reglas recomendadas, React Hooks y React Refresh).
3. **Importancia:** detecta errores antes de ejecutar; 0 errores hoy (21 avisos).
4. **Por qué:** estándar en proyectos de React.
5. **Cómo se configuró:** `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals` como dependencias de desarrollo.
6. **Cómo se conecta:** solo en el equipo; Vercel no lo corre.
7. **Si falla:** muestra errores; no bloquea el despliegue.
8. **Cómo mostrarlo:** `npm run lint` en `frontend`.
9. **Pregunta:** "¿Revisan la calidad del código?" → "Sí: ESLint en la interfaz y 54 pruebas en el backend."

### axe-core
1. **Qué es:** motor de pruebas de accesibilidad.
2. **Qué hace:** midió la regleta y la portada en modo claro y oscuro: 0 violaciones (`Evidencias/Pantalla4Regleta/MedicionAxe.txt` en la bóveda).
3. **Importancia:** confirma contraste y nombres accesibles.
4. **Por qué:** se instaló local para no cargarlo de un CDN.
5. **Cómo se configuró:** `axe-core` como dependencia de desarrollo; se cargó desde el servidor de Vite en local.
6. **Cómo se conecta:** solo en el navegador de desarrollo.
7. **Si falla:** no afecta la app.
8. **Cómo mostrarlo:** el archivo de medición.
9. **Pregunta:** "¿Es accesible?" → "Medimos con axe la regleta y la portada: 0 violaciones; no probamos con lector de pantalla."

### Lighthouse
**No se usó.** Si el profesor pregunta: "Medimos accesibilidad con axe; rendimiento no lo medimos con Lighthouse."

---

## B5. Fichas: interfaz

### Node.js y npm
1. **Qué es:** Node ejecuta JavaScript fuera del navegador; npm instala paquetes.
2. **Qué hace:** corre Vite y ESLint; `npm install` usa `frontend/package.json` y `package-lock.json`.
3. **Importancia:** sin Node no se compila la interfaz.
4. **Por qué:** lo exige Vite.
5. **Cómo se configuró:** Node **24** en el equipo de desarrollo; en Vercel, **CONFIGURADO EN PANEL: confirmar** (B0 #8). Scripts: `npm run dev`, `npm run build`, `npm run lint`.
6. **Cómo se conecta:** descarga paquetes del registro de npm.
7. **Si falla:** no compila; Vercel muestra el error.
8. **Cómo mostrarlo:** `frontend/package.json`.
9. **Pregunta:** "¿Cómo se compila?" → "`npm run build` genera `dist/`, que Vercel publica."

### React (y react-dom)
1. **Qué es:** librería para construir interfaces con componentes.
2. **Qué hace:** `frontend/src/Main.jsx:8-16` monta la app; páginas en `src/paginas`, piezas en `src/componentes`.
3. **Importancia:** es toda la interfaz.
4. **Por qué:** componentes reutilizables y estado. Alternativa: sin registro → ______
5. **Cómo se configuró:** `react` y `react-dom` 19.3.1.
6. **Cómo se conecta:** con la API solo a través de `Api.js`.
7. **Si falla:** `ErrorPantalla.jsx` muestra un error en vez de una pantalla en blanco.
8. **Cómo mostrarlo:** VS Code → `src/App.jsx`.
9. **Pregunta:** "¿La interfaz habla con la base?" → "Nunca: solo con la API, desde `Api.js`."

### React Router
1. **Qué es:** librería de rutas para React.
2. **Qué hace:** `BrowserRouter` en `Main.jsx:10`; rutas en `App.jsx:24-35` (`/`, `/ingresar`, `/registro`, `/canchas/:id`, `/partidos`, `/mis-reservas`, `/panel`, `/admin`, 404; `/guia` solo en desarrollo).
3. **Importancia:** sin ella no hay navegación entre pantallas.
4. **Por qué:** estándar para React.
5. **Cómo se configuró:** `react-router` 8.5.1; `vercel.json` hace que recargar `/canchas/…` funcione.
6. **Cómo se conecta:** con Vercel (reescritura a `index.html`).
7. **Si falla:** rutas desconocidas → página "Balón por fuera".
8. **Cómo mostrarlo:** abrir `/una-ruta-que-no-existe`.
9. **Pregunta:** "¿Por qué existe `vercel.json`?" → "Para que al recargar una ruta interna Vercel entregue `index.html` y React decida qué pantalla mostrar."

### Vite (y @vitejs/plugin-react)
1. **Qué es:** herramienta que sirve la interfaz en desarrollo y la compila para producción.
2. **Qué hace:** `frontend/vite.config.js` (plugins React y Tailwind, puerto 5173 fijo); `npm run build` → `dist/`.
3. **Importancia:** sin Vite no hay servidor de desarrollo ni compilación.
4. **Por qué:** rápido y con preset en Vercel.
5. **Cómo se configuró:** `vite` 8.3.6, `@vitejs/plugin-react` 6.2.1.
6. **Cómo se conecta:** incrusta `VITE_API_URL` al compilar.
7. **Si falla:** el build falla en Vercel.
8. **Cómo mostrarlo:** `npm run dev` → `http://localhost:5173`.
9. **Pregunta:** "¿Qué pasa si cambia la URL de la API?" → "Se cambia `VITE_API_URL` en Vercel y se recompila."

### Tailwind CSS 4 (y @tailwindcss/vite)
1. **Qué es:** framework de estilos con clases utilitarias.
2. **Qué hace:** `frontend/src/Estilos.css:1` (`@import "tailwindcss"`), colores del sistema de diseño en `@theme` (`:81`) y modo oscuro (`:54`).
3. **Importancia:** da toda la apariencia.
4. **Por qué:** estilos consistentes sin CSS suelto. Sin alternativa registrada.
5. **Cómo se configuró:** `tailwindcss` y `@tailwindcss/vite` 4.3.5 como plugin de Vite.
6. **Cómo se conecta:** Vite lo procesa al compilar.
7. **Si falla:** la app se ve sin estilos.
8. **Cómo mostrarlo:** `Estilos.css` (variables `--grama`, `--acento`…).
9. **Pregunta:** "¿Tiene modo oscuro?" → "Sí, sigue la preferencia del sistema."

### lucide-react
1. **Qué es:** librería de íconos.
2. **Qué hace:** íconos de la interfaz, por ejemplo `frontend/src/componentes/Piezas.jsx:4`.
3. **Importancia:** visual; sin ella faltan íconos.
4. **Por qué:** íconos consistentes en lugar de emojis.
5. **Cómo se configuró:** `lucide-react` 1.70.0.
6. **Cómo se conecta:** se empaqueta con la app.
7. **Si falla:** no compila (import faltante).
8. **Cómo mostrarlo:** cualquier botón con ícono.
9. **Pregunta:** "¿De dónde salen los íconos?" → "De lucide-react, empaquetados en la app."

### `Api.js` (único cliente HTTP) y `Sesion.jsx`
1. **Qué es:** `Api.js` es el único archivo que llama a la API; `Sesion.jsx` guarda la sesión.
2. **Qué hace:** `api()` (`frontend/src/servicios/Api.js:24`) agrega el token, corta a los 45 s (`:8`, `:33`), avisa del 401 (`:62`) y traduce el `detail` (`:66`). `Sesion.jsx` guarda la sesión en `localStorage` con la clave `parche.sesion` (`:7`, `:17-21`) y expone `ingresar` y `registrar` (`:36`, `:41`).
3. **Importancia:** un solo punto para errores, token y tiempo de espera.
4. **Por qué:** evita repetir `fetch` en cada pantalla.
5. **Cómo se configuró:** archivos propios; la URL base sale de `VITE_API_URL`.
6. **Cómo se conecta:** navegador → Render por HTTPS.
7. **Si falla la red:** mensaje genérico de red; con 401, cierra la sesión y lleva a Ingresar con aviso.
8. **Cómo mostrarlo:** VS Code → `Api.js`.
9. **Pregunta:** "¿Dónde se guarda el token?" → "En `localStorage` del navegador, bajo `parche.sesion`."

---

## B6. Fichas: herramientas del equipo

### Git
1. **Qué es:** control de versiones.
2. **Qué hace:** historial de cambios; ramas `main` y `evolucion`; tags de respaldo.
3. **Importancia:** permite volver atrás y desplegar.
4. **Por qué:** estándar.
5. **Cómo se configuró:** `git` en el equipo; remoto `origin` en GitHub.
6. **Cómo se conecta:** con GitHub por HTTPS.
7. **Si falla:** no se puede subir; lo publicado sigue.
8. **Cómo mostrarlo:** `git log --oneline`.
9. **Pregunta:** "¿Cómo trabajaron los cambios grandes?" → "En la rama `evolucion`, con pruebas y build antes de fusionar a `main`, y un tag de respaldo."

### VS Code
1. **Qué es:** editor de código.
2. **Qué hace:** edición, terminal para correr la API, la interfaz, los scripts y las pruebas.
3. **Importancia:** herramienta de trabajo; no afecta la app publicada.
4. **Por qué:** sin registro.
5. **Cómo se configuró:** abierto en `C:\Users\camil\Proyectos\Parche`; `.vscode/` está en `.gitignore`.
6. **Cómo se conecta:** con Git y GitHub.
7. **Si falla:** no afecta la app.
8. **Cómo mostrarlo:** la ventana de VS Code durante la exposición.
9. **Pregunta:** —

### Claude Code
1. **Qué es:** asistente de programación con IA de Anthropic.
2. **Qué hizo en Parche:** escribió buena parte del código, los scripts, las pruebas, la documentación y estos diagramas, por fases y siguiendo instrucciones del equipo; el equipo definió el tema y las reglas, aprobó cada cambio a la base de datos antes de ejecutarlo y revisó y probó los resultados.
3. **Importancia:** acelera el trabajo; el equipo responde por el resultado.
4. **Por qué:** decisión del equipo.
5. **Cómo se usó:** sesiones con permisos controlados; commits locales y push solo con autorización.
6. **Cómo se conecta:** trabaja sobre el repositorio local.
7. —
8. —
9. **Pregunta:** "¿Ustedes entienden el código?" → responder con un recorrido de la Parte C. **Confirmar con el equipo cómo describir el aporte de cada uno:** ______

### MongoDB Compass y mongosh
1. **Qué es:** Compass es la aplicación de escritorio de MongoDB; mongosh es su consola.
2. **Qué hace:** revisar colecciones, documentos e índices; probar la validación (`insertOne` inválido) y correr pipelines de `docs/Consultas.md`.
3. **Importancia:** muestra la base en vivo en la sustentación.
4. **Por qué:** herramienta oficial.
5. **Cómo se configuró:** conexión "Parche Atlas" (usuario: **CONFIGURADO EN PANEL: confirmar**, B0 #3).
6. **Cómo se conecta:** Atlas por `mongodb+srv` sobre TLS.
7. **Si falla desde la red del salón:** ver el plan B de la Parte A.
8. **Cómo mostrarlo:** Compass → `parche` → `reservas`.
9. **Pregunta:** "Muéstreme dónde está guardado X" → Compass y el diagrama D1.

### Obsidian
1. **Qué es:** aplicación de notas en Markdown.
2. **Qué hace:** la bóveda "Proyecto Final Bases II" con notas de estudio, evidencias, respaldos y la entrega.
3. **Importancia:** organización del equipo; no forma parte de la app.
4. **Por qué:** decisión del equipo.
5. **Cómo se configuró:** instalada en el equipo de desarrollo.
6. —
7. —
8. —
9. —

### Herramientas usadas solo para la documentación
Chrome sin ventana (exportar PDF y PNG), mermaid (dibujar los diagramas de respaldo), PyMuPDF y Pillow (revisar los PDF y las imágenes) y un script propio que genera los `.drawio` y SVG. No forman parte de la app.

---

## B7. Cómo se despliega de cero

1. **Atlas:** crear el cluster M0 en AWS N. Virginia → crear el usuario `parche_app` con permisos solo sobre `parche` → Network Access `0.0.0.0/0` → copiar la cadena de conexión.
2. **Base:** en local, crear `backend/.env` desde `.env.example` con `MONGODB_URI`, `MONGODB_DB` y `JWT_SECRET` → `python scripts/CrearColecciones.py` → `python scripts/CrearIndiceBusqueda.py` → (opcional, base vacía) `python scripts/CargarDatos.py`.
3. **API en Render:** nuevo Web Service desde GitHub, rama `main`, Root `backend`, Build `pip install -r requirements.txt`, Start `uvicorn app.Main:app --host 0.0.0.0 --port $PORT`, Health check `/api/salud`, variables `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET` y `FRONTEND_URL` (provisional) → comprobar `/api/salud`.
4. **Interfaz en Vercel:** nuevo proyecto desde GitHub, Root `frontend`, preset Vite, variable `VITE_API_URL` = URL de Render → desplegar → anotar el dominio de producción.
5. **CORS:** en Render, poner en `FRONTEND_URL` el dominio de Vercel y `http://localhost:5173`, separados por coma → guardar (Render reinicia) → abrir la app y comprobar que carga las canchas.

## B8. Tabla de preguntas de configuración

| Pregunta | Respuesta corta |
|---|---|
| ¿Dónde están las credenciales? | En `backend/.env` (ignorado por Git) y en las variables de entorno de Render. En el repositorio solo está `.env.example` sin valores. |
| ¿Cómo se conecta la API a Atlas? | PyMongo con un único `MongoClient` y la cadena de `MONGODB_URI`, con el usuario `parche_app` (solo base `parche`) y TLS. `BaseDatos.py:15`. |
| ¿Qué pasa si cambia la URL de Vercel? | El navegador bloquea las llamadas por CORS hasta poner la nueva URL en `FRONTEND_URL` de Render. También hay que actualizar los enlaces del documento. |
| ¿Qué pasa si cambia la URL de Render? | Cambiar `VITE_API_URL` en Vercel y volver a desplegar la interfaz (la variable se incrusta al compilar). |
| ¿Cómo se despliega un cambio? | Commit y push a `main`: Render y Vercel redespliegan solos en uno o dos minutos. |
| ¿Por qué `0.0.0.0/0` en Atlas? | Render no tiene IP fija. Se compensa con mínimo privilegio, contraseña fuera del código y TLS. |
| ¿Por qué tarda la primera vez? | El plan gratuito de Render se duerme tras unos 15 minutos sin uso. |
| ¿Por qué otros ven un login de Vercel? | Abrieron una dirección de rama o de despliegue, que están protegidas; la pública es `parche-six.vercel.app`. |
| ¿Cómo se crean colecciones e índices? | Con scripts reproducibles: `CrearColecciones.py` y `CrearIndiceBusqueda.py`. |
