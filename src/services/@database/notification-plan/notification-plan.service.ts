// src/notifications/plan/notification-plan.service.ts
import { randomUUID } from "crypto";
import type { Event, NotificationPlan, PrismaClient } from "@prisma/client";
import { NotificationEvent } from "../../../models/notification/notification-config";
import { _publishForAction } from "../../../models/notification/util/trigger/for-action";
import { getWorkspacesByIds } from "../../@service-token-client/api-ms/auth.ms";
import { EventForBackend } from "../event/dto/EventForBackend";
import { getClientWorkspacesByIds } from "../../@service-token-client/api-ms/client.ms";
import prisma from "../../../lib/prisma";

type Channel = "email" | "whatsapp" | "sms" | "webpush" | "websocket";

interface UpsertPlanForEventParams {
    idEvent: string;
    idWorkspace: string;
    idCompany: string;
    sectionId: NotificationEvent;
    channel: Channel;
    scheduledDate: Date;
}

type Target = { email?: string; phoneE164?: string; subscriptionId?: string };

type EventContext = {
    workspaceId: string;
    companyId: string;
    event: { id: string; startAtLocal?: string; endAtLocal?: string };
    business: { email?: string; phoneE164?: string };
    clients: Target[]; // contactos resolubles
};

type PublishFn = (msg: any) => Promise<void>;

export class NotificationPlanService {
    private static _instance?: NotificationPlanService;
    static get instance() {
        return this._instance ?? (this._instance = new NotificationPlanService());
    }

    // ───────────────────────────────────────────────────────────
    // Upsert de plan (idempotente por dedupeKey)
    // ───────────────────────────────────────────────────────────
    // upsertPlanForEvent(p: UpsertPlanForEventParams) {
    //     const dedupeKey = [p.idEvent, p.sectionId, p.channel].join(":");

    //     return prisma.notificationPlan.upsert({
    //         where: { dedupeKey },
    //         create: {
    //             idEventFk: p.idEvent,
    //             idWorkspaceFk: p.idWorkspace,
    //             idCompanyFk: p.idCompany,
    //             sectionId: p.sectionId,
    //             scheduledDate: p.scheduledDate,
    //             status: "planned",
    //             dedupeKey,
    //         },
    //         update: {
    //             scheduledDate: p.scheduledDate,
    //             status: "planned",
    //         },
    //     });
    // }

    // ───────────────────────────────────────────────────────────
    // Cron: despacha lo vencido
    // ───────────────────────────────────────────────────────────
    // async dispatchPlanned(batchSize = 200) {
    //     const due = await this.prisma.notificationPlan.findMany({
    //         where: { status: "planned", scheduledDate: { lte: new Date() } },
    //         orderBy: { scheduledDate: "asc" },
    //         take: batchSize,
    //     });

    //     for (const plan of due) {
    //         try {
    //             const ctx = await this._fetchEventContext(plan.idEventFk);
    //             const kind = this._mapSectionToKind(plan.sectionId as string);

    //             const targets = this._resolveTargets({
    //                 sectionId: plan.sectionId as string,
    //                 channel: plan.channel as Channel,
    //                 ctx,
    //             });

    //             for (const t of targets) {
    //                 const msg = this._buildMessage({
    //                     kind,
    //                     channel: plan.channel as Channel,
    //                     to: t,
    //                     scheduledDate: plan.scheduledDate,
    //                     ctx,
    //                     plan,
    //                 });

    //                 await this.publishStoreNotificationCreated(msg);
    //             }

    //             await this._markQueued(plan.id);
    //         } catch (e: any) {
    //             // no cambiamos estado → reintenta en siguiente tick
    //             console.error("[NotificationPlanService.dispatchPlanned] error", plan.id, e?.message || e);
    //         }
    //     }

    //     return due.length;
    // }

