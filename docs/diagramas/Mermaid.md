# Diagramas en Mermaid (respaldo)

Los diagramas oficiales están en draw.io (`D1` a `D6` en esta carpeta). Estos bloques Mermaid se conservan como respaldo: GitHub y Obsidian los dibujan solos.

## Arquitectura

```mermaid
flowchart LR
    U[Navegador] -->|HTTPS| V[Interfaz React<br/>Vercel]
    V -->|fetch JSON + token JWT<br/>servicios/Api.js| A[API FastAPI<br/>Render]
    A -->|PyMongo, TLS<br/>usuario parche_app| M[(MongoDB Atlas<br/>cluster M0, AWS N. Virginia)]
    M --- S[Atlas Search<br/>índice busqueda_canchas]
```

## Modelo de datos

```mermaid
erDiagram
    USUARIOS ||--o{ SEDES : "posee (propietario_id)"
    SEDES ||--o{ CANCHAS : "tiene (sede_id)"
    USUARIOS ||--o{ RESERVAS : "hace (usuario_id)"
    CANCHAS ||--o{ RESERVAS : "se reserva (cancha_id)"
    DEPORTES ||--o{ CANCHAS : "catalogo que valida"
    USUARIOS ||--o| EMPRESA : "embebe"
    DEPORTES ||--|{ MODALIDAD : "embebe"
    SEDES ||--|{ HORARIO : "embebe"
    RESERVAS ||--o| PAGO : "embebe"
    RESERVAS ||--o| PARTIDO_ABIERTO : "embebe"
    PARTIDO_ABIERTO ||--o{ PARTICIPANTE : "embebe"

    USUARIOS {
        ObjectId _id PK
        string nombre
        string email UK
        string password_hash
        string rol "cliente | propietario | admin"
        string ciudad
        bool activo
    }
    EMPRESA {
        string razon_social
        string nit
    }
    DEPORTES {
        ObjectId _id PK
        string nombre UK
        bool activo
    }
    MODALIDAD {
        string nombre
        int jugadores
        int duracion_min
    }
    SEDES {
        ObjectId _id PK
        ObjectId propietario_id FK
        string nombre
        string ciudad
        string zona
        GeoJSON ubicacion
        array servicios
        string estado "pendiente | aprobada | rechazada"
    }
    HORARIO {
        string dia
        string abre
        string cierra
    }
    CANCHAS {
        ObjectId _id PK
        ObjectId sede_id FK
        ObjectId propietario_id "copia"
        object sede "copia: nombre, ciudad, zona"
        string nombre
        array deportes "deporte + modalidad"
        string superficie
        int precio_hora
        int precio_hora_pico
        string estado "activa | mantenimiento | inactiva"
    }
    RESERVAS {
        ObjectId _id PK
        string tipo "reserva | bloqueo"
        ObjectId cancha_id FK
        ObjectId usuario_id FK
        ObjectId propietario_id "copia"
        object cancha "copia historica"
        string deporte
        string modalidad
        string fecha
        array franjas "ej. 2026-11-12T19"
        int precio_total "copia historica"
        string estado "activa | cancelada | finalizada"
    }
    PAGO {
        string metodo
        int valor
        string estado
    }
    PARTIDO_ABIERTO {
        int cupos_totales
        int cuota
        string estado "abierto | completo | cerrado"
    }
    PARTICIPANTE {
        ObjectId usuario_id
        string nombre
        int cuota_pagada
        date fecha_union
    }
```
