import { Event } from "@prisma/client";
import { CONSOLE_COLOR } from "../../../../constant/console-color";
import CustomError from "../../../custom-error/CustomError";
import { ActionKey, ACTION_TO_SECTIONS } from "../action-to-senctions";
import { BookingSnap, buildFromSections } from "../simple-build";
import { getUsersByIds, getWorkspacesByIds } from "../../../../services/@service-token-client/api-ms/auth.ms";
import { publishStoreNotificationCreated } from "../../../../services/@rabbitmq/pubsub/functions";
import { getClientWorkspacesByIds } from "../../../../services/@service-token-client/api-ms/client.ms";
import { shouldSendNotification } from "../validator-date/validator-date";
import { coalesceReminderBeforeStart } from "../validator-date/pre-validator";
import { NotificationEvent } from "../../notification-config";
import { Workspace } from "../../../../services/@redis/cache/interfaces/models/workspace";
import { WorkspaceBrief } from "../../../../services/@redis/cache/interfaces/models/workspace-brief";


/**
* Crea y envía notificaciones para un evento ya creado
* 
* Es necesario que evento incluya:
* 
* - idWorkspaceFk (o groupEvents.idWorkspaceFk)
* - idUserPlatformFk
* - eventParticipant (con idClientWorkspaceFk) o groupEvents.eventParticipant
* - createdDate
* - updatedDate
* - startDate
* - endDate
* - idGroup 
* - idServiceFk
* 
* - Obtiene configuración de notificaciones del workspace
* - Construye booking base con datos del evento
* - Envía notis al negocio (sin datos de cliente)
* - Envía notis al/los clientes asociados (si hay contacto)
*/
// export const createNotification = async (value: Partial<Event> & { eventParticipant?: any[]; groupEvents?: any }, plan: {
//     actionSectionType: ActionKey;
// }) => {

//     // console.log("entro aqui, event:", value);
//     // console.log("entro aqui, plan:", plan);
//     const idWorkspace = (value as any).idWorkspaceFk ?? (value as any)?.groupEvents?.idWorkspaceFk;
//     const idCompany = (value as any)?.idCompanyFk ?? (value as any)?.groupEvents?.idCompanyFk;
//     if (!idWorkspace) return;


//     console.log("mira que es el value partial", value?.eventParticipant);

//     // 1) IDs de clientes asociados. Tienen que ser IDs de ClientWorkspace
//     const participants =
//         (value as any)?.eventParticipant ??
//         (value as any)?.groupEvents?.eventParticipant ??
//         [];
//     const clientParticipantIds = Array.isArray(participants)
//         ? participants
//             .map((p: any) => p?.idClientWorkspaceFk)
//             .filter((v: any): v is string => typeof v === "string")
//         : [];

//     // 2) Cargar workspace + clientes en paralelo
//     const [workspaces, clientList, userList] = await Promise.all([
//         getWorkspacesByIds([idWorkspace]),
//         clientParticipantIds.length
//             ? getClientWorkspacesByIds(clientParticipantIds, idCompany)
//             : Promise.resolve([]),
//         getUsersByIds([value.idUserPlatformFk])
//     ]);


//     if (!workspaces?.length || !userList?.length) return;
//     console.log("workspaces:", workspaces);
//     console.log("userList:", userList);
//     console.log("clientList:", clientList);

//     const user = userList[0];
//     const workspace = workspaces[0];
//     const notificationConfig = workspace?.generalNotificationConfigJson;
//     console.log("notificationConfig:", notificationConfig);
//     if (!notificationConfig) return;


//     // 3) Booking base (negocio)
//     const bookingBase: BookingSnap = {
//         id: value.id,
//         createdAt: value.createdDate.toISOString(),
//         updatedAt: value.updatedDate.toISOString(),
//         startAtLocal: value.startDate.toISOString(),
//         endAtLocal: value.endDate.toISOString(),

//         idService: value.idServiceFk,
//         idGroup: value.idGroup,

//     };

//     // 4) Publicar para negocio
//     try {

//         const bookingForUser = {
//             ...bookingBase,
//             business: {
//                 id: value.idUserPlatformFk,
//                 // TODO: Cambiar esto por los datos del usuario, que es el organizador del evento
//                 email: user?.email ?? undefined,
//                 phoneE164: (user?.phoneNumber && user?.phoneCode)
//                     ? `${(user.phoneCode ?? "").toString()}${user.phoneNumber}`
//                     : undefined,
//             },
//         }

