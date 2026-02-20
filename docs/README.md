# Docs - MS Calendar GL

Documentacion tecnica del microservicio de calendario.

## Indice

- `system-context.md`: como encaja este MS con el ecosistema.
- `rabbitmq.md`: topologias, consumers, retries y DLQ.
- `security.md`: autenticacion, secretos, cifrado y riesgos.
- `runbook.md`: operativa MVP para incidencias.

## Novedad DLQ (actual)

La operativa DLQ ya no vive en `event-platform`. Ahora esta separada en un feature dedicado:

- `src/features/ops-dlq`

Endpoints operativos:

- `GET /api/ops/dlq/messages`
- `POST /api/ops/dlq/messages/:id/replay`

Restriccion de acceso:

- `ROLE_SUPER_ADMIN`
- `ROLE_DEVELOPER`

## Entornos locales

Para evitar confundir datos o puertos:

- `docker-compose.yml` es para demo/dev normal (`PostgreSQL -> localhost:5432`).
- `docker-compose.integration.yml` es para integración Rabbit (`PostgreSQL -> localhost:55432`, `RabbitMQ -> 5673`, `Redis -> 6380`).

Comandos para integración Rabbit:

```bash
npm run it:rabbitmq:up
npm run it:rabbitmq:migrate
npm run test:integration:rabbitmq
npm run it:rabbitmq:down
```

## Orden recomendado de lectura

1. `system-context.md`
2. `security.md`
3. `rabbitmq.md`
4. `runbook.md`
