# README · Notification Event Rules

## 🎯 OBJETIVO

Definir, de forma declarativa, qué puede configurarse para cada evento de notificaciones (canales, actores/destinos, offsets) y dar pistas de layout a la UI. Este archivo **NO** ejecuta envíos; solo describe las capacidades.

## 📚 VOCABULARIO

- **NotificationEvent**: el "trigger" lógico (p.ej. `booking.accepted`).
- **NotificationLine** (línea): eje de UI/semántica para "quién acciona":
  - `clientSide` → el cliente realiza la acción
  - `organizerSide` → el organizador/equipo realiza la acción  
  - `system` → acciones automáticas (recordatorios, post-evento)
- **Audience/Target** (destino del envío):
  - `clientSide` (→ destinatario cliente)
  - `organizerSide` (→ destinatario organizador/equipo)
- **NotificationChannel**: `email` | `push` | `whatsapp` (extensible).
- **Offset** (minutos): momento relativo a `defaultRelativeTo`. `0` = inmediato.

## 🎨 CÓMO LEE ESTO LA UI

### 1. Actores (`actors`)
Define qué líneas (`clientSide` / `organizerSide`) existen como "actores que generan" el evento en la UI. Si falta → el evento se trata como `system` (una sola columna).

### 2. Canales permitidos (`allowedChannelsByTargetLine`)
Limita los canales visibles **POR DESTINO**:

```json
{
  "clientSide": ["email", "push", "whatsapp"],    // lo que puedo enviar al cliente
  "organizerSide": ["email", "push"]              // lo que puedo enviar al equipo
}
```

Esto es un filtro "estático" de disponibilidad por destino (no por actor).

### 3. Capacidades (`caps.perActorTargetChannelMax`)
Define, por cada **LÍNEA** (actor que inicia, o `system`), los offsets **PERMITIDOS** por (destino → canal). Es decir, "qué combinaciones actor→destino→canal→offset están soportadas".

**Estructura:**
```typescript
perActorTargetChannelMax: {
  clientSide | organizerSide | system: {
    clientLimits?:    { [channel]: number[] }   // offsets al CLIENTE
    organizerLimits?: { [channel]: number[] }   // offsets al EQUIPO
  }
}
```

**Ejemplos:**
- Recordatorio 24h por WhatsApp solo al CLIENTE (system):
  ```json
  system.clientLimits.whatsapp = [1440]
  ```
- Inmediato tras crear reserva por email y push a ambos destinos:
  ```json
  clientSide.clientLimits.email = [0]
  clientSide.clientLimits.push = [0]
  clientSide.organizerLimits.email = [0]
  clientSide.organizerLimits.push = [0]
  ```

### 4. Pistas de UI (`uiHint`)
Guía el layout:
- `"twoLanes"` → dos columnas (acciones del cliente vs del organizador)
- `"single"` → una columna (casos de `system` o rama única clara)

### 5. Base temporal (`defaultRelativeTo`)
Da la base temporal para interpretar offsets:
- `"booking.startAtLocal"` → suele usarse en recordatorios
- `"booking.endAtLocal"` → encuestas/post-visit
- `"booking.createdAt"` → confirmaciones tras crear
- `"booking.updatedAt"` → avisos tras cambios/cancelaciones

## ⚖️ CAP VS REMAINING (MUY IMPORTANTE)

- **"caps"** aquí define el *espacio de opciones permitido* (offsets válidos).
- La UI también muestra **"remaining/tope"** dinámico (cupos/limites de uso) mediante `remainingForTarget(...)`, que es lógica de **RUNTIME** (p.ej., "te quedan 2 WhatsApp hoy"). Eso **NO** sale de este archivo.

Por tanto:
- **Regla** (este archivo) → qué está permitido configurar (estático)
- **Remaining** (runtime) → cuántos "slots" quedan hoy (dinámico)

## ✅ REGLAS DE COHERENCIA

- Si un canal aparece en `allowedChannelsByTargetLine`, pero **NO** tiene offsets en `caps` para esa combinación actor→destino, **NO** se podrá seleccionar (faltará el paso 4). Asegura mantener ambos en sincronía.
- `0` en offsets significa "inmediato".
- Si un canal se permite en destino, pero no existe en `caps`, equivale a "no hay opciones válidas" (mejor no listarlo en allowed).

## 🎯 CÓMO SE DIBUJA EN MINIADD MODAL