//         const timeZoneStaff = user?.timeZone ?? workspace?.timeZone ?? "UTC";

//         console.log("bookingForUser:", bookingForUser);
//         console.log("timeZoneStaff:", timeZoneStaff);

//         await _publishForAction({
//             action: plan?.actionSectionType,
//             workspaceId: workspace?.id,
//             timeZoneStaff,
//             // Se manda participante en este caso el Staff porque es él mismo quien recibe la notifación
//             timeZoneParticipant: timeZoneStaff,
//             companyId: workspace.idCompanyFk,
//             booking: bookingForUser,
//             notificationConfig,

//         });
//     } catch (err: any) {
//         console.error("[EventController.add] notify business error:", err?.message || err);
//     }

//     // 5) Publicar para cada cliente (si hay contacto)
//     for (const client of clientList) {
//         const email = (client as any)?.email;
//         const phoneE164 = (client?.phoneNumber && client?.phoneCode)
//             ? `${(client.phoneCode ?? "").toString()}${client.phoneNumber}`
//             : undefined;


//         if (!email && !phoneE164) continue;

//         const bookingForClient = {
//             ...bookingBase,
//             client: { id: client.id, email, phoneE164 },
//             business: { id: value.idUserPlatformFk },
//         };

//         const timeZoneStaff = user?.timeZone ?? workspace?.timeZone ?? "UTC";
//         const timeZoneParticipant = client?.timeZone ?? workspace?.timeZone ?? "UTC";

//         try {
//             await _publishForAction({
//                 action: plan?.actionSectionType,
//                 workspaceId: workspace.id,
//                 timeZoneStaff,
//                 timeZoneParticipant,
//                 companyId: workspace.idCompanyFk,
//                 booking: bookingForClient,
//                 notificationConfig,
//             });
//         } catch (err: any) {
//             console.error("[EventController.add] notify client error:", { id: (client as any)?.id }, err?.message || err);
//         }
//     }
// };

/**
 * Función optimizada para crear notificaciones desde el cliente
 *
 * Reglas:
 * - Se recibe explícitamente idClient: string[] (normalmente 1, pero preparado para varios).
 * - Se utiliza idGroup como identificador importante de la reserva/grupo.
 * - STAFF:
 *   - Agrupamos eventos por idUserPlatformFk.
 *   - Si hay N staff distintos, enviamos N notificaciones (una por staff),
 *     aunque un staff tenga varios servicios/eventos.
 * - CLIENTE(S):
 *   - Enviamos una notificación por cliente, agregando el rango total de todos los eventos,
 *     asociada al mismo idGroup.
 */
