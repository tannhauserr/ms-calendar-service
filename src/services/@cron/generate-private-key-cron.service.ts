import schedule from "node-schedule";
import { UtilGeneral } from "../../utils/util-general";
import { NodeCacheService } from "../@cache/node-cache.service";
import { generatePrivateKey } from "../../utils/jwt/generatePrivateKey";
import { JWTPrivateKeyService } from "../@database";
import CustomError from "../../models/custom-error/CustomError";
import { CONSOLE_COLOR } from "../../constant/console-color";
import prisma from "../../lib/prisma";
import moment from "moment";
import { JWTService } from "../jwt/jwt.service";


export class GeneratePrivateKeyCronService {

    private static _instance: GeneratePrivateKeyCronService;
    public job: schedule.Job | any;

    constructor() {

    }

    public static get instance() {
        return this._instance || (this._instance = new this());
    }

    start() {
        if (!this.job) {
            this.job = schedule.scheduleJob('*/30 * * * * *', async () => {
                // this.job = schedule.scheduleJob('*/1 * * * * *', async () => {
                // UtilGeneral.messageOnCron(true, "GeneratePrivateKeyCronService");
                try {
                    const key = generatePrivateKey();
                    const jwtpk = new JWTPrivateKeyService();
                    // TODO: Comentado para que no cree nada mientras tanto
                    // TODO: Comentado para que no cree nada mientras tanto
                    // TODO: Comentado para que no cree nada mientras tanto
                    // TODO: Comentado para que no cree nada mientras tanto
                    // TODO: Comentado para que no cree nada mientras tanto
                    // TODO: Comentado para que no cree nada mientras tanto

                    // const { created, last } = await jwtpk.handleAddPrivateKey(key);

                    // if (last) {
                    //     // Creamos resguardo para que puedan funcionar los tokens antiguos
                    //     let ncs = NodeCacheService.instance;
                    //     let date = moment().format("YYYY-MM-DD");
                    //     // Un tiempo de 30 minutos
                    //     const TTL = 1800;
                    //     ncs.getNodeCache().set(`rbc.old-pk_${date}`, last.key, TTL);
                    // }

                    // if (created) {
                    //     JWTService.instance.setPrivateKey(key);
                    // }

                } catch (e: any) {
                    if (e instanceof CustomError || e?.name == "CustomError") {
                        console.log(`${CONSOLE_COLOR.FgRed}**********************************************${CONSOLE_COLOR.Reset}`)
                        console.log(`${CONSOLE_COLOR.FgRed}************* START CUSTOM ERROR *************${CONSOLE_COLOR.Reset}`)
                        console.log(`${CONSOLE_COLOR.FgRed}**********************************************${CONSOLE_COLOR.Reset}`)
                        console.error(e);
                        console.log(`${CONSOLE_COLOR.FgRed}**********************************************${CONSOLE_COLOR.Reset}`)
                    } else {
                        console.log(`${CONSOLE_COLOR.FgRed}**********************************************${CONSOLE_COLOR.Reset}`)
                        console.log(`${CONSOLE_COLOR.FgRed}*********** ERROR CRON PRIVATE KEY ***********${CONSOLE_COLOR.Reset}`)
                        console.log(`${CONSOLE_COLOR.FgRed}**********************************************${CONSOLE_COLOR.Reset}`)
                        console.error("Error cron ->", e);
                        this.stop();
                        setTimeout(() => this.start(), 1000);
                        console.log(`${CONSOLE_COLOR.FgRed}**********************************************${CONSOLE_COLOR.Reset}`)

                    }

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