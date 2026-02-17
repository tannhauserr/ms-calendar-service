import { Router } from 'express';
import businessHourRouter from '../features/businessHour';
import temporaryBusinessHourRouter from '../features/temporary-business-hour';
import workerAbsenceRouter from '../features/worker-absence';
import workerBusinessHourRouter from '../features/worker-business-hour';
import eventPlatformRouter from '../features/event-platform';
import eventClientRouter from '../features/event-client';
import publicEventRouter from '../features/public-event';
import microservicesRouter from './@ms/microservices.routes';

const router = Router();

// Health 
router.get("/health", (_req, res) => res.status(200).json({ ok: true }));
// Comunicación entre microservicios. Se usa en todos los MS
router.use("/api/ms/internal", microservicesRouter);


// Para acceder a archivos estáticos
router.use("/", require('./cache-control/cache-control.routes'));

// upload file
router.use("/api", require('./upload-file/upload-file.routes'));

// Calendar routes
// router.use("/api", require('./calendar.routes'));



// Event routes
router.use("/api", eventPlatformRouter);
router.use("/api", eventClientRouter);

// businessHour routes
router.use("/api", businessHourRouter);

// WorkerBusinessHour routes
router.use("/api", workerBusinessHourRouter);

// TemporaryBusinessHour routes
router.use("/api", temporaryBusinessHourRouter);

// WorkerAbsence routes
router.use("/api", workerAbsenceRouter);

// WaitList routes
router.use("/api", require('./wait-list.routes'));






router.use("/api/public", publicEventRouter);

export default router;