export const createNotificationByClient = async (
    value: Array<Partial<Event> & { groupEvents?: any }>,
    plan: { actionSectionType: ActionKey },
    idClient: string[]
) => {
    const events = value as (Partial<Event> & { eventParticipant?: any[]; groupEvents?: any })[];

    if (!Array.isArray(events) || !events.length) return;

    const first = events[0];
    const idWorkspace = (first as any).idWorkspaceFk ?? (first as any)?.groupEvents?.idWorkspaceFk;
    const idCompany = (first as any)?.idCompanyFk ?? (first as any)?.groupEvents?.idCompanyFk;
    const idGroup = first.idGroup;

    if (!idWorkspace) {
        console.log(CONSOLE_COLOR.FgYellow, `[createNotificationByClient] missing idWorkspace`, CONSOLE_COLOR.Reset);
    }

    if (!idCompany) {
        console.log(CONSOLE_COLOR.FgYellow, `[createNotificationByClient] missing idCompany`, CONSOLE_COLOR.Reset);
    }

    // 1) IDs de clientes (vienen ya desde el parámetro idClient)
    const clientIds = Array.from(
        new Set((idClient || []).filter((v): v is string => typeof v === "string" && v.trim().length > 0))
    );
    if (!clientIds.length) return;

    // 2) IDs de staff (business) asociados (puede haber varios)
    const staffIds = Array.from(
        new Set(
            events
                .map(ev => ev.idUserPlatformFk)
                .filter((v: any): v is string => typeof v === "string")
        )
    );

    // 3) Cargar workspace + clientes + staff en paralelo
    const [workspaces, clientList, userList] = await Promise.all([
        getWorkspacesByIds([idWorkspace]),
        getClientWorkspacesByIds(clientIds, idCompany),
        staffIds.length ? getUsersByIds(staffIds) : Promise.resolve([]),
    ]);

    if (!workspaces?.length) return;

    const workspace = workspaces[0];
    const notificationConfig = workspace?.generalNotificationConfigJson;
    if (!notificationConfig) return;

    if (!userList?.length) return;

    // Mapa de users por id (para lookup rápido)
    const userById = new Map<string, (typeof userList)[number]>();
    for (const u of userList) {
        if (u?.id) userById.set(u.id, u);
    }

    // Quedarnos solo con eventos válidos (con fechas completas)
    const validEvents = events.filter(
        ev => ev.createdDate && ev.updatedDate && ev.startDate && ev.endDate
    );
    if (!validEvents.length) return;

    // -----------------------------------
    // 4) Notificaciones para STAFF (por staff, agrupando servicios)
    // -----------------------------------

    // Agrupamos eventos por idUserPlatformFk
    const eventsByStaff = new Map<string, (typeof validEvents)>();
    for (const ev of validEvents) {
        const staffId = ev.idUserPlatformFk as string | undefined;
        if (!staffId) continue;
        if (!eventsByStaff.has(staffId)) {
            eventsByStaff.set(staffId, []);
        }
        eventsByStaff.get(staffId)!.push(ev);
    }

    for (const [staffId, staffEvents] of eventsByStaff.entries()) {
        const user = userById.get(staffId);
        if (!user || !staffEvents.length) continue;

        // Rango para este staff concreto (solo los eventos que le tocan)
        const createdAtStaff = new Date(
            Math.min(...staffEvents.map(ev => ev.createdDate!.getTime()))
        );
        const updatedAtStaff = new Date(
            Math.max(...staffEvents.map(ev => ev.updatedDate!.getTime()))
        );
        const startAtLocalStaff = new Date(
            Math.min(...staffEvents.map(ev => ev.startDate!.getTime()))
        );
        const endAtLocalStaff = new Date(
            Math.max(...staffEvents.map(ev => ev.endDate!.getTime()))
        );

        // Servicio "representativo" (puede haber varios, pero idGroup es lo importante)
        const firstEventWithService = staffEvents.find(ev => ev.idServiceFk);

        const bookingBaseForStaff: BookingSnap = {
            id: (idGroup as any) ?? staffEvents[0].id,
            createdAt: createdAtStaff.toISOString(),
            updatedAt: updatedAtStaff.toISOString(),
            startAtLocal: startAtLocalStaff.toISOString(),
            endAtLocal: endAtLocalStaff.toISOString(),
            idService: firstEventWithService?.idServiceFk ?? undefined,
            idGroup: idGroup,
        };

        const timeZoneStaff = user?.timeZone ?? workspace?.timeZone ?? "UTC";

        try {
            const bookingForUser = {
                ...bookingBaseForStaff,
                business: {
                    id: staffId,
                    email: user?.email ?? undefined,
                    phoneE164: user?.phoneNumber
                        ? `${(user.phoneCode ?? "").toString()}${user.phoneNumber}`
                        : undefined,
                },
            };

            await _publishForAction({
                action: plan?.actionSectionType,
                workspaceId: workspace.id,
                timeZoneStaff,
                // El participante es el propio staff que recibe la noti
                timeZoneParticipant: timeZoneStaff,
                companyId: workspace.idCompanyFk,
                booking: bookingForUser,
                notificationConfig,
            });
        } catch (err: any) {
            console.error(
                "[EventController.client] notify staff error:",
                { staffId },
                err?.message || err
            );
        }
    }

    // -----------------------------------
    // 5) Notificaciones para CLIENTE(S) (una por cliente, mismo idGroup)
    // -----------------------------------

    if (!clientList.length) return;

    // Rango total de la reserva (todos los eventos)
    const createdAt = new Date(
        Math.min(...validEvents.map(ev => ev.createdDate!.getTime()))
    );
    const updatedAt = new Date(
        Math.max(...validEvents.map(ev => ev.updatedDate!.getTime()))
    );
    const startAtLocal = new Date(
        Math.min(...validEvents.map(ev => ev.startDate!.getTime()))
    );
    const endAtLocal = new Date(
        Math.max(...validEvents.map(ev => ev.endDate!.getTime()))
    );

    const firstEventWithServiceGlobal = validEvents.find(ev => ev.idServiceFk);

    const bookingBaseForClient: BookingSnap = {
        id: (idGroup as any) ?? validEvents[0].id,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        startAtLocal: startAtLocal.toISOString(),
        endAtLocal: endAtLocal.toISOString(),
        idService: firstEventWithServiceGlobal?.idServiceFk ?? undefined,
        idGroup: idGroup,
    };

    // Staff "principal" para la noti del cliente: el primero de la lista de staff
    const primaryStaffId = staffIds[0];
    const primaryStaff = primaryStaffId ? userById.get(primaryStaffId) : undefined;

    const timeZoneStaffForClient =
        primaryStaff?.timeZone ?? workspace?.timeZone ?? "UTC";
    const fallbackBusinessId = primaryStaffId ?? first.idUserPlatformFk ?? undefined;

    for (const client of clientList) {
        const email = (client as any)?.email;
        const phoneE164 =
            client?.phoneNumber && client?.phoneCode
                ? `${(client.phoneCode ?? "").toString()}${client.phoneNumber}`
                : undefined;

        if (!email && !phoneE164) continue;

        const timeZoneParticipant =
            client?.client?.timeZone ?? workspace?.timeZone ?? "UTC";

        if (!fallbackBusinessId) {
            continue;
        }

        const bookingForClient: BookingSnap = {
            ...bookingBaseForClient,
            client: { id: client.id, email, phoneE164 },
            business: { id: fallbackBusinessId },
        };

        try {
            await _publishForAction({
                action: plan?.actionSectionType,
                workspaceId: workspace.id,
                timeZoneStaff: timeZoneStaffForClient,
                timeZoneParticipant,
                companyId: workspace.idCompanyFk,
                booking: bookingForClient,
                notificationConfig,
            });
        } catch (err: any) {
            console.error(
                "[EventController.client] notify client error:",
                { clientId: (client as any)?.id },
                err?.message || err
            );
        }
    }
};



