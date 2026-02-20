import express from "express";
import { RequestIdempotencyMiddleware } from "../../middlewares/request-idempotency.middleware";
import { validateParams, validateQuery } from "../../middlewares/validate-zod.middleware";
import { JWTService } from "../../services/jwt/jwt.service";
import { OpsDlqController } from "./controllers/ops-dlq.controller";
import { deadLetterMessagesQuerySchema, replayDeadLetterMessageParamsSchema } from "./schemas";

const router = express.Router();
const controller = new OpsDlqController();
const preventDuplicateClicks = RequestIdempotencyMiddleware.preventDuplicateClicks({
    ttlSeconds: 5,
    methods: ["POST", "PUT", "PATCH", "DELETE"],
});

router.get(
    "/ops/dlq/messages",
    JWTService.authCookieOrBearer,
    validateQuery(deadLetterMessagesQuerySchema),
    controller.getDeadLetterMessages
);

router.post(
    "/ops/dlq/messages/:id/replay",
    JWTService.authCookieOrBearer,
    preventDuplicateClicks,
    validateParams(replayDeadLetterMessageParamsSchema),
    controller.replayDeadLetterMessage
);

export default router;
