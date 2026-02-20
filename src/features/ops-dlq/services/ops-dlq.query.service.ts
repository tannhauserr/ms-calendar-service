import CustomError from "../../../models/custom-error/CustomError";
import {
    DeadLetterMessageStatus,
    DeadLetterMessageService,
} from "../../../services/@rabbitmq/pubsub/dead-letter/dead-letter-message.service";

export class OpsDlqQueryService {
    private readonly deadLetterMessageService = DeadLetterMessageService.instance;

    public async getDeadLetterMessages(params: {
        page?: number;
        itemsPerPage?: number;
        status?: DeadLetterMessageStatus;
        consumerName?: string;
    }) {
        try {
            return this.deadLetterMessageService.listMessages(params);
        } catch (error: any) {
            throw new CustomError("OpsDlqQueryService.getDeadLetterMessages", error);
        }
    }
}
