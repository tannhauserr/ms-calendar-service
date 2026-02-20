import { Router } from 'express';
import jwt from "jsonwebtoken";
import businessHourRouter from '../features/business-hour';
import temporaryBusinessHourRouter from '../features/temporary-business-hour';
import workerAbsenceRouter from '../features/worker-absence';
import workerBusinessHourRouter from '../features/worker-business-hour';
import eventPlatformRouter from '../features/event-platform';
import eventClientRouter from '../features/event-client';
import deadLetterManagementRouter from '../features/dead-letter-management';
import publicEventRouter from '../features/public-event';
import microservicesRouter from './@ms/microservices.routes';

const router = Router();

// Health 
router.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// Demo helper endpoint for Swagger/UI tests.
router.get("/api/demo/token", (req, res) => {
    if (process.env.NODE_ENV !== "development") {
        return res.status(404).json({
            ok: false,
            message: "Not available outside development environment",
        });
    }

    const privateKey = process.env.JWT_PRIVATE_KEY;
    if (!privateKey) {
        return res.status(500).json({
            ok: false,
            message: "JWT_PRIVATE_KEY is missing",
        });
    }

    const expiresIn =
        typeof req.query?.expiresIn === "string" && req.query.expiresIn.trim().length > 0
            ? req.query.expiresIn.trim()
            : "2h";

    const claims = {
        idUser: process.env.DEMO_ID_USER ?? "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        idCompanySelected:
            process.env.DEMO_ID_COMPANY_SELECTED ?? "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        role: process.env.DEMO_ROLE ?? "ROLE_OWNER",
    };

    try {
        const token = jwt.sign(claims, privateKey, {
            expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
        });

        return res.status(200).json({
            ok: true,
            token,
            claims,
            authorizationHeader: `Bearer ${token}`,
        });
    } catch (error: any) {
        return res.status(400).json({
            ok: false,
            message: error?.message ?? "Unable to generate demo token",
        });
    }
});

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
router.use("/api", deadLetterManagementRouter);

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
