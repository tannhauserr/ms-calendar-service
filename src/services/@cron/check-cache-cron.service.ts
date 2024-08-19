import schedule from "node-schedule";
import { UtilGeneral } from "../../utils/util-general";
import { NodeCacheService } from "../@cache/node-cache.service";
import { generatePrivateKey } from "../../utils/jwt/generatePrivateKey";


export class CheckCacheCronService {

    private static _instance: CheckCacheCronService;
    public job: schedule.Job | any;

    constructor() {

    }

    public static get instance() {
        return this._instance || (this._instance = new this());
    }

    start() {
        if (!this.job) {
            this.job = schedule.scheduleJob('*/10 * * * * *', async () => {
                // this.job = schedule.scheduleJob('*/1 * * * * *', async () => {

                // UtilGeneral.messageOnCron(true, "CheckCacheCronService");
                try {
                    let ncs = NodeCacheService.instance;
                    let keys = ncs.getNodeCache().keys();
                    console.log("CLAVES CACHÉ CRON", keys)
                    for (let key of keys) {
                        let value = ncs.getNodeCache().get(key);
                        // console.log(value)
                        // if (value === undefined) {
                        //     console.log(`La clave "${key}" ha expirado.`);
                        // } else {
                        //     console.log(`La clave "${key}" sigue vigente.`);
                        // }
                    }




                } catch (e) {
                    console.error("Error cron ->", e);
                    this.stop();
                    setTimeout(() => this.start(), 1000);
                }
            });
        }

    }

    stop() {
        if (this.job != undefined) {
            this.job.cancel()
            this.job = undefined;
        }
    }

    // async sendNow() {
    //     let obj: any = {}
    //     try {
    //         const notificationList = await this.notificationService.get();
    //         notificationList.forEach(async (item, index) => {
    //             const token = item.empdev_devicetoken;
    //             const title = item.n_title;
    //             const body = item.n_message;
    //             const idNotification = `${item.n_id}`;
    //             const idProposal = `${item.n_idproposal}`;
    //             await this.fbPushNotification.controlSendMessage(
    //                 JSON.stringify(item),
    //                 {
    //                     token,
    //                     notification: { title, body }
    //                 });


    //             const update = await this.notificationService.update(item.n_id);
    //             obj.total = notificationList.length
    //             return obj;
    //             // if (index == notificationList.length - 1) {
    //             //     obj.lastItem = item;
    //             //     obj.total = notificationList.length
    //             //     return obj;
    //             // }
    //         });
    //         if (notificationList.length == 0) return obj.text = "No hay nada que enviar";
    //     } catch (e) {
    //         console.error("Error cron ->", e);
    //         return obj.error = e;

    //     }
    // }



}