import express from 'express';
import { MicroserviceAuthMiddleware } from '../../middlewares/microservice-auth/microservice-auth.middleware';
import { EventPlatformController } from '../../features/event-platform/controllers/event-platform.controller';
import { BusinessHourInternalController } from '../../features/businessHour/controllers/business-hour.internal.controller';
import { validateBody } from '../../middlewares/validate-zod.middleware';
import {
    internalGetEventDataByIdBodySchema,
    internalGetGroupDataByIdBodySchema,
} from '../../features/event-platform/schemas';




const router = express.Router();
const eventController = new EventPlatformController();
const businessHoursController = new BusinessHourInternalController();

// Obtener event
router.post('/event/data', [
    // MicroserviceAuthMiddleware.verify
    validateBody(internalGetEventDataByIdBodySchema),
], eventController.internalGetEventDataById);

router.post('/event/group/data', [
    // MicroserviceAuthMiddleware.verif
    validateBody(internalGetGroupDataByIdBodySchema),
], eventController.internalGetGroupDataById);  

// obtener business hour a partir del id Workspace
router.post('/business-hours/data', [
    // MicroserviceAuthMiddleware.verify
], businessHoursController.getBusinessHoursFromRedis);

// generar horario base para un workspace
router.post('/business-hours/generate-workspace', [
    // MicroserviceAuthMiddleware.verify
], businessHoursController.generateWorkspaceBusinessHours);

// BookingPages (batch)
// router.post('/booking-pages/_batch', [MicroserviceAuthMiddleware.verify], bookingPageController.internalBatchByIds);


export default router;
