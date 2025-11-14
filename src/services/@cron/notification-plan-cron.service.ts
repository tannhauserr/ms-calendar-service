// src/cron/notification-due.cron.ts
import schedule from "node-schedule";
import prisma from "../../lib/prisma";
import { NotificationPlanService } from "../@database/notification-plan/notification-plan.service";

// import { CONSOLE_COLOR } from "../constant/console-color"; // si lo usas

/**
 * Cron que despacha planes vencidos usando _createNotification().
 * - Corre cada 10 segundos
 * - Carga el evento y participantes
 * - Construye el body (EventForBackend-like) y llama a _createNotification
 * - Marca el plan como queued si no hubo error
 */
export class NotificationPlanCronService {
    private static _instance: NotificationPlanCronService;
    public job: schedule.Job | undefined;
    private readonly BATCH_SIZE = 200;

    private constructor() { }

    public static get instance() {
        return this._instance || (this._instance = new this());
    }

    start() {
        // if (this.job) return;

        // // Cada 10s
        // this.job = schedule.scheduleJob("*/10 * * * * *", async () => {
        //     try {
        //         const now = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        //         console.log(`[NotificationDueCron] Tick at ${now.toISOString()}`);

        //         // 1️⃣ Buscar planes listos para enviar (planned y fecha vencida)
        //         const plans = await prisma.notificationPlan.findMany({
        //             where: {
        //                 status: "planned",
        //                 eventStartDate: { lte: now },
        //             },
        //             orderBy: { eventStartDate: "asc" },
        //             take: this.BATCH_SIZE,
        //         });

        //         if (!plans.length) return;

        //         // 2️⃣ Cargar eventos asociados
        //         const eventIds = [...new Set(plans.map(p => p.idEventFk))];
        //         const events = await prisma.event.findMany({
        //             where: { id: { in: eventIds } },
        //             include: { eventParticipant: true },
        //         });
        //         const eventById = new Map(events.map(e => [e.id, e]));

        //         // 3️⃣ Publicar cada plan
        //         const nps = NotificationPlanService.instance ?? new NotificationPlanService();

        //         for (const plan of plans) {
        //             console.log("plan ID:", plan.id);
        //             const event = eventById.get(plan.idEventFk);
        //             if (!event) {
        //                 console.error(`[NotificationDueCron] Event not found for plan ${plan.id}`);
        //                 continue;
        //             }

        //             try {
        //                 // Publicar al ms de notificaciones
        //                 await nps.createNotification(event, plan);

        //                 // Marcar como enviado
        //                 await prisma.notificationPlan.update({
        //                     where: { id: plan.id },
        //                     data: {
        //                         status: "queued",
        //                         sentDate: new Date(),
        //                     },
        //                 });
        //             } catch (err: any) {
        //                 console.error(
        //                     `[NotificationDueCron] Error plan ${plan.id}:`,
        //                     err?.message || err
        //                 );
        //                 // lo dejamos en planned, se reintentará en el próximo tick
        //             }
        //         }
        //     } catch (e) {
        //         console.error("[NotificationDueCron] Fatal error ->", e);
        //         this.stop();
        //         setTimeout(() => this.start(), 1000);
        //     }
        // });
    }



    stop() {
        if (this.job) {
            this.job.cancel();
            this.job = undefined;
        }
    }
}
