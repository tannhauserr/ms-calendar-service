// src/types/express-booking.d.ts
import 'express-serve-static-core';
import type { BookingCtx } from '../middlewares/booking-guards.middleware';

declare module 'express-serve-static-core' {
    interface Request {
        booking?: { ctx: BookingCtx };
    }
}

export { };
