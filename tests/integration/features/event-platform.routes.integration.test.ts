import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EventStatusType } from "@prisma/client";

const verifyMock = jest.fn<() => Promise<{ role: string; idUser: string }>>();

const getEventsListMock = jest.fn<() => Promise<any>>();
const getEventByIdMock = jest.fn<() => Promise<any>>();

const changeEventStatusMock = jest.fn<() => Promise<any>>();
const updateByIdMock = jest.fn<() => Promise<any>>();
const deleteEventMock = jest.fn<() => Promise<any>>();

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

jest.mock("../../../src/middlewares/only-admin.middleware", () => ({
    OnlyAdminMiddleware: {
        accessOnlyAdminOrManager: (_req: any, _res: any, next: any) => next(),
        accessOnlyAdminOrManagerOrUser: (_req: any, _res: any, next: any) => next(),
        allowRoles: () => (_req: any, _res: any, next: any) => next(),
        accessAuthorized: (_req: any, _res: any, next: any) => next(),
    },
}));

jest.mock("../../../src/middlewares/request-idempotency.middleware", () => ({
    RequestIdempotencyMiddleware: {
        preventDuplicateClicks: () => (_req: any, _res: any, next: any) => next(),
    },
}));

jest.mock("../../../src/features/event-platform/services/event-platform.query.service", () => ({
    EventPlatformQueryService: class {
        getEvents = jest.fn();
        getEventsList = getEventsListMock;
        getEventById = getEventByIdMock;
        getEventExtraData = jest.fn();
        internalGetEventDataById = jest.fn();
        internalGetGroupDataById = jest.fn();
    },
}));

jest.mock("../../../src/features/event-platform/services/event-platform.command.service", () => ({
    EventPlatformCommandService: class {
        upsertEventByPlatform = jest.fn();
        markCommentAsRead = jest.fn();
        deleteEvent = deleteEventMock;
        changeEventStatus = changeEventStatusMock;
        updateById = updateByIdMock;
        changeEventStatusByParticipant = jest.fn();
    },
}));

import router from "../../../src/features/event-platform/routes";

describe("EventPlatform routes integration", () => {
    const app = express();
    app.use(express.json());
    app.use("/api", router);

    beforeEach(() => {
        jest.clearAllMocks();
        verifyMock.mockResolvedValue({ role: "ROLE_ADMIN", idUser: "u-1" });

        getEventsListMock.mockResolvedValue({ rows: [{ id: "ev-1" }], pagination: { totalItems: 1, totalPages: 1 } });
        getEventByIdMock.mockResolvedValue({ id: "ev-1" });

        changeEventStatusMock.mockResolvedValue([{ id: "ev-1", eventStatusType: EventStatusType.ACCEPTED }]);
        updateByIdMock.mockResolvedValue({ ok: true, updatedEvent: { id: "ev-1" } });
        deleteEventMock.mockResolvedValue({ count: 1 });
    });

    it("POST /events-list returns list", async () => {
        const payload = {
            pagination: {
                page: 1,
                itemsPerPage: 10,
                orderBy: null,
                filters: {
                    idWorkspaceFk: {
                        relation: "groupEvents",
                        value: "ws-1",
                    },
                },
            },
            idCompany: "co-1",
            idWorkspace: "ws-1",
        };

        const response = await request(app)
            .post("/api/events-list")
            .send(payload)
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(getEventsListMock).toHaveBeenCalledWith(payload.pagination, "co-1", "ws-1");
    });

    it("POST /events-list clamps pagination bounds instead of failing validation", async () => {
        const payload = {
            pagination: {
                page: 0,
                itemsPerPage: 100000,
                orderBy: null,
                filters: {
                    idWorkspaceFk: {
                        relation: "groupEvents",
                        value: "ws-1",
                    },
                },
            },
            idCompany: "co-1",
            idWorkspace: "ws-1",
        };

        const response = await request(app)
            .post("/api/events-list")
            .send(payload)
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(getEventsListMock).toHaveBeenCalledWith(
            expect.objectContaining({
                page: 1,
                itemsPerPage: 1000,
            }),
            "co-1",
            "ws-1"
        );
    });

    it("GET /events-:id returns event by id", async () => {
        const response = await request(app)
            .get("/api/events-ev-1")
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(getEventByIdMock).toHaveBeenCalledWith("ev-1");
    });

    it("GET /events-:id returns 404 when event does not exist", async () => {
        getEventByIdMock.mockResolvedValueOnce(null);

        await request(app)
            .get("/api/events-missing")
            .expect(404);

        expect(getEventByIdMock).toHaveBeenCalledWith("missing");
    });

    it("POST /events/change-status updates status", async () => {
        await request(app)
            .post("/api/events/change-status")
            .send({
                id: "ev-1",
                status: EventStatusType.ACCEPTED,
                allGroup: false,
            })
            .expect(200);

        expect(changeEventStatusMock).toHaveBeenCalledWith("ev-1", EventStatusType.ACCEPTED, false);
    });

    it("POST /events/change-status returns 400 when transition is not allowed", async () => {
        changeEventStatusMock.mockResolvedValueOnce(null);

        await request(app)
            .post("/api/events/change-status")
            .send({
                id: "ev-1",
                status: EventStatusType.ACCEPTED,
            })
            .expect(400);
    });

    it("POST /events/update-:id updates event", async () => {
        const body = {
            isMany: false,
            sendNotification: false,
            event: {
                title: "Nuevo título",
            },
        };

        await request(app)
            .post("/api/events/update-ev1")
            .send(body)
            .expect(200);

        expect(updateByIdMock).toHaveBeenCalledWith("ev1", body);
    });

    it("POST /events/delete deletes events", async () => {
        await request(app)
            .post("/api/events/delete")
            .send({ idList: ["ev-1"] })
            .expect(200);

        expect(deleteEventMock).toHaveBeenCalledWith(["ev-1"]);
    });
});
