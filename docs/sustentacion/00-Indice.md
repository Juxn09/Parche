# Guía de sustentación — Parche

> Proyecto final de Bases de Datos II · Prof. Juan Carlos Gómez
> Integrantes: Juan Camilo Moreno, Marshall Robinson, Carlos Palacios

| Enlace | Dirección |
|---|---|
| Aplicación | https://parche-six.vercel.app |
| API (documentación) | https://parche-akv4.onrender.com/docs |
| Estado de la API | https://parche-akv4.onrender.com/api/salud |
| Repositorio | https://github.com/Juxn09/Parche |

## Índice general

| Parte | Para qué | Archivo |
|---|---|---|
| **Hoja de repaso** (2 páginas) | Leer la noche antes y 10 minutos antes | `HojaDeRepaso.md` |
| **A · Guion para decir en voz alta** | La exposición, en orden, con las demos | `A-Guion.md` |
| **B · Anexo de herramientas** | Cada herramienta en 9 campos, matriz de conexiones, despliegue de cero, preguntas de configuración y lo que falta completar de los paneles | `B-Herramientas.md` |
| **C · Lógica, consultas y recorridos** | Las 15 reglas con su código y su prueba, los 9 reportes etapa por etapa, los recorridos de código y las limitaciones | `C-LogicaConsultasRecorridos.md` |
| **D · Diagramas** | D1 a D6 en draw.io, PNG y SVG | `D-Diagramas.md` |

## Contenido por parte

**A · Guion:** 1 Apertura · 2 Arquitectura · 3 Modelado · 4 Funcionalidades y recorrido de una reserva · 5 Consultas · 6 Calidad · 7 Cierre · 8 Preguntas por criterio y cambios en vivo · 9 Mapa contra el enunciado · 10 Reparto · 11 Plan B · 12 Ventanas y tiempos · 13 Límites del sistema.

**B · Herramientas:** B0 Datos de paneles por completar · B1 Matriz de conexiones · B2 Servicios en la nube · B3 Backend · B4 Pruebas y calidad · B5 Interfaz · B6 Herramientas del equipo · B7 Despliegue de cero · B8 Preguntas de configuración.

**C · Lógica:** C1 Reglas R1 a R15 y ciclos de vida · C2 Los 9 reportes y otras consultas, operadores e índices · C3 Recorridos (registro y login, búsqueda, CRUD de canchas y sedes, unirse, cancelar, aprobar, bloquear, frontend) · C4 Limitaciones y mejoras.

**D · Diagramas:** D1 Modelo · D2 Arquitectura · D3 Secuencia · D4 Roles · D5 Ciclos de vida · D6 Índices.

## Convenciones

- `archivo:línea` apunta al repositorio en la rama `main`.
- **ESCRIBE EN ATLAS** marca las demos que cambian datos reales; cada una dice cómo revertirla.
- **CONFIGURADO EN PANEL: confirmar** marca lo que no está en el código (lista completa en B0).
- "Sin prueba" marca reglas que ninguna de las 54 pruebas cubre.
