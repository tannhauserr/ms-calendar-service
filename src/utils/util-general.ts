import moment from "moment";
import { CONSOLE_COLOR } from "../constant/console-color";
import bcryptjs from "bcryptjs";
import { v4 as uuidv4 } from 'uuid';


export class UtilGeneral {

    /**
 * Cambia a una fecha "correcta" para ser guardada en la base de datos
 * @param date
 */
    static fixHour(date: Date) {
        let hoursDifffromDate = date.getHours() - date.getTimezoneOffset() / 60;
        date.setHours(hoursDifffromDate);
        return date;
    }

    /**
     * Devuelve si la fecha introducida en el primer parámetro es anterior a la otra colocada
     * 
     * @param firstDate getTime tipo date
     * @param secondDate getTime tipo date
     * @returns 
     */
    static dateInPast = (firstDate: number, secondDate = new Date().getTime()) => {
        return moment(firstDate).isBefore(moment(secondDate))
    }


    static sleep = (ms = 1000) => new Promise<any>(res => setTimeout(() => res(""), ms))


    static messageOnCron(show = true, message: string = "NO MESSAGE") {
        if (!show) return;
        // console.log(`== Cron activado: [${message}]`, UtilGeneral.fixHour(new Date()));
        console.log(`${CONSOLE_COLOR.FgGreen}==${CONSOLE_COLOR.Reset} Cron activado: ${CONSOLE_COLOR.FgGreen}[${message}]${CONSOLE_COLOR.Reset}`, UtilGeneral.fixHour(new Date()));
    }



    static randomDate(start: Date, end: Date) {
        return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }


    static createHashPassword = (password: string) => bcryptjs.hashSync(password, 10);
    static compareHashPassword = (password: string, hash: string) => bcryptjs.compareSync(password, hash);

    static getCorrectUTCDate = (date: Date) => {
        const validDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return validDate;
    }


    static generateUUIDv4 = () => {
        return uuidv4();
    }

}