// /**
//  * Publica una acción en la cola de notificaciones
//  * @param params 
//  * @returns 
//  */
// export const _publishForAction = async (params: {
//     action: ActionKey;
//     workspaceId?: string;
//     timeZoneStaff: string;
//     timeZoneParticipant: string;
//     companyId?: string;

//     booking: BookingSnap;
//     notificationConfig: any;
// }): Promise<number> => {
//     const { action, booking, workspaceId, timeZoneStaff, timeZoneParticipant, companyId, notificationConfig } = params;

//     try {
//         // 1️⃣ Buscar secciones a disparar según la acción
//         const sectionsToTrigger = ACTION_TO_SECTIONS[action] ?? [];
//         if (!sectionsToTrigger.length) {
//             console.log(CONSOLE_COLOR.FgYellow, `[publishForAction] No sections for action '${action}'`, CONSOLE_COLOR.Reset);
//             return 0;
//         }

//         // 2️⃣ Generar mensajes desde las secciones configuradas
//         const messages = buildFromSections({
//             workspaceId,
//             timeZoneStaff,
//             timeZoneParticipant,
//             companyId,
//             booking,
//             notificationConfig,
//             sectionsToTrigger,
//         });

//         if (!messages.length) {
//             console.log(CONSOLE_COLOR.FgYellow, `[publishForAction] No messages built for action '${action}'`, CONSOLE_COLOR.Reset);
//             return 0;
//         }

//         // 3️⃣ Publicar mensajes (o simularlo)
//         let published = 0;
//         let filtered = 0;
//         for (const msg of messages) {
//             try {
//                 if (!msg?.notification) {
//                     console.log(
//                         CONSOLE_COLOR.FgYellow,
//                         `[publishForAction] booking ${booking.id} → no notification in message (${msg})`,
//                         CONSOLE_COLOR.Reset
//                     );
//                     continue;
//                 }

//                 // Determinar el tipo de evento de notificación
//                 const eventType = msg.notification.dataJson?.section;

//                 // Aplicar reglas de filtrado
//                 if (eventType) {
//                     const shouldSend = shouldSendNotification(
//                         eventType,
//                         msg.notification.scheduledDate,
//                         msg.notification.dedupeKey,
//                         booking.createdAt
//                     );

//                     if (!shouldSend) {
//                         console.log(
//                             CONSOLE_COLOR.FgRed,
//                             `[publishForAction] booking ${booking.id} → FILTERED notifId: ${msg.notification.id} (${msg.notification.dataJson.section}) - event: ${eventType}, scheduled: ${msg.notification.scheduledDate}`,
//                             CONSOLE_COLOR.Reset
//                         );
//                         filtered++;
//                         continue;
//                     }
//                 }