| Paso | Descripción | Fuente |
|------|-------------|--------|
| **Paso 1** (actor) | Definido por `actors` (si no hay, vamos a modo system) | `actors` |
| **Paso 2** (destino) | cliente / organizador (si aplica) | - |
| **Paso 3** (canal) | Intersección de: `allowedChannelsByTargetLine[destino]` ∩ canales presentes en caps para (línea actor → destino) | `allowedChannelsByTargetLine` + `caps` |
| **Paso 4** (offset) | Lista de minutos de `caps[actorLine].[client\|organizer]Limits[channel]` | `caps` |
| **Base temporal** | `defaultRelativeTo` para mostrar "15min / 1h / 24h …" | `defaultRelativeTo` |

## 🔄 PATRONES TÍPICOS

### Confirmaciones inmediatas (ambas ramas)
```json
{
  "actors": ["clientSide", "organizerSide"],
  "allowedChannelsByTargetLine": { 
    "clientSide": ["email", "push"], 
    "organizerSide": ["email", "push"] 
  },
  "caps": {
    "perActorTargetChannelMax": {
      // Para ambos actores: email:[0], push:[0] hacia ambos destinos
    }
  }
}
```

### Recordatorios antes de la cita (system)
```json
{
  // actors: omitido → UI "single"
  "allowedChannelsByTargetLine": { 
    "clientSide": ["email", "push", "whatsapp"], 
    "organizerSide": ["email", "push"] 
  },
  "caps": {
    "perActorTargetChannelMax": {
      "system": {
        "clientLimits": { 
          "email": [15, 60, 1440], 
          "push": [30, 120, 360], 
          "whatsapp": [1440] 
        }
      }
    }
  },
  "defaultRelativeTo": "booking.startAtLocal"
}
```

## 🚀 EXTENSIÓN / CÓMO AÑADIR UN EVENTO NUEVO

1. **Define la semántica** del evento y su base temporal (`defaultRelativeTo`).
2. **¿Quién lo acciona?** 
   - Si UI "dos columnas", añade `actors: ["clientSide", "organizerSide"]`.
   - Si es automático, omite `actors` y usa `system`.
3. **Declara** `allowedChannelsByTargetLine` para cliente/organizador.
4. **Declara** `caps.perActorTargetChannelMax`:
   - Clave por línea (`clientSide` / `organizerSide` / `system`)
   - Dentro, separa límites a `clientLimits` y/o `organizerLimits`
   - Por cada canal, lista offsets **PERMITIDOS** (en minutos)
5. **Pon** `uiHint` para dibujar la tarjeta (`twoLanes` o `single`).
6. **(Opcional)** Ajusta `remainingForTarget(...)` en runtime para cupos reales.

## ✔️ CHECKLIST RÁPIDO

- [ ] ¿`defaultRelativeTo` correcto?
- [ ] ¿`actors` coherente con `single`/`twoLanes`?
- [ ] ¿`allowedChannelsByTargetLine` y `caps` sincronizados?
- [ ] ¿Offsets (minutos) correctos? `0` = inmediato
- [ ] ¿WhatsApp solo donde legalmente aplica?

## 💡 EJEMPLOS RÁPIDOS

### A) Añadir WhatsApp 2h antes para el cliente en "booking.reminder.beforeStart"
- `allowedChannelsByTargetLine.clientSide` ya contiene `"whatsapp"`
- `caps.perActorTargetChannelMax.system.clientLimits.whatsapp = [120, 1440]`

### B) Quitar push al organizador en "booking.updated"
- `allowedChannelsByTargetLine.organizerSide = ["email"]`
- (y elimina `push` de `caps` para `organizerLimits`)

### C) Forzar "single" aunque haya actors
- `uiHint: "single"` (solo afecta al layout; la lógica de pasos sigue siendo la misma)

## 🔍 VALIDACIÓN (ideas)

Al arrancar, se puede validar:
- Cada canal en `allowedChannelsByTargetLine` exista en `caps` para al menos un offset.
- Los offsets sean non-negative integers.
- Las claves de `perActorTargetChannelMax` pertenezcan a `{"clientSide", "organizerSide", "system"}`.

## 📝 NOTAS

- Este archivo es puramente **declarativo**. Cualquier política de "límite diario", "plantillas aprobadas", "ventanas de 24h" de WhatsApp, etc., se calcula en runtime.
- Para WhatsApp, suele ser buena práctica usar offsets ≥ 60–120 min o 24h, dependiendo de la normativa y de si es plantilla vs. sesión.