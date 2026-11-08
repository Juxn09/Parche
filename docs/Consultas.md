# Consultas y reportes — Parche

Cada reporte responde una **pregunta real** del negocio. Están implementados en
`backend/app/routers/Reportes.py` y aquí se presentan en sintaxis de **mongosh**
para ejecutarlos en vivo (Compass → *Open MongoDB shell*).

Antes de empezar:

```javascript
use parche
const laura = db.usuarios.findOne({ email: "laura.gomez@elgolazo.co" })._id
const desde = "2026-09-14", hasta = "2026-11-08"   // periodo de 8 semanas
```

| # | Pregunta | Para quién | Operadores |
|---|---|---|---|
| 1 | ¿Qué días y horas se llenan mis canchas? | Propietario | `$match` `$unwind` `$project` `$group` `$sort` |
| 2 | ¿Cuánto factura cada sede por mes? | Propietario | `$match` `$group` `$project` `$sort` |
| 3 | ¿Quiénes son mis 10 mejores clientes? | Propietario | `$group` `$sort` `$limit` `$lookup` `$unwind` |
| 4 | ¿Qué cancha tiene más cancelaciones? | Propietario | `$group` con `$cond`, `$project` |
| 5 | ¿Qué canchas casi no se usan? | Propietario | `$lookup` con `pipeline`, `$size`, `$sum` |
| 6 | ¿Qué deportes y modalidades se reservan más? | Admin | `$group` `$sort` |
| 7 | ¿Qué zonas tienen más demanda? | Admin | `$group` `$sort` `$limit` |
| 8 | ¿Los partidos abiertos se llenan? | Admin | `$project` `$facet` `$avg` |
| 9 | ¿Cómo crecen las reservas mes a mes? | Admin | `$group` con `$cond` |

---

## 1. Mapa de calor: ocupación por día y hora

```javascript
db.reservas.aggregate([
  { $match: { propietario_id: laura, tipo: "reserva",
              estado: { $in: ["activa", "finalizada"] },
              fecha: { $gte: desde, $lte: hasta } } },
  { $unwind: "$franjas" },
  { $project: {
      _id: 0,
      dia:  { $dayOfWeek: { $dateFromString: { dateString: { $substrBytes: ["$franjas", 0, 10] } } } },
      hora: { $toInt: { $substrBytes: ["$franjas", 11, 2] } } } },
  { $group: { _id: { dia: "$dia", hora: "$hora" }, franjas_ocupadas: { $sum: 1 } } },
  { $sort: { "_id.dia": 1, "_id.hora": 1 } }
])
```
- `$unwind` convierte una reserva de 2 horas en 2 documentos (uno por franja).
- `$dayOfWeek` devuelve 1 = domingo … 7 = sábado.
- La API además divide entre la capacidad (canchas × días del periodo) para dar el **porcentaje de ocupación**.
- **Utilidad:** el propietario ve sus horas pico y sus horas muertas (para promociones o mantenimiento).

## 2. Ingresos por sede y mes

```javascript
db.reservas.aggregate([
  { $match: { propietario_id: laura, tipo: "reserva",
              estado: { $in: ["activa", "finalizada"] },
              fecha: { $gte: desde, $lte: hasta } } },
  { $group: { _id: { sede: "$cancha.sede", mes: { $substrBytes: ["$fecha", 0, 7] } },
              ingresos: { $sum: "$precio_total" }, reservas: { $sum: 1 } } },
  { $project: { _id: 0, sede: "$_id.sede", mes: "$_id.mes", ingresos: 1, reservas: 1 } },
  { $sort: { mes: 1, ingresos: -1 } }
])
```
- **Sin `$lookup`:** la reserva ya trae la copia `cancha.sede` (referencia extendida).
- `precio_total` es la copia histórica: los ingresos no cambian si luego sube el precio.

## 3. Los 10 mejores clientes

```javascript
db.reservas.aggregate([
  { $match: { propietario_id: laura, tipo: "reserva",
              estado: { $in: ["activa", "finalizada"] },
              fecha: { $gte: desde, $lte: hasta } } },
  { $group: { _id: "$usuario_id", reservas: { $sum: 1 },
              gastado: { $sum: "$precio_total" }, ultima_reserva: { $max: "$fecha" } } },
  { $sort: { reservas: -1, gastado: -1 } },
  { $limit: 10 },
  { $lookup: { from: "usuarios", localField: "_id", foreignField: "_id", as: "cliente",
               pipeline: [ { $project: { _id: 0, nombre: 1, email: 1, telefono: 1 } } ] } },
  { $unwind: "$cliente" }
])
```
- El `$lookup` va **después** del `$limit`: solo se buscan 10 usuarios, no cientos.
- Trae el correo y teléfono **actuales** (para contactar al cliente), que no están copiados en la reserva.

