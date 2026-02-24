# Security - MS Calendar GL

## 1) Autenticacion y autorizacion

Mecanismo actual:

- JWT en Bearer o cookie (`booking_rbc_token` / `booking_rbc_client_token`)
- validacion de token con `JWTService.verify`
- control de roles con middlewares `OnlyAdminMiddleware.*`

Que protege hoy:

- endpoints de plataforma (manage/update/delete/change-status)
- endpoints cliente (create/update/cancel/confirm/list)

Observacion importante:

- `OnlyAdminMiddleware.accessAuthorized` hoy se basa en claims + cache Redis
- la validacion fuerte contra Auth por RPC esta comentada (MVP)

## 2) Seguridad entre microservicios

Salida (este MS -> otros MS):

- se envian `x-internal-ms-allowed` y `x-internal-ms-secret`
- token por destino:
  - `TOKEN_MS_LOGIN` -> Auth
  - `TOKEN_MS_CATALOG` -> Catalog (bookingPage)
  - `TOKEN_CLIENT` -> Client

Entrada (otros MS -> este MS):

- rutas internas `api/ms/internal/*` existen
- middleware interno exige:
  - `x-internal-ms-allowed`
  - `x-internal-ms-secret` valido contra `TOKEN_MS_CALENDAR`

Riesgo actual:

- falta cierre fuerte de autenticacion/autorizacion entre MS en endpoints internos

## 3) Proteccion de datos sensibles (GDPR)

Campos sensibles cifrados en DB (via middleware Prisma):

- `Event.description`
- `GroupEvents.commentClient`
- `GroupEvents.description`

Implementacion:

- cifrado `AES-256-GCM`
- clave base: `DESCRYPT_KEY`
- versionado: `DESCRYPT_KEY_VERSION`
- hash HMAC-SHA256 para busquedas/indices (`commentClientHash`, `descriptionHash`)
- descifrado automatico al leer

Resultado:

- en almacenamiento, el contenido sensible va cifrado
- en codigo de negocio, se consume en claro al leer por Prisma

## 4) Secretos y configuracion

Fortalezas actuales:

- validacion de entorno con Zod al arranque (`env.ts`)
- si faltan secretos requeridos, el servicio falla al iniciar

Secretos principales:

- `JWT_PRIVATE_KEY`
- `TOKEN_MS_LOGIN`
- `TOKEN_MS_CATALOG`
- `TOKEN_CLIENT`
- `TOKEN_MS_CALENDAR`
- `DESCRYPT_KEY`
- credenciales de DB/Redis/Rabbit

Estado MVP:

- no hay rotacion automatica de `JWT_PRIVATE_KEY`
- no hay plan formal de rotacion para tokens internos entre MS

## 5) Logging y exposicion de datos

- logging estructurado con Pino
- redaccion de campos sensibles (`authorization`, `x-internal-token`, `turnstileToken`)
- la operativa actual usa logs como fuente principal de diagnostico

## 6) Controles de borde

- CORS con whitelist (`WEB_WHITELIST_CORS`)
- rate limiting global (mas permisivo en desarrollo)
- guard de idempotencia para evitar doble click en endpoints mutables

## 7) Riesgos abiertos y plan minimo

Riesgos abiertos:

- DLQ sin remediacion automatica
- sin rotacion activa de JWT key (MVP)

Estado confirmado en codigo:

- `api/ms/internal/*` ya esta protegido por `MicroserviceAuthMiddleware.verify`
- se valida caller permitido (`x-internal-ms-allowed`) y secreto interno (`x-internal-ms-secret`)

Plan minimo sugerido (cuando toque hardening):

1. mantener tokens por destino y politica de rotacion por MS
2. definir runbook de rotacion de `JWT_PRIVATE_KEY` y tokens internos
3. alertas basicas por 401/403, 5xx y crecimiento de DLQ
