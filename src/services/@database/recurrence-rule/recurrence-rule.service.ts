import { Prisma, RecurrenceRule } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";


type EventParticipantInfo = {
    id: string;
    idClientWorkspaceFk: string;
    idClientFk: string;
};

type EventInfo = {
    id: string;
    eventParticipant: EventParticipantInfo[];
};

export type RecurrenceRuleWithClients = {
    id: string;
    idCalendarFk: string;
    dtstart: Date;
    until: Date | null;
    rrule: string;
    tzid: string;
    recurrenceStatusType: RecurrenceRule['recurrenceStatusType'];
    idUserFk?: string;
    events: EventInfo[];
};


export class RecurrenceRuleService {
    constructor() { }

    /**
     * Crea una nueva regla de recurrencia
     */
    async addRule(item: Prisma.RecurrenceRuleCreateInput): Promise<RecurrenceRule> {
        try {
            return await prisma.recurrenceRule.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError("RecurrenceRuleService.addRule", error);
        }
    }

    /**
     * Recupera una regla por su ID
     */
    async getRuleById(id: string): Promise<RecurrenceRule | null> {
        try {
            return await prisma.recurrenceRule.findUnique({
                where: { id },
            });
        } catch (error: any) {
            throw new CustomError("RecurrenceRuleService.getRuleById", error);
        }
    }

    /**
     * Actualiza campos de una regla de recurrencia
     */
    async updateRule(
        id: string,
        data: Prisma.RecurrenceRuleUpdateInput
    ): Promise<RecurrenceRule> {
        try {
            return await prisma.recurrenceRule.update({
                where: { id },
                data: {
                    ...data,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError("RecurrenceRuleService.updateRule", error);
        }
    }

    /**
     * Elimina una regla de recurrencia
     */
    async deleteRule(id: string): Promise<RecurrenceRule> {
        try {
            return await prisma.recurrenceRule.delete({
                where: { id },
            });
        } catch (error: any) {
            throw new CustomError("RecurrenceRuleService.deleteRule", error);
        }
    }


    // async getRules(pagination: Pagination): Promise<{
    //     rows: RecurrenceRuleWithClients[];
    //     pagination: Pagination;
    // }> {
    //     try {
    //         // 1) Trae solo las reglas (sin participantes)
    //         const { rows, pagination: newPagination } = await getGeneric(
    //             pagination,
    //             "recurrenceRule",
    //             {
    //                 id: true,
    //                 idCalendarFk: true,
    //                 dtstart: true,
    //                 until: true,
    //                 rrule: true,
    //                 tzid: true,
    //                 recurrenceStatusType: true,
    //                 idUserFk: true,
    //             }
    //         );

    //         // Extrae los IDs de las reglas
    //         const ruleIds = rows.map((r) => r.id);

    //         // 2) Trae SOLO los participantes ligados a esas reglas,
    //         //    sin usar `distinct` (que sólo acepta campos escalares de EventParticipant)
    //         //    y seleccionando el campo de la relación `event.idRecurrenceRuleFk`
    //         const participants = await prisma.eventParticipant.findMany({
    //             where: {
    //                 event: {
    //                     idRecurrenceRuleFk: { in: ruleIds },
    //                 },
    //             },
    //             select: {
    //                 idClientFk: true,
    //                 idClientWorkspaceFk: true,
    //                 // Para luego saber a qué regla pertenece cada participante:
    //                 event: {
    //                     select: {
    //                         idRecurrenceRuleFk: true,
    //                     },
    //                 },
    //             },
    //         });

    //         // 3) Agrupa en memoria, eliminando duplicados de cliente+establecimiento
    //         interface ClientInfo { idClientFk: string; idClientWorkspaceFk: string }
    //         const mapByRule = new Map<string, ClientInfo[]>();

    //         for (const p of participants) {
    //             const ruleId = p.event.idRecurrenceRuleFk!;
    //             if (!mapByRule.has(ruleId)) {
    //                 mapByRule.set(ruleId, []);
    //             }
    //             const arr = mapByRule.get(ruleId)!;
    //             // dedupe simple por stringify
    //             const key = `${p.idClientFk}|${p.idClientWorkspaceFk}`;
    //             if (!arr.some(c => `${c.idClientFk}|${c.idClientWorkspaceFk}` === key)) {
    //                 arr.push({
    //                     idClientFk: p.idClientFk,
    //                     idClientWorkspaceFk: p.idClientWorkspaceFk,
    //                 });
    //             }
    //         }

    //         // 4) Combina reglas + clientes
    //         const rowsWithClients: RecurrenceRuleWithClients[] = rows.map((r) => ({
    //             ...r,
    //             clients: mapByRule.get(r.id) ?? [],
    //         }));

    //         return { rows: rowsWithClients, pagination: newPagination };
    //     } catch (error: any) {
    //         throw new CustomError("RecurrenceRuleService.getRules", error);
    //     }
    // }



    /**
     * Lista todas las reglas de un calendario dado
     */
    async getRulesByCalendar(idWorkspace: string): Promise<RecurrenceRule[]> {
        try {
            return await prisma.recurrenceRule.findMany({
                where: { idWorkspaceFk: idWorkspace },
                orderBy: { dtstart: "asc" },
            });
        } catch (error: any) {
            throw new CustomError("RecurrenceRuleService.getRulesByCalendar", error);
        }
    }

    // /**
    //  * Genera las instancias (fechas) de la regla entre dos fechas
    //  */
    // async getInstances(
    //     id: string,
    //     options?: { from?: Date; to?: Date }
    // ): Promise<Date[]> {
    //     try {
    //         const rule = await this.getRuleById(id);
    //         if (!rule) throw new Error("Rule not found");

    //         // Construir texto iCalendar mínimo
    //         const dtstartUtc = moment(rule.dtstart).utc().format("YYYYMMDD[T]HHmmss[Z]");
    //         const lines = [
    //             `DTSTART:${dtstartUtc}`,
    //             `RRULE:${rule.rrule}`,
    //         ];
    //         if (rule.until) {
    //             const untilUtc = moment(rule.until).utc().format("YYYYMMDD[T]HHmmss[Z]");
    //             // Asegurarse de no duplicar UNTIL en el RRULE si ya está dentro
    //             if (!rule.rrule.includes("UNTIL=")) {
    //                 lines[1] += `;UNTIL=${untilUtc}`;
    //             }
    //         }
    //         const text = lines.join("\n");

    //         const rruleObj = rrulestr(text) as RRule;

    //         if (options?.from || options?.to) {
    //             const after = options.from ?? new Date(0);
    //             const before = options.to ?? moment().add(1, "year").toDate();
    //             return rruleObj.between(after, before, true);
    //         } else {
    //             return rruleObj.all();
    //         }
    //     } catch (error: any) {
    //         throw new CustomError("RecurrenceRuleService.getInstances", error);
    //     }
    // }
}