## 4. Cancelaciones por cancha

```javascript
db.reservas.aggregate([
  { $match: { propietario_id: laura, tipo: "reserva", fecha: { $gte: desde, $lte: hasta } } },
  { $group: { _id: { cancha: "$cancha.nombre", sede: "$cancha.sede" },
              total: { $sum: 1 },
              canceladas: { $sum: { $cond: [ { $eq: ["$estado", "cancelada"] }, 1, 0 ] } } } },
  { $project: { _id: 0, cancha: "$_id.cancha", sede: "$_id.sede", total: 1, canceladas: 1,
                tasa: { $round: [ { $multiply: [ { $divide: ["$canceladas", "$total"] }, 100 ] }, 1 ] } } },
  { $sort: { tasa: -1 } }
])
```
- `$cond` es un "si… entonces… si no": suma 1 solo cuando la reserva está cancelada.

## 5. Canchas que casi no se usan

```javascript
db.canchas.aggregate([
  { $match: { propietario_id: laura, estado: { $ne: "inactiva" } } },
  { $lookup: {
      from: "reservas", let: { id_cancha: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$cancha_id", "$$id_cancha"] }, tipo: "reserva",
                    estado: { $in: ["activa", "finalizada"] }, fecha: { $gte: desde, $lte: hasta } } },
        { $project: { horas: { $size: "$franjas" }, precio_total: 1 } } ],
      as: "usos" } },
  { $project: { _id: 0, cancha: "$nombre", sede: "$sede.nombre", estado: 1,
                reservas: { $size: "$usos" }, horas_reservadas: { $sum: "$usos.horas" },
                ingresos: { $sum: "$usos.precio_total" } } },
  { $sort: { horas_reservadas: 1 } }
])
```
- **Arranca desde `canchas`, no desde `reservas`:** así aparecen las canchas con **cero** reservas (por ejemplo, la que está en mantenimiento). Desde `reservas` nunca saldrían.

## 6. Deportes y modalidades más reservados (admin)

```javascript
db.reservas.aggregate([
  { $match: { tipo: "reserva", estado: { $in: ["activa", "finalizada"] },
              fecha: { $gte: desde, $lte: hasta } } },
  { $group: { _id: { deporte: "$deporte", modalidad: "$modalidad" },
              reservas: { $sum: 1 }, ingresos: { $sum: "$precio_total" } } },
  { $sort: { reservas: -1 } }
])
```

## 7. Zonas con más demanda (admin)

```javascript
db.reservas.aggregate([
  { $match: { tipo: "reserva", estado: { $in: ["activa", "finalizada"] },
              fecha: { $gte: desde, $lte: hasta } } },
  { $group: { _id: "$cancha.zona", reservas: { $sum: 1 }, ingresos: { $sum: "$precio_total" } } },
  { $sort: { reservas: -1 } },
  { $limit: 10 }
])
```
- **Utilidad:** decidir en qué barrios buscar nuevos propietarios.

## 8. ¿Se llenan los partidos abiertos? (admin)

```javascript
db.reservas.aggregate([
  { $match: { tipo: "reserva", estado: { $in: ["activa", "finalizada"] },
              partido_abierto: { $exists: true }, fecha: { $gte: desde, $lte: hasta } } },
  { $project: { deporte: 1,
      llenado: { $divide: [ { $add: [ { $size: "$partido_abierto.participantes" }, 1 ] },
                            "$partido_abierto.cupos_totales" ] },
      completo: { $cond: [ { $eq: ["$partido_abierto.estado", "completo"] }, 1, 0 ] } } },
  { $facet: {
      general: [ { $group: { _id: null, partidos: { $sum: 1 }, llenado: { $avg: "$llenado" },
                             completos: { $sum: "$completo" } } } ],
      por_deporte: [ { $group: { _id: "$deporte", partidos: { $sum: 1 }, llenado: { $avg: "$llenado" } } },
                     { $sort: { llenado: -1 } } ] } }
])
```
- `$facet` ejecuta **dos sub-pipelines sobre los mismos documentos** en una sola consulta: el total y el detalle por deporte.
- **Utilidad:** mide si la función diferencial de Parche (completar equipos) realmente funciona.

## 9. Reservas por mes (admin)

```javascript
db.reservas.aggregate([
  { $match: { tipo: "reserva" } },
  { $group: { _id: { $substrBytes: ["$fecha", 0, 7] },
              reservas:   { $sum: { $cond: [ { $in: ["$estado", ["activa", "finalizada"]] }, 1, 0 ] } },
              canceladas: { $sum: { $cond: [ { $eq: ["$estado", "cancelada"] }, 1, 0 ] } } } },
  { $sort: { _id: 1 } }
])
```
