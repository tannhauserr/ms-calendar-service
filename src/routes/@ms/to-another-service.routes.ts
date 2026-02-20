import express from 'express';
import { EventController } from '../../controllers/event/event.controller';
import { BusinessHourController } from '../../controllers/all-business-controller/business-hour/business-hour.controller';
import { MicroserviceAuthMiddleware } from '../../middlewares/microservice-auth.middleware';




const router = express.Router();
const eventController = new EventController();
const businessHoursController = new BusinessHourController();

router.use(MicroserviceAuthMiddleware.verify);

// Obtener event
router.post('/event/data', [
], eventController.getEventDataById);

router.post('/event/group/data', [
], eventController.getGroupDataById);  

// obtener business hour a partir del id Workspace
router.post('/business-hours/data', [
], businessHoursController.getBusinessHoursFromRedis_internalMS);

// generar horario base para un workspace
router.post('/business-hours/generate-workspace', [
], businessHoursController.internalGenerateWorkspaceBusinessHours);

// BookingPages (batch)
// router.post('/booking-pages/_batch', bookingPageController.internalBatchByIds);


module.exports = router;