//                 await publishStoreNotificationCreated(msg); // ← activa cuando tengas la cola
//                 console.log(
//                     CONSOLE_COLOR.FgGreen,
//                     `[publishForAction] booking ${booking.id} → notifId: ${msg.notification.id} (${msg.notification.dataJson.section}) via ${msg.notification.channel}`,
//                     CONSOLE_COLOR.Reset
//                 );
//                 published++;
//             } catch (err: any) {
//                 new CustomError(`[publishForAction] publish failed`, err, "verbose");
//             }
//         }

//         console.log(
//             CONSOLE_COLOR.FgMagenta,
//             `[publishForAction] booking ${booking.id} → Summary: ${published} published, ${filtered} filtered`,
//             CONSOLE_COLOR.Reset
//         );

//         return published;
//     } catch (err: any) {
//         new CustomError(`[publishForAction] fatal building/publishing`, err, "verbose");
//         return 0;
//     }
// }


/**
 * Publica una acción en la cola de notificaciones
 * Genera los mensajes a partir de las secciones configuradas y decide, por cada uno,
 * si debe publicarse (enviar) ahora o filtrarse según el validator.
 *
 * ✍️ Notas de diseño:
 * - `buildFromSections(...)` construye las notificaciones (uno o más canales/acciones).
 * - `shouldSendNotification(...)` aplica reglas de tiempo y tipo de evento (UTC + tolerancia).
 * - Este método itera cada mensaje y lo publica mediante `publishStoreNotificationCreated(...)`.
 * - Si quieres coalescer/downgradear reminders antes de validar, inserta un “pre-validator”
 *   antes del bucle (ver bloque comentado “(opcional) Coalesce de reminders” más abajo).
 */
