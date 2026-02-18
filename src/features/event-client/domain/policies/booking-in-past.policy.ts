import type moment from "moment";

type TimeInPastInput = {
    isToday: boolean;
    startWS: moment.Moment;
    minAllowedStartWS: moment.Moment;
};

/**
 * Reglas temporales para bloquear reservas en pasado.
 */
export class BookingInPastPolicy {
    /**
     * Devuelve true si el día solicitado ya pasó en TZ del workspace.
     */
    public static isDayInPast(startWS: moment.Moment, todayWS: moment.Moment): boolean {
        return startWS.clone().startOf("day").isBefore(todayWS, "day");
    }

    /**
     * Devuelve true si la hora solicitada para hoy está por debajo del mínimo permitido.
     */
    public static isTimeInPast(input: TimeInPastInput): boolean {
        if (!input.isToday) {
            return false;
        }
        return input.startWS.isBefore(input.minAllowedStartWS);
    }
}
