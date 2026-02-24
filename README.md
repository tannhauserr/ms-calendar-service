

<h1 align="center">MS Calendar Guololó</h1>
<p align="center">
  <a href="https://www.guololo.com">
    <img alt="Website" src="https://img.shields.io/badge/WEBSITE-guololo.com-4b5563?style=for-the-badge" />
  </a>
  <img alt="Available" src="https://img.shields.io/badge/AVAILABLE-YES-33aa22?style=for-the-badge" />
</p>
<p align="center">
  <a href="https://www.guololo.com">
    <img src="./.github/assets/guololo-logo.png" alt="Guololo avatar" width="800" />
  </a>
</p>


Microservicio de calendario y citas de Guololo. Centraliza la lógica de eventos, disponibilidad y reglas de agenda para plataforma y cliente.

## Tabla de contenidos

- [Contexto](#contexto)
- [Esquema de integración](#esquema-de-integración)
- [Alcance funcional](#alcance-funcional)
- [Stack técnico](#stack-técnico)
- [Quickstart local](#quickstart-local)
- [Entornos de ejecución (importante)](#entornos-de-ejecución-importante)
- [Comandos principales](#comandos-principales)
- [OpenAPI y pruebas manuales](#openapi-y-pruebas-manuales)
- [Seguridad entre MS (interna)](#seguridad-entre-ms-interna)
- [DLQ: persistencia y replay](#dlq-persistencia-y-replay)
- [Deuda técnica](#deuda-técnica)
- [Variables de entorno relevantes](#variables-de-entorno-relevantes)
- [Documentación ampliada](#documentación-ampliada)
- [Estructura del repositorio](#estructura-del-repositorio)

## Contexto

Este MS forma parte del ecosistema backend de Guololo y se integra con otros servicios internos no públicos (gateway, auth, client, booking page).

Responsabilidades principales:

- Exponer APIs de gestión de eventos y citas para plataforma y cliente.
- Gestionar disponibilidad por negocio, profesional y excepciones temporales.
- Publicar y consumir eventos internos (RabbitMQ/Redis, según entorno).
- Mantener contratos OpenAPI para consumo interno y validación funcional.

## Esquema de integración

![Esquema de integración MS Calendar](./.github/assets/booking-guololo.svg)

### Leyenda

- Líneas sólidas → Comunicación síncrona entre servicios
- Líneas discontinuas → Eventos asíncronos (RabbitMQ)
- `validateUserContext()` → Identidad + pertenencia + autorización
- `validateClientContext()` → Validación de cliente + tenant
- `getServiceSnapshot()` → Datos inmutables de la reserva
- `booking.*` → Eventos del ciclo de vida de la reserva
- `service.updated` → Evento de cambio en catálogo

## Alcance funcional

Módulos principales actuales:

- `event-platform`: alta, edición y gestión operativa de eventos desde plataforma interna.
- `event-client`: flujo de citas desde cliente (creación, edición, cancelación y confirmación).
- `public-event`: endpoints públicos relacionados con eventos y disponibilidad.
- `dead-letter-management`: operación de mensajes en dead-letter (consulta y replay manual controlado por rol).

Módulos de disponibilidad y jornadas:

- `business-hour`: horario base del workspace.
- `worker-business-hour`: horario individual de cada miembro del workspace.
- `temporary-business-hour`: bloques temporales intradía para ajustes puntuales de disponibilidad en fechas concretas.
- `worker-absence`: gestión de ausencias prolongadas (vacaciones, enfermedad u otras bajas).

Endpoints de búsqueda en uso (schedules):

- `POST /api/business-hours/search`
- `POST /api/worker-business-hours/search`
- `POST /api/temporary-business-hours/search`

Endpoint de salud:

- `GET /health`

## Stack técnico

- Node.js + Express + TypeScript
- Prisma ORM + PostgreSQL
- Redis (cache/pubsub)
- RabbitMQ (mensajería)
- Zod (validación)
- Jest + Supertest (tests)
- OpenAPI 3.0 (spec en `openapi.yaml`)

## Quickstart local

### 1) Prerrequisitos

- Node.js 18+
- npm
- Docker Desktop

### 2) Instalar dependencias

```bash
npm install
```

### 3) Configurar entorno

```bash
cp .env.example .env.development
```

Ajusta al menos:

- `DATABASE_URL`
- `JWT_PRIVATE_KEY`
- `TOKEN_MS_LOGIN`
- `TOKEN_MS_CATALOG`
- `TOKEN_CLIENT`
- `TOKEN_MS_CALENDAR`

### 4) Levantar PostgreSQL local

```bash
docker compose up -d postgres
docker compose ps
```

### 5) Preparar Prisma

```bash
npm run prisma:generate:dev
npm run prisma:migrate:dev
```

Opcional:

```bash
npm run prisma:seed
```

### 6) Ejecutar el microservicio

Modo demo (sin Redis/RabbitMQ y con integraciones mock):

```bash
npm run demo
```

Modo desarrollo normal:

```bash
npm run start:dev
```

## Entornos de ejecución (importante)

Hay dos entornos locales distintos para evitar mezclar datos:

- `demo/dev` (día a día): usa `docker-compose.yml` y PostgreSQL en `localhost:5432`.
- `integration rabbit` (tests E2E de mensajería): usa `docker-compose.integration.yml` y PostgreSQL en `localhost:55432`.

Flujo completo de integración Rabbit (up, migrate, test y down):

- [`docs/rabbitmq.md`](./docs/rabbitmq.md)

Nota operativa:

- para `test:integration:rabbitmq` no hace falta `npm run start`; los consumers se inicializan dentro del test.

## Comandos principales

| Comando | Uso |
| --- | --- |
| `npm run start:dev` | Inicia en desarrollo (`INTEGRATIONS_MODE=http`). |
| `npm run demo` | Inicia en modo demo (`INTEGRATIONS_MODE=mock`, sin Redis/RabbitMQ). |
| `npm run build` | Compila TypeScript a `build/`. |
| `npm run start` | Ejecuta build compilado. |
| `npm run test` | Ejecuta tests. |
| `npm run test:integration` | Ejecuta suite de rutas HTTP (Supertest + mocks de dependencias externas). |
| `npm run test:integration:rabbitmq` | Ejecuta tests de integración Rabbit con servicios reales (flujo completo en `docs/rabbitmq.md`). |
| `npm run openapi:bundle` | Genera `openapi.bundle.yaml`. |
| `npm run prisma:migrate:dev` | Aplica migraciones en entorno dev. |
| `npm run prisma:generate:dev` | Genera Prisma Client en dev. |
| `npm run prisma:seed` | Carga seed en dev. |

## OpenAPI y pruebas manuales

Archivo fuente:

- `openapi.yaml`

Generar bundle:

```bash
npm run openapi:bundle
```

Levantar Swagger UI por Docker:

```bash
docker compose up -d swagger-ui
```

Accesos locales:

- API: `http://localhost:3201`
- Health: `http://localhost:3201/health`
- Swagger UI: `http://localhost:8081`

## Seguridad entre MS (interna)

Para comunicación interna se usan dos headers:

- `x-internal-ms-allowed`: nombre del MS que llama (ejemplo: `calendar`)
- `x-internal-ms-secret`: token interno del MS destino

En este MS:

- rutas `api/ms/internal/*` exigen ambos headers
- el token recibido debe coincidir con `TOKEN_MS_CALENDAR`

Tokens configurados por destino desde este MS:

- `TOKEN_MS_LOGIN` para llamadas a MS-Login/Auth
- `TOKEN_MS_CATALOG` para llamadas a MS-Catalog (bookingPage)
- `TOKEN_CLIENT` para llamadas a MS-Client

## DLQ: persistencia y replay

Los consumers de RabbitMQ críticos (`updateServiceInEvent` y `deleteSOFTRecords`) tienen:

- idempotencia con Redis (`messageReliability`) para evitar reprocesados duplicados
- persistencia de mensajes muertos en BD (`deadLetterMessages`)
- replay manual del mensaje a la cola principal

Feature dedicado:

- `src/features/dead-letter-management`

Endpoints de operación DLQ:

- `GET /api/ops/dlq/messages`
- `POST /api/ops/dlq/messages/:id/replay`

Acceso restringido estrictamente a:

- `ROLE_SUPER_ADMIN`
- `ROLE_DEVELOPER`

## Deuda técnica

Este MS está en fase MVP y hay decisiones que se tomaron para llegar a tiempo sin romper lo importante.

Hoy el trade-off es este:

- priorizamos que el flujo de reservas y cambios críticos sea estable
- dejamos fuera parte de la capa operativa avanzada (alertas automáticas, dashboards y automatismos de replay)
- mantenemos replay manual en DLQ porque da control y evita automatizar errores sin revisar causa
- `deleteSOFTRecords` sigue concentrando muchos casos en un único consumer (funciona, pero pide dividir por dominio cuando haya tiempo)

En resumen: no está “cerrado perfecto”, pero sí está en un punto sano para iterar con seguridad en los próximos pasos.

## Variables de entorno relevantes

El contrato base está en `.env.example`.

Variables críticas para ejecutar correctamente:

- `PORT`
- `DATABASE_URL`
- `ENABLE_REDIS`
- `ENABLE_RABBITMQ`
- `INTEGRATIONS_MODE` (`http` o `mock`)
- `JWT_PRIVATE_KEY`
- `TOKEN_MS_LOGIN`
- `TOKEN_MS_CATALOG`
- `TOKEN_CLIENT`
- `TOKEN_MS_CALENDAR`
- `URL_BACK_MS_GATEWAY`
- `URL_BACK_MS_AUTH`
- `URL_NEXTJS`

## Documentación ampliada

Para detalle técnico y operativa, revisar:

- [`docs/README.md`](./docs/README.md)
- [`docs/system-context.md`](./docs/system-context.md)
- [`docs/security.md`](./docs/security.md)
- [`docs/rabbitmq.md`](./docs/rabbitmq.md)
- [`docs/runbook.md`](./docs/runbook.md)

## Estructura del repositorio

```txt
.
├─ src/
│  ├─ features/
│  ├─ services/
│  ├─ routes/
│  ├─ controllers/
│  └─ config/
├─ prisma/
├─ tests/
├─ openapi.yaml
├─ openapi.bundle.yaml
├─ docker-compose.yml
├─ docker-compose.integration.yml
├─ docs/
└─ README.md
```