    // ───────────────────────────────────────────────────────────
    // Helpers privados (puedes mover lógica aquí)
    // ───────────────────────────────────────────────────────────
    private async _fetchEventContext(idEvent: string): Promise<EventContext> {
        const ev = await prisma.event.findUnique({
            where: { id: idEvent },
            include: { eventParticipant: true },
        });
        if (!ev) throw new Error(`Event not found: ${idEvent}`);

        // negocio (workspace)
        const workspaces = await getWorkspacesByIds([ev.idWorkspaceFk]);
        const ws = Array.isArray(workspaces) ? workspaces[0] : workspaces?.[0];

        const business = {
            email: ws?.email ?? undefined,
            phoneE164: ws?.phoneNumber
                ? `+${(ws.phoneCode ?? "").toString()}${ws.phoneNumber}`
                : undefined,
        };

        // clientes desde participants -> ids de ClientWorkspace SIEMPRE
        const clientIds = (ev.eventParticipant ?? [])
            .map(p => p?.idClientWorkspaceFk)
            .filter((v): v is string => typeof v === "string")
            .filter((v, i, a) => a.indexOf(v) === i);

        const clientsBrief = clientIds.length
            ? await getClientWorkspacesByIds(clientIds, ev.idWorkspaceFk)
            : [];

        const clients = clientsBrief.map((c: any) => ({
            email: c?.email,
            phoneE164: c?.phoneE164,
            subscriptionId: undefined,
        }));

        return {
            workspaceId: ev.idWorkspaceFk,
            companyId: ev.idCompanyFk,
            business,
            clients,
            event: {
                id: ev.id,
                startAtLocal: ev.startDate.toISOString(),
                endAtLocal: ev.endDate.toISOString(),
            },
        };
    }


    private _mapSectionToKind(sectionId: string) {
        if (sectionId.startsWith("booking.reminder.")) return "bookingReminder";
        if (sectionId === "booking.accepted") return "bookingCreated";
        if (sectionId === "booking.updated") return "bookingUpdated";
        if (sectionId === "booking.cancelled") return "bookingCanceled";
        return "system";
    }

    private _resolveTargets(params: {
        sectionId: string;
        channel: Channel;
        ctx: EventContext;
    }): Target[] {
        // Estrategia mínima:
        // - secciones hacia “client” → ctx.clients
        // - secciones hacia “business” → [ctx.business]
        // Tu config determina a quién va cada sección; si no decides aquí, deja targets vacío
        // y que el MS-notification derive audiencias desde template/ownerPreference.

        const { sectionId, ctx } = params;

        // Ejemplo: reminders al cliente + aceptadas a ambos, etc.
        if (sectionId.startsWith("booking.reminder.")) return ctx.clients;
        if (sectionId === "booking.accepted") return [...ctx.clients, ctx.business].filter(Boolean);
        if (sectionId === "booking.updated") return [...ctx.clients, ctx.business].filter(Boolean);
        if (sectionId === "booking.cancelled") return [...ctx.clients, ctx.business].filter(Boolean);

        return []; // por defecto, que resuelva el MS de notis si va vacío
    }

    /**
   * Crea y envía notificaciones para el evento creado
   *
   * - Obtiene la configuración de notificaciones del workspace
   * - Construye booking base con datos del evento
   * - Envía notis al negocio (sin datos de cliente)
   * - Resuelve clientBrief por ids y envía una por cliente
   * - Maneja errores de forma independiente
   */
    // public createNotification = async (body: EventForBackend, result: Event) => {


    //     const idWorkspace = body?.event?.idWorkspaceFk;
    //     // 1) IDs de clientes (prioriza body.eventParticipant, fallback a result.eventParticipant)
    //     const idsFromBody = Array.isArray(body?.eventParticipant)
    //         ? body.eventParticipant
    //             .map(p => p?.idClientWorkspaceFk)
    //             .filter((v): v is string => typeof v === "string")
    //         : [];

    //     const idsFromResult = Array.isArray((result as any)?.eventParticipant)
    //         ? (result as any).eventParticipant
    //             .map((p: any) => p?.idClientWorkspaceFk)
    //             .filter((v: any): v is string => typeof v === "string")
    //         : [];

    //     const clientIds = (idsFromBody.length ? idsFromBody : idsFromResult)
    //         .filter(Boolean)
    //         .filter((v, i, a) => a.indexOf(v) === i); // únicos

    //     // 2) Cargar workspace + clientes en paralelo
    //     const [workspaces, clientList] = await Promise.all([
    //         getWorkspacesByIds([idWorkspace]),
    //         clientIds.length ? getClientWorkspacesByIds(clientIds, idWorkspace) : Promise.resolve([]),
    //     ]);

    //     if (!workspaces?.length) return;
    //     const workspace = workspaces[0];
    //     const notificationConfig = workspace?.generalNotificationConfigJson;
    //     if (!notificationConfig || !result) return;

    //     // 3) Booking base (negocio)
    //     const bookingBase = {
    //         id: result.id,
    //         createdAt: result.createdDate.toISOString(),
    //         updatedAt: result.updatedDate.toISOString(),
    //         startAtLocal: result.startDate.toISOString(),
    //         endAtLocal: result.endDate.toISOString(),
    //         business: {
    //             email: workspace?.email ?? undefined,
    //             phoneE164: workspace?.phoneNumber
    //                 ? `+${(workspace.phoneCode ?? "").toString()}${workspace.phoneNumber}`
    //                 : undefined,
    //         },
    //     };

