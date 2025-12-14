import express from 'express';
import { MicroserviceAuthMiddleware } from '../../middlewares/microservice-auth/microservice-auth.middleware';
import { EventController } from '../../controllers/event/event.controller';
import { BusinessHourController } from '../../controllers/all-business-controller/business-hour/business-hour.controller';




const router = express.Router();
const eventController = new EventController();
const businessHoursController = new BusinessHourController();

// Obtener event
router.post('/event/data', [MicroserviceAuthMiddleware.verify], eventController.getEventDataById);
router.post('/event/group/data', [MicroserviceAuthMiddleware.verify], eventController.getGroupDataById);  

// obtener business hour a partir del id Workspace
router.post('/business-hours/data', [MicroserviceAuthMiddleware.verify], businessHoursController.getBusinessHoursFromRedis_internalMS);

// BookingPages (batch)
// router.post('/booking-pages/_batch', [MicroserviceAuthMiddleware.verify], bookingPageController.internalBatchByIds);


module.exports = router;
