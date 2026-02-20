# Runbook MVP - MS Calendar GL

## Alcance

Runbook operativo realista para el estado actual (MVP).

Estado actual declarado:

- ante fallos graves, la accion principal es reiniciar servicio
- no hay auto-remediacion avanzada en DLQ (si hay replay manual)

## 1) Comprobacion rapida

1. Health:

```bash
curl -s http://localhost:3201/health
```

2. Logs (segun como lo ejecutes):

- consola del proceso
- o fichero de redireccion (ejemplo local: `error_service.log`)

3. Dependencias base:

- PostgreSQL accesible
- Redis accesible (si `ENABLE_REDIS=true`)
- RabbitMQ accesible (si `ENABLE_RABBITMQ=true`)

Importante de entorno:

- demo/dev normal usa `localhost:5432` (compose principal)
- integracion Rabbit usa `localhost:55432` (compose de integracion)

## 2) Recuperacion rapida (actual)

### Caso A: API no responde / errores 5xx repetidos

1. reiniciar proceso
2. validar arranque limpio
3. validar `/health`

Comandos tipicos local:

```bash
npm run start:dev
```

o en modo demo:

```bash
npm run demo
```

### Caso B: fallo en Redis

Mitigacion temporal:

- arrancar con `ENABLE_REDIS=false` para continuar sin cache/pubsub Redis

### Caso C: fallo en RabbitMQ

Mitigacion temporal:

- arrancar con `ENABLE_RABBITMQ=false` para continuar sin consumers Rabbit

### Caso D: fallo en DB / schema

Checklist:

1. revisar `DATABASE_URL`
2. confirmar postgres arriba (`docker compose ps`)
3. si aplica en entorno dev, correr migraciones

```bash
npm run prisma:generate:dev
npm run prisma:migrate:dev
```

Si estas en entorno de integracion Rabbit:

```bash
npm run it:rabbitmq:migrate
```

## 3) Incidencias funcionales frecuentes

### "No deja reservar"

Revisar en orden:

1. `bookingWindow` del workspace (lead time / max advance)
2. limites (`perUserPerDay`, `perUserConcurrent`, `maxServicesPerBooking`)
3. cliente baneado en workspace
4. servicio inexistente/no disponible para workspace
5. usuario elegible para el servicio (`userServices`)

### "Error de permisos"

Revisar:

1. token JWT recibido (claims `idUser`, `idCompanySelected`, `role`)
2. coherencia del rol esperado por ruta
3. consistencia de `JWT_PRIVATE_KEY` entre servicios que emiten/verifican token

## 4) Rabbit / DLQ (estado actual)

- ambos consumers DLQ persisten mensajes en `deadLetterMessages`
- hay replay manual disponible por API operativa

Endpoints:

- `GET /api/ops/dlq/messages`
- `POST /api/ops/dlq/messages/:id/replay`

Restriccion:

- solo `ROLE_SUPER_ADMIN` y `ROLE_DEVELOPER`

Accion operativa recomendada:

1. listar mensajes en estado `PENDING`
2. identificar causa (errorMessage/headers/payload)
3. corregir causa en sistema
4. ejecutar replay por `id`
5. verificar que el mensaje pasa en cola principal y no vuelve a DLQ

## 5) Mejoras operativas recomendadas

1. supervisor de proceso (systemd/pm2/k8s) con auto-restart y healthcheck
2. alertas basicas (5xx, latencia, DLQ)
3. dashboard interno para replay DLQ y trazabilidad
4. playbook de incidentes con responsables y tiempos objetivo

## 6) Ejecucion rapida de integracion Rabbit

```bash
npm run it:rabbitmq:up
npm run it:rabbitmq:migrate
npm run test:integration:rabbitmq
npm run it:rabbitmq:down
```
