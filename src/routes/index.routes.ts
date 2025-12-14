import { Router } from 'express';

const router = Router();

// Webhook routes
// Comunicación entre microservicios. Se usa en todos los MS
router.use("/api/ms/internal", require('./@ms/to-another-service.routes'));


// Para acceder a archivos estáticos
router.use("/", require('./cache-control/cache-control.routes'));

// upload file
router.use("/api", require('./upload-file/upload-file.routes'));

// Calendar routes
// router.use("/api", require('./calendar.routes'));



// Event routes
router.use("/api", require('./event/event.routes'));
router.use("/api", require('./event/client-event.routes'));

// Category routes
// router.use("/api", require('./category/category.routes'));

// CategoryWorkspace routes
// router.use("/api", require('./category-workspace.routes'));
// router.use("/api", require('./recurrence-rule.routes'));

// CategoryService routes
// router.use("/api", require('./category-service.routes'));

// // Service routes
// router.use("/api", require('./service.routes'));

// // UserService routes
// router.use("/api", require('./user-service.routes'));

// UserCalendar routes
// router.use("/api", require('./user-calendar.routes'));

// businessHour routes
router.use("/api", require('./business-hour.routes'));

// WorkerBusinessHour routes
router.use("/api", require('./worker-business-hour.routes'));

// TemporaryBusinessHour routes
router.use("/api", require('./temporary-business-hour.routes'));

// WorkerAbsence routes
router.use("/api", require('./worker-absence.routes'));


// Health check
router.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// public

// router.use("/api/public", require('./category/public-category.routes'));

router.use("/api/public", require('./event/public-event.routes'));

export default router;
