import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const verifyMock = jest.fn<() => Promise<{ role: string; idUser: string }>>();
const addFromWebMock = jest.fn<() => Promise<any>>();
const updateFromWebMock = jest.fn<() => Promise<any>>();

jest.mock("../../../src/services/jwt/jwt.service", () => ({
    JWTService: class {
        static authCookieOrBearer(req: any, _res: any, next: any) {
            req.token = "test-token";
            next();
        }

        static get instance() {
            return { verify: verifyMock };
        }
    },
}));

jest.mock("../../../src/middlewares/booiking-guard/booking-guard.middleware", () => ({
    BookingGuardsMiddleware: {
        BaseContextSimple: () => (req: any, _res: any, next: any) => {
            req.booking = req.booking ?? { ctx: {} };
            req.booking.ctx.input = req.booking.ctx.input ?? req.body ?? {};
            next();
        },
        BaseValidationAndNormalize: () => (req: any, _res: any, next: any) => {
            req.booking = { ctx: { input: req.body ?? {} } };
            next();
        },
        ResolveWorkspace: () => (req: any, _res: any, next: any) => {
            req.booking = req.booking ?? { ctx: {} };
            req.booking.ctx.workspace = { id: "ws-1", autoConfirmClientBookings: true };
            req.booking.ctx.timeZoneWorkspace = "Europe/Madrid";
            req.booking.ctx.config = { slot: { alignMode: "service" } };
            next();
        },
        ResolveClientWorkspace: () => (req: any, _res: any, next: any) => {
            req.booking = req.booking ?? { ctx: {} };
            req.booking.ctx.customer = {
                idClient: "client-1",
                idClientWorkspace: "client-ws-1",
            };
            next();
        },
        EnforceTimeRules: () => (_req: any, _res: any, next: any) => next(),
        EnforceUserLimits: () => (_req: any, _res: any, next: any) => next(),
    },
}));

jest.mock("../../../src/features/public-event/controllers/public-event.controller", () => ({
    PublicEventFeatureController: class {
        publicGetAvailableDaysSlots = (_req: any, res: any) => res.status(200).json({ ok: true });
        publicGetAvailableTimeSlots = (_req: any, res: any) => res.status(200).json({ ok: true });
    },
}));

jest.mock("../../../src/features/event-client/services/event-client.command.service", () => ({
    EventClientCommandService: class {
        addFromWeb = addFromWebMock;
        updateFromWeb = updateFromWebMock;
        cancelEventFromWeb = jest.fn();
        confirmEventFromWeb = jest.fn();
    },
}));

jest.mock("../../../src/features/event-client/services/event-client.query.service", () => ({
    EventClientQueryService: class {
        getFromWeb = jest.fn();
        getEventByGroupIdAndClientWorkspaceAndWorkspace = jest.fn();
    },
}));

import router from "../../../src/features/event-client/routes";

describe("EventClient routes integration", () => {
    const app = express();
    app.use(express.json());
    app.use("/api", router);

    beforeEach(() => {
        jest.clearAllMocks();
        verifyMock.mockResolvedValue({ role: "ROLE_USER", idUser: "u-1" });

        addFromWebMock.mockResolvedValue({
            status: 201,
            ok: true,
            message: "Evento creado",
            item: { id: "ev-1" },
        });

        updateFromWebMock.mockResolvedValue({
            status: 200,
            ok: true,
            message: "Evento actualizado",
            item: { id: "ev-1" },
            code: "BOOKING_INFO_EVENT_UPDATED",
        });
    });

    it("POST /events/client-add creates appointment", async () => {
        const payload = {
            idCompany: "co-1",
            idWorkspace: "ws-1",
            idBookingPage: "bp-1",
            startLocalISO: "2026-02-18T10:00:00",
            timeZoneClient: "Europe/Madrid",
            attendees: [{ serviceId: "svc-1", durationMin: 60 }],
            customer: {
                name: "Alfredo",
                phone: "111",
                email: "a@a.com",
            },
        };

        const response = await request(app)
            .post("/api/events/client-add")
            .send(payload)
            .expect(201);

        expect(response.body.ok).toBe(true);
        expect(response.body.item).toEqual({ id: "ev-1" });
        expect(addFromWebMock).toHaveBeenCalledTimes(1);
        expect(addFromWebMock).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({ idWorkspace: "ws-1" }),
                customer: expect.objectContaining({ idClientWorkspace: "client-ws-1" }),
            })
        );
    });

    it("POST /events/client-update updates appointment", async () => {
        const payload = {
            idCompany: "co-1",
            idWorkspace: "ws-1",
            idBookingPage: "bp-1",
            idEvent: "ev-1",
            startLocalISO: "2026-02-18T12:00:00",
            timeZoneClient: "Europe/Madrid",
            attendees: [{ serviceId: "svc-1", durationMin: 60 }],
            customer: {
                name: "Alfredo",
                phone: "111",
                email: "a@a.com",
            },
        };

        const response = await request(app)
            .post("/api/events/client-update")
            .send(payload)
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(response.body.code).toBe("BOOKING_INFO_EVENT_UPDATED");
        expect(updateFromWebMock).toHaveBeenCalledTimes(1);
        expect(updateFromWebMock).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({ idEvent: "ev-1" }),
                customer: expect.objectContaining({ idClient: "client-1" }),
            })
        );
    });

    it("POST /events/client-add returns 500 when command fails", async () => {
        addFromWebMock.mockRejectedValueOnce(new Error("Unexpected add error"));

        const response = await request(app)
            .post("/api/events/client-add")
            .send({ idWorkspace: "ws-1" })
            .expect(500);

        expect(response.body.message).toBe("Unexpected add error");
    });
});
