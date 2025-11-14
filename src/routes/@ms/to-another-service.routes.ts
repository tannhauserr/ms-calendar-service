import express from 'express';
import { MicroserviceAuthMiddleware } from '../../middlewares/microservice-auth/microservice-auth.middleware';
import { EventController } from '../../controllers/event/event.controller';




const router = express.Router();
const eventController = new EventController();

// Obtener clients (batch)
router.post('/event/data', [MicroserviceAuthMiddleware.verify], eventController.getEventDataById);


// BookingPages (batch)
// router.post('/booking-pages/_batch', [MicroserviceAuthMiddleware.verify], bookingPageController.internalBatchByIds);


module.exports = router;
