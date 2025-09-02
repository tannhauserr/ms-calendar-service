import express from 'express';
import { EventController } from '../../controllers/event/event.controller';
import { JWTService } from '../../services/jwt/jwt.service';
import { EventMiddleware } from '../../middlewares/event/event.middleware';
import { OnlyAdminMiddleware } from '../../middlewares/only-admin.middleware';
import { CheckCompanyMiddleware } from '../../middlewares/check-company/check-company.middleware';
import { PublicEventController } from '../../controllers/event/public-event.controller';


const router = express.Router();
const controller = new PublicEventController();

router.post('/events/available-days',
    controller.publicGetAvailableDaysSlots
);

router.post('/events/available-times', controller.publicGetAvailableTimeSlots);

module.exports = router;