    //     // 4) Publicar para negocio
    //     try {
    //         await publishForAction({
    //             action: "add",
    //             workspaceId: workspace.id,
    //             companyId: workspace.idCompanyFk,
    //             booking: bookingBase, // sin client
    //             notificationConfig,
    //         });
    //     } catch (err: any) {
    //         console.error("[EventController.add] notify business error:", err?.message || err);
    //     }

    //     // 5) Publicar para cada cliente (si hay contacto)
    //     for (const client of clientList) {
    //         const email = (client as any)?.email;
    //         const phoneE164 = (client as any)?.phoneE164;
    //         if (!email && !phoneE164) continue;

    //         const bookingForClient = {
    //             ...bookingBase,
    //             client: { email, phoneE164 },
    //         };

    //         try {
    //             await publishForAction({
    //                 action: "add",
    //                 workspaceId: workspace.id,
    //                 companyId: workspace.idCompanyFk,
    //                 booking: bookingForClient,
    //                 notificationConfig,
    //             });
    //         } catch (err: any) {
    //             console.error("[EventController.add] notify client error:", { id: (client as any)?.id }, err?.message || err);
    //         }
    //     }
    // };

//     /**
//  * Crea y envía notificaciones para un evento ya creado
//  *
//  * - Obtiene configuración de notificaciones del workspace
//  * - Construye booking base con datos del evento
//  * - Envía notis al negocio (sin datos de cliente)
//  * - Envía notis al/los clientes asociados (si hay contacto)
//  */
//     public createNotification = async (value: Event, plan: NotificationPlan) => {

//         console.log("entro aqui, event:", value);
//         console.log("entro aqui, plan:", plan);
//         const idWorkspace = value.idWorkspaceFk;
//         if (!idWorkspace) return;

//         // 1) IDs de clientes asociados
//         const clientIds = Array.isArray((value as any)?.eventParticipant)
//             ? (value as any).eventParticipant
//                 .map((p: any) => p?.idClientWorkspaceFk)
//                 .filter((v: any): v is string => typeof v === "string")
//             : [];

//         // 2) Cargar workspace + clientes en paralelo
//         const [workspaces, clientList] = await Promise.all([
//             getWorkspacesByIds([idWorkspace]),
//             // clientIds.length
//             //     ? getClientWorkspacesByIds(clientIds, idWorkspace)
//             //     : Promise.resolve([]),
//             Promise.resolve([])
//         ]);

//         if (!workspaces?.length) return;
//         const workspace = workspaces[0];
//         const notificationConfig = workspace?.generalNotificationConfigJson;
//         if (!notificationConfig) return;

//         // 3) Booking base (negocio)
//         const bookingBase = {
//             id: value.id,
//             createdAt: value.createdDate.toISOString(),
//             updatedAt: value.updatedDate.toISOString(),
//             startAtLocal: value.startDate.toISOString(),
//             endAtLocal: value.endDate.toISOString(),
//             business: {
//                 email: workspace?.email ?? undefined,
//                 phoneE164: workspace?.phoneNumber
//                     ? `+${(workspace.phoneCode ?? "").toString()}${workspace.phoneNumber}`
//                     : undefined,
//             },
//         };

//         // 4) Publicar para negocio
//         try {
//             await _publishForAction({
//                 action: plan?.actionSectionType,
//                 workspaceId: workspace.id,
//                 companyId: workspace.idCompanyFk,
//                 booking: bookingBase, // sin client
//                 notificationConfig,
//             });
//         } catch (err: any) {
//             console.error("[EventController.add] notify business error:", err?.message || err);
//         }

//         // 5) Publicar para cada cliente (si hay contacto)
//         for (const client of clientList) {
//             const email = (client as any)?.email;
//             const phoneE164 = (client as any)?.phoneE164;
//             if (!email && !phoneE164) continue;

//             const bookingForClient = {
//                 ...bookingBase,
//                 client: { email, phoneE164 },
//             };

//             try {
//                 await _publishForAction({
//                     action: plan?.actionSectionType,
//                     workspaceId: workspace.id,
//                     companyId: workspace.idCompanyFk,
//                     booking: bookingForClient,
//                     notificationConfig,
//                 });
//             } catch (err: any) {
//                 console.error("[EventController.add] notify client error:", { id: (client as any)?.id }, err?.message || err);
//             }
//         }
//     };


    private _markQueued(planId: string) {
        return prisma.notificationPlan.update({
            where: { id: planId },
            data: { status: "queued" },
        });
    }
}


