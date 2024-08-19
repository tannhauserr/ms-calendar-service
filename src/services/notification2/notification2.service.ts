import axios from "axios";
import moment from "moment";


const NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({
    path: `.env.${NODE_ENV}`
});

export class Notification2Service {


    /**
     * Manda un objeto a otro backend para gestionarlo y guardarlo en la base de datos
     */
    static addNotification(paramsAgent) {
        return new Promise<any>((res, rej) => {
            delete paramsAgent.calculatePoints;
            delete paramsAgent.sendNotification;

            let not = {
                title: `Contacto mediante bot`,
                email: '',
                replyTo: '',
                message: '',
                cc: '',
                bcc: '',
                priority: 1,
                revised: false,
                sent: false, // cambiarlo a false antes de la subida
                trying: 0,
                jsonLead: JSON.stringify(paramsAgent)
            }
            let json = JSON.stringify(not);
            let params = `json=${json}`;

            let headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
            };
            axios.post(`${process.env.URL_BACK_SYMFONY}/public/notifications`, params, { headers })
                .then(async ({ data }) => {
                    console.log("\n\n\nNotification" + JSON.stringify(data.item) + "\n")
                    res(data);
                })
                .catch(e => {
                    rej(e);
                });
        });
    }


    static addHoldedSymfony(jsonLead) {
        return new Promise<any>((res, rej) => {

            delete jsonLead.sendNotification;
            delete jsonLead.calculatorPoints;
            jsonLead.rrss = "WEB";
            let holded = {
                jsonlead: JSON.stringify(jsonLead)
            }

            let json = JSON.stringify(holded);
            let params = `json=${json}`;

            let headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
            };
            return axios.post(`${process.env.URL_BACK_SYMFONY}/public/holded/manage-lead`, params, { headers })
                .then(async ({ data }) => {
                    console.log("\n\n\nHolded" + JSON.stringify(data.item) + "\n")
                    res(data);
                })
                .catch(e => {
                    rej(e);
                });
        });
    }

}