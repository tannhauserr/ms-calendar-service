import moment from "moment";
import prisma from "../../../../../../../lib/prisma";

/**
 * Verifica la disponibilidad de un trabajador para un intervalo de tiempo específico.
 * Se puede pasar un parámetro opcional para excluir un evento (por ejemplo, al actualizar).
 * @param idUser - ID del trabajador a verificar
 * @param idCompany - ID de la empresa
 * @param startDate - Fecha y hora de inicio del evento
 * @param endDate - Fecha y hora de fin del evento
 * @param businessHours - Horarios de negocio de la empresa
 * @param workerHours - Horarios específicos del trabajador
 * @param temporaryHours - Horarios temporales o excepcionales del trabajador
 * @param excludeEventId - (Opcional) ID del evento a excluir en la verificación (para update)
 * @returns - `true` si el trabajador está disponible, `false` en caso contrario
 */
export async function checkWorkerAvailability(
    idUser: string,
    idCompany: string,
    idWorkspace: string,
    startDate: Date,
    endDate: Date,
    businessHours: any,
    workerHours: any,
    temporaryHours: any,
    excludeEventId?: number
): Promise<boolean> {
    const dayOfWeek = moment(startDate).format('dddd').toUpperCase();
    const timeSlot: [string, string] = [moment(startDate).format('HH:mm'), moment(endDate).format('HH:mm')];

    console.log("Verificando horarios temporales");
    const dateStr = moment(startDate).format('YYYY-MM-DD');
    if (temporaryHours[dateStr] !== undefined) {
        if (temporaryHours[dateStr] === null) {
            console.log("No disponible por horario temporal cerrado");
            return false;
        }
        if (!isWithinBusinessHours(timeSlot, temporaryHours[dateStr])) {
            console.log("No disponible por horario temporal");
            return false;
        }
    } else if (workerHours[dayOfWeek] !== undefined) {
        console.log("Verificando horarios del trabajador");
        if (!isWithinBusinessHours(timeSlot, workerHours[dayOfWeek])) {
            console.log("No disponible por horarios del trabajador");
            return false;
        }
    } else {
        console.log("Verificando horarios de negocio");
        console.log("Horario de negocio:", businessHours[dayOfWeek]);
        console.log("Intervalo de tiempo:", timeSlot);
        if (!businessHours[dayOfWeek] || !isWithinBusinessHours(timeSlot, businessHours[dayOfWeek])) {
            console.log("No disponible por horarios de negocio");
            return false;
        }
    }

    console.log("Verificando eventos en conflicto");
    const conflictFilter: any = {
        idUserPlatformFk: idUser,
        AND: [
            { startDate: { lt: endDate } },
            { endDate: { gt: startDate } }
        ]
    };

    if (excludeEventId) {
        conflictFilter.id = { not: excludeEventId };
    }

    const conflictingEvents = await prisma.event.findMany({
        where: conflictFilter
    });

    console.log("Eventos en conflicto encontrados:", conflictingEvents);
    return conflictingEvents.length === 0;
}

/**
 * Verifica si el intervalo de tiempo está dentro de los horarios permitidos.
 * @param timeSlot - Intervalo de tiempo [inicio, fin]
 * @param allowedHours - Lista de intervalos permitidos para el día
 * @returns - `true` si el intervalo está permitido, `false` en caso contrario
 */
function isWithinBusinessHours(timeSlot: [string, string], allowedHours: string[][]): boolean {
    if (!allowedHours || allowedHours.length === 0) {
        return false;
    }

    const [start, end] = timeSlot.map(time => moment(time, 'HH:mm'));
    return allowedHours.some(([allowedStart, allowedEnd]) => {
        const allowedStartMoment = moment.utc(allowedStart, 'HH:mm');
        const allowedEndMoment = moment.utc(allowedEnd, 'HH:mm');
        return start.isSameOrAfter(allowedStartMoment) && end.isSameOrBefore(allowedEndMoment);
    });
}
