import { TIME_SECONDS } from "../../constant/time";
import { Response } from "../../models/messages/response";
import { BusinessHourService } from "../../services/@database/all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../../services/@database/all-business-services/worker-business-hours/worker-business-hours.service";
import { publicGetAvailableTimeSlots_SPECIAL } from "../../services/@database/event/availability-special.service";
import { EventV2Service } from "../../services/@database/event/eventv2.service";

import * as RPC from "../../services/@rabbitmq/rpc/functions";
import { IRedisSavedWorkspaceStrategy } from "../../services/@redis/cache/interfaces/interfaces";
import { RedisStrategyFactory } from "../../services/@redis/cache/strategies/redisStrategyFactory";
import { JWTService } from "../../services/jwt/jwt.service";

export class PublicEventController {
    public eventService: EventV2Service;
    private businessHoursService = new BusinessHourService();
    private workerHoursService = new WorkerBusinessHourService();
    private temporaryHoursService = new TemporaryBusinessHourService();

    constructor() {
        this.eventService = new EventV2Service();
    }


    public publicAdd = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;

            const result = await this.eventService.addEventV2(body);

            // TODO: Usad el send de RabbitMQ para crear notificación en su Microservicio
            // Por hacer

            res.status(200).json(Response.build("Evento creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public publicGetAvailableDaysSlots = async (req: any, res: any) => {
        try {

            // body esperado:
            // {
            //   idCompany: string,
            //   idWorkspace: string,
            //   timezone: string,                    
            //   range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" },
            //   attendees: [{ serviceId, durationMin, staffId?: string|null, categoryId?: string }],
            //   excludeEventId?: string
            // }
            const payload = req.body;
            const result = await this.eventService.publicGetAvailableDays(payload);


            console.log("mira que es result", result);
            return res
                .status(200)
                .json(Response.build("Días disponibles", 200, true, result?.days || []));
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }


    publicGetAvailableTimeSlots = async (req: any, res: any) => {
        try {
            const payload = req.body;

            // Validación básica
            if (!payload?.idCompany || !payload?.idWorkspace) {
                return res.status(400).json({ message: "Faltan idCompany o idWorkspace" });
            }
            if (!payload?.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
                return res.status(400).json({ message: "date debe ser YYYY-MM-DD" });
            }
            if (!payload?.timezone) {
                return res.status(400).json({ message: "Falta timezone" });
            }
            if (!Array.isArray(payload?.attendees) || payload.attendees.length === 0) {
                return res.status(400).json({ message: "attendees vacío" });
            }


            const savedWorkspace = RedisStrategyFactory.getStrategy('savedWorkspace') as IRedisSavedWorkspaceStrategy;
            // 1) Workspace desde Redis (por id). Fallback a RPC y cache set.
            let workspace: any = await savedWorkspace.getSavedWorkspaceByIdWorkspace(payload.idWorkspace);

            // console.log("mira que es workspace cacheado", workspace);
            if (!workspace) {
                const rpcRes: any = await RPC.getEstablishmentByIdForFlow(payload.idWorkspace);
                workspace = rpcRes?.workspace ?? null;

                console.log("mira que es workspace desde rpc", workspace);
                if (workspace?.id) {
                    await savedWorkspace.setSavedWorkspaceByIdWorkspace(
                        workspace?.id,
                        workspace,
                        TIME_SECONDS.HOUR
                    );
                }
            }

            const timeZoneWorkspace = workspace?.timeZone ?? null;
            if (!timeZoneWorkspace) {
                console.log("que ????")
                // si la estructura viene como { workspace: {...} } desde RPC, ya la cubrimos arriba
                // si no hay timezone, devolvemos 400 para evitar cálculos erróneos
                return res.status(400).json({ message: "No se pudo resolver el timezone del workspace" });
            }

            // console.log("mira que es timeZoneWorkspace", timeZoneWorkspace);
            // const result = await this.eventService.publicGetAvailableTimeSlots({
            //     ...payload,
            //     timeZoneClient: payload.timezone,
            //     timeZoneWorkspace: timeZoneWorkspace
            // });



            const result = await publicGetAvailableTimeSlots_SPECIAL(
                {
                    ...payload,
                    timeZoneClient: payload.timezone,
                    timeZoneWorkspace: timeZoneWorkspace
                },
                {
                    businessHoursService: this.businessHoursService,
                    workerHoursService: this.workerHoursService,
                    temporaryHoursService: this.temporaryHoursService,
                    bookingConfig: workspace?.bookingConfig ?? { slot: { alignMode: "clock" } },
                }

            );


            return res
                .status(200)
                .json(Response.build("Horarios disponibles", 200, true, result?.timeSlots || []));
        } catch (err: any) {
            return res.status(500).json({ message: err?.message ?? "Unexpected error" });
        }
    };



}
