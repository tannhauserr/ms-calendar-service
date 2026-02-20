import CustomError from "../../../models/custom-error/CustomError";
import { DeadLetterMessageService } from "../../../services/@rabbitmq/pubsub/dead-letter/dead-letter-message.service";

export class DeadLetterManagementCommandService {
    private readonly deadLetterMessageService = DeadLetterMessageService.instance;

    public async replayDeadLetterMessage(id: string, replayedByRole: string) {
        try {
            if (!id) {
                throw new Error("El id del mensaje DLQ es requerido");
            }

            return this.deadLetterMessageService.replayMessage(id, replayedByRole);
        } catch (error: any) {
            throw new CustomError("DeadLetterManagementCommandService.replayDeadLetterMessage", error);
        }
    }
}
