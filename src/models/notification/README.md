# Notification Event Rules

## Objetivo

Este documento define el modelo estatico de reglas usado por `EVENT_RULES` en:

- `src/models/notification/notification-rules.ts`

Describe que combinaciones estan permitidas para:

- linea actor (`clientSide`, `organizerSide`, `system`)
- linea destino (`clientSide`, `organizerSide`)
- canal (`email`, `push`, `whatsapp`, `platform_internal`, etc.)
- offset en minutos (`0`, `60`, `120`, `360`, `720`, `1440`, `2880`)

Este documento no describe runtime de envio, cuotas, reintentos ni restricciones de proveedor.

## Tipos Base

- `NotificationEvent`: trigger logico (ejemplo: `booking.accepted`).
- `NotificationLine`: linea actor (`clientSide`, `organizerSide`, `system`).
- `NotificationChannel`: tipo de canal definido en contratos de plantilla/backend.
- `MinutesAllowed`: dominio permitido de offsets en `notification-config.ts`.

Archivos de referencia:

- `src/models/notification/notification-config.ts`
- `src/models/notification/template-notification.ts`
- `src/models/notification/notification-rules.ts`

## Contrato de Regla

Forma de `EventRule` (resumen):

```ts
type EventRule = {
  actors?: Array<"clientSide" | "organizerSide">;
  allowedChannelsByTargetLine: Partial<
    Record<"clientSide" | "organizerSide", NotificationChannel[]>
  >;
  caps?: {
    perActorTargetChannelMax?: Partial<
      Record<
        "clientSide" | "organizerSide" | "system",
        {
          clientLimits?: Partial<Record<NotificationChannel, MinutesAllowed[]>>;
          organizerLimits?: Partial<Record<NotificationChannel, MinutesAllowed[]>>;
        }
      >
    >;
  };
  uiHint?: "twoLanes" | "single";
  defaultRelativeTo?:
    | "booking.startAtLocal"
    | "booking.endAtLocal"
    | "booking.createdAt"
    | "booking.updatedAt";
};
```

## Reglas de Interpretacion

La UI y la configuracion deben interpretarse asi:

1. Si falta `actors`, el evento se considera `system`.
2. `allowedChannelsByTargetLine` es un filtro estatico por linea destino.
3. `caps.perActorTargetChannelMax` es la matriz real permitida: actor -> destino -> canal -> offsets.
4. Si un canal aparece en `allowedChannelsByTargetLine` pero no tiene offsets en `caps`, no se puede seleccionar.
5. Offset `0` significa politica inmediata.

## Invariantes de Consistencia

- Todo canal listado en `allowedChannelsByTargetLine` debe tener al menos un offset en `caps` para el camino actor/destino aplicable.
- Todo offset debe pertenecer al dominio `MinutesAllowed`.
- Las claves actor en `perActorTargetChannelMax` deben ser una de:
  - `clientSide`
  - `organizerSide`
  - `system`
- `defaultRelativeTo` debe ser coherente con la semantica del evento:
  - `booking.createdAt` para notificaciones de creacion
  - `booking.updatedAt` para flujos de actualizacion/cancelacion
  - `booking.startAtLocal` para recordatorios previos
  - `booking.endAtLocal` para flujos post-evento

## Ejemplo

Recordatorio `system` con capacidades distintas por destino:

```json
{
  "allowedChannelsByTargetLine": {
    "clientSide": ["email", "push", "whatsapp"],
    "organizerSide": ["email", "push", "platform_internal"]
  },
  "caps": {
    "perActorTargetChannelMax": {
      "system": {
        "clientLimits": {
          "email": [360, 1440],
          "push": [60, 120, 1440],
          "whatsapp": [1440]
        },
        "organizerLimits": {
          "email": [360, 1440],
          "push": [60, 120, 1440],
          "platform_internal": [1440]
        }
      }
    }
  },
  "uiHint": "single",
  "defaultRelativeTo": "booking.startAtLocal"
}
```

## Procedimiento de Cambio

Al agregar o modificar una regla:

1. Definir semantica del evento y `defaultRelativeTo`.
2. Definir modelo actor:
   - dos actores explicitos (`clientSide`, `organizerSide`)
   - o `system` implicito omitiendo `actors`
3. Configurar `allowedChannelsByTargetLine`.
4. Configurar `caps.perActorTargetChannelMax`.
5. Verificar comportamiento UI (`single` o `twoLanes`).
6. Ejecutar tests de integracion sobre flujos afectados.

## Limites de Alcance

Fuera de alcance de este archivo:

- cuotas/capacidad restante en runtime
- reintentos de dispatch y errores de proveedor
- politicas legales/compliance por canal
- flujo de aprobacion de templates
