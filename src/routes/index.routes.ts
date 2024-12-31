import { Router } from 'express';

const router = Router();

// Webhook routes
router.use("/api", require('./webhook/channel-calendar-google.routes'));


// Para acceder a archivos estáticos
router.use("/", require('./cache-control/cache-control.routes'));

// upload file
router.use("/api", require('./upload-file/upload-file.routes'));

// Calendar routes
router.use("/api", require('./calendar.routes'));

// UserColor routes
router.use("/api", require('./user-color.routes'));

// Event routes
router.use("/api", require('./event.routes'));

// Category routes
router.use("/api", require('./category.routes'));

// CategoryEstablishment routes
router.use("/api", require('./category-establishment.routes'));

// Service routes
router.use("/api", require('./service.routes'));

// UserService routes
router.use("/api", require('./user-service.routes'));

// UserCalendar routes
router.use("/api", require('./user-calendar.routes'));

// businessHour routes
router.use("/api", require('./business-hour.routes'));

// WorkerBusinessHour routes
router.use("/api", require('./worker-business-hour.routes'));

// TemporaryBusinessHour routes
router.use("/api", require('./temporary-business-hour.routes'));

// WorkerAbsence routes
router.use("/api", require('./worker-absence.routes'));

export default router;