export const _publishForAction = async (params: {
    action: ActionKey;
    workspaceId?: string;
    timeZoneStaff: string;           // TZ del usuario receptor (staff); úsalo cuando el receptor sea el usuario
    timeZoneParticipant: string;     // TZ del cliente receptor (participant); úsalo cuando el receptor sea el cliente
    companyId?: string;

    booking: BookingSnap;            // snapshot mínimo del evento/cita
    notificationConfig: any;         // configuración (secciones, grupos, acciones) del workspace
}): Promise<number> => {
    // Desestructuramos parámetros para claridad
    const {
        action,
        booking,
        workspaceId,
        timeZoneStaff,
        timeZoneParticipant,
        companyId,
        notificationConfig
    } = params;

    try {
        console.log("estoy en _publishForAction con action:", action);
        // 1️⃣ Resolver qué secciones hay que disparar para esta acción
        //    ACTION_TO_SECTIONS es un mapa (p.ej. "add, addFromRecurrence..." → ["booking.request.created", ...])
        const sectionsToTrigger = ACTION_TO_SECTIONS[action] ?? [];
        if (!sectionsToTrigger.length) {
            console.log(
                CONSOLE_COLOR.FgYellow,
                `[publishForAction] No sections for action '${action}'`,
                CONSOLE_COLOR.Reset
            );
            return 0; // Nada que hacer
        }

        // 2️⃣ Construir mensajes a partir de las secciones (uno por acción/canal/destinatario)
        //    buildFromSections debe:
        //    - Asignar scheduledDate (UTC string ISO)
        //    - Rellenar to (email/phoneE164/etc.) si procede
        //    - Definir dataJson.section con el "eventType" (clave para validators)
        const messages = buildFromSections({
            workspaceId,
            timeZoneStaff,
            timeZoneParticipant,
            companyId,
            booking,
            notificationConfig,
            sectionsToTrigger,
        });

        if (!messages.length) {
            console.log(
                CONSOLE_COLOR.FgYellow,
                `[publishForAction] No messages built for action '${action}'`,
                CONSOLE_COLOR.Reset
            );
            return 0;
        }

        // (opcional) 2.5️⃣ Coalesce/Downgrade de reminders antes de validar
        // Si tienes un pre-validador que agrupa “booking.reminder.beforeStart” por cohorte
        // y reprograma (o descarta) de forma consistente, puedes aplicarlo aquí y trabajar
        // con la lista coalescida en lugar de `messages`.
        //
        // Map StoreNotificationCreatedV1[] to NotificationMsg[]


        /**
         * TODO:
         * Esto no se hace al final.
         * Es debido a que las reglas de las notificaciones se revisan una última vez en el ms-cnotification
         * Por lo que si hay un offset desconodido, el validador de las reglas lo va a filtrar.
         */
        // const { toPublish, skipped } = coalesceReminderBeforeStart(messages, {
        //     clockSkewSeconds: 90,
        //     minWindowMinutes: 55, // p.ej. 55 = debe quedar al menos 55m entre schedule y start
        //     allowDowngrade: true,
        //     downgradeMinOffsetMinutes: 15,
        //     downgradeMinRemainingToAllow: 120,
        //     downgradeBuckets: [1440, 360, 120, 30],
        //     downgradeBucketsOnly: true,
        // });
        // if (skipped.length) {
        //     for (const s of skipped) console.log("[coalesce] skipped", s);
        // }
        const finalMessages = messages;


        // En caso de no usar coalesce, seguimos con `messages` tal cual:
        // const finalMessages = messages;

        // 3️⃣ Iterar y publicar mensajes (con contadores para métricas)
        let published = 0; // cantidad de mensajes finalmente publicados
        let filtered = 0; // cantidad de mensajes filtrados por el validator

        for (const msg of finalMessages) {
            try {
                // Sanidad: si la estructura no trae el bloque notification, no se puede publicar
                if (!msg?.notification) {
                    console.log(
                        CONSOLE_COLOR.FgYellow,
                        `[publishForAction] booking ${booking.id} → no notification in message (${msg})`,
                        CONSOLE_COLOR.Reset
                    );
                    continue;
                }

                // Para los validators, el "tipo de evento" se suele llevar en dataJson.section
                // (ej. "booking.reminder.beforeStart", "booking.request.created", etc.)
                const eventType = msg.notification.dataJson?.section;

                // 3.1️⃣ Aplicar reglas de filtrado (time windows, offsets, etc.)
                //      shouldSendNotification devuelve boolean; NO reprograma.
                //      Si implementas coalesce/downgrade, hazlo ANTES de este punto.
                if (eventType) {
                    if (!msg.notification.scheduledDate) {
                        filtered++;
                        continue;
                    }
                    const shouldSend = shouldSendNotification(
                        eventType,
                        msg.notification.scheduledDate, // debe ser ISO/Date en UTC
                        msg.notification.dedupeKey,     // ej. "...:offset:360m"
                        booking.createdAt               // útil para reglas de 12h en request.created
                    );

                    // Si el validator dice que no, lo contabilizamos como filtrado y no publicamos
                    if (!shouldSend) {
                        console.log(
                            CONSOLE_COLOR.FgRed,
                            `[publishForAction] booking ${booking.id} → FILTERED notifId: ${msg.notification.id} (${msg.notification.dataJson.section}) - event: ${eventType}, scheduled: ${msg.notification.scheduledDate}`,
                            CONSOLE_COLOR.Reset
                        );
                        filtered++;
                        continue; // saltamos a la siguiente notificación
                    }
                }

                // 3.2️⃣ Publicar la notificación (enviar a la cola)
                //      publishStoreNotificationCreated debe producir el mensaje en RabbitMQ (o el bus que uses).
                await publishStoreNotificationCreated(msg); // ← activa cuando tengas la cola

                console.log(
                    CONSOLE_COLOR.FgGreen,
                    `[publishForAction] booking ${booking.id} → notifId: ${msg.notification.id} (${msg.notification.dataJson.section}) via ${msg.notification.channel}`,
                    CONSOLE_COLOR.Reset
                );
                published++; // métrica OK

            } catch (err: any) {
                // Si falla la publicación de una notificación concreta, registramos un error detallado
                new CustomError(`[publishForAction] publish failed`, err, "verbose");
                // Nota: no hacemos throw; seguimos con el resto para no bloquear toda la tanda
            }
        }

        // 4️⃣ Resumen de la operación para este booking/action (útil en logs y métricas)
        console.log(
            CONSOLE_COLOR.FgMagenta,
            `[publishForAction] booking ${booking.id} → Summary: ${published} published, ${filtered} filtered`,
            CONSOLE_COLOR.Reset
        );

        // Devolvemos cuántas se publicaron (puede servir como “éxito” de la acción)
        return published;

    } catch (err: any) {
        // Cualquier fallo no controlado en la construcción/iteración se registra aquí
        new CustomError(`[publishForAction] fatal building/publishing`, err, "verbose");
        return 0; // devolvemos 0 publicados ante error fatal
    }
};
