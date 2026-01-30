import schedule from "node-schedule";
import { CONSOLE_COLOR } from "../../constant/console-color";
import { WaitListService } from "../@database/all-business-services/wait-list/wait-list.service";

const DEFAULT_SCHEDULE = process.env.WAITLIST_CRON_SCHEDULE || "*/30 * * * * *";
const DEFAULT_BATCH_SIZE = Number(process.env.WAITLIST_CRON_BATCH_SIZE || 20);

export class WaitListCronService {
    private static _instance: WaitListCronService;
    public job: schedule.Job | any;
    private waitListService: WaitListService;

    private constructor() {
        this.waitListService = new WaitListService();
    }

    public static get instance() {
        return this._instance || (this._instance = new this());
    }

    start() {
        if (!this.job) {
            this.job = schedule.scheduleJob(DEFAULT_SCHEDULE, async () => {
                try {
                    await this.processPendingWaitList();
                } catch (e) {
                    console.error(
                        `${CONSOLE_COLOR.BgRed}[WaitListCronService]${CONSOLE_COLOR.Reset}`,
                        e
                    );
                    this.stop();
                    setTimeout(() => this.start(), 1000);
                }
            });
        }
    }

    stop() {
        if (this.job != undefined) {
            this.job.cancel();
            this.job = undefined;
        }
    }

    private async processPendingWaitList(): Promise<void> {
        const pending = await this.waitListService.getPendingWaitList(DEFAULT_BATCH_SIZE);
        if (!pending.length) return;

        for (const item of pending) {
            const hasAvailability = await this.waitListService.hasAvailability(item);
            if (!hasAvailability) continue;

            const dispatched = await this.dispatchWaitListReminder(item);
            if (dispatched) {
                await this.waitListService.markMessageSent(item.id);
            }
        }
    }

    private async dispatchWaitListReminder(item: { id: string; idWorkspaceFk: string }): Promise<boolean> {
        console.log(
            `${CONSOLE_COLOR.FgGreen}[WaitListCron]${CONSOLE_COLOR.Reset} Hueco disponible para waitList ${item.id} (workspace ${item.idWorkspaceFk})`
        );
        return true;
    }
}
