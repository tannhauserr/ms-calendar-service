import express from 'express';
import { EventPlatformController } from '../../features/event-platform/controllers/event-platform.controller';
import { BusinessHourInternalController } from '../../features/business-hour/controllers/business-hour.internal.controller';
import { MicroserviceAuthMiddleware } from '../../middlewares/microservice-auth.middleware';
import { validateBody } from '../../middlewares/validate-zod.middleware';
import {
    internalGetEventDataByIdBodySchema,
    internalGetGroupDataByIdBodySchema,
} from '../../features/event-platform/schemas';




const router = express.Router();
const eventController = new EventPlatformController();
const businessHoursController = new BusinessHourInternalController();

router.use(MicroserviceAuthMiddleware.verify);

// Obtener event
router.post('/event/data', [
    validateBody(internalGetEventDataByIdBodySchema),
], eventController.internalGetEventDataById);

router.post('/event/group/data', [
    validateBody(internalGetGroupDataByIdBodySchema),
], eventController.internalGetGroupDataById);  

// obtener business hour a partir del id Workspace
router.post('/business-hours/data', [
], businessHoursController.getBusinessHoursFromRedis);

// generar horario base para un workspace
router.post('/business-hours/generate-workspace', [
], businessHoursController.generateWorkspaceBusinessHours);

// BookingPages (batch)
// router.post('/booking-pages/_batch', bookingPageController.internalBatchByIds);


export default router;
