import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const verifyMock = jest.fn<() => Promise<{ role: string; idUser: string }>>();
const addBusinessHourMock = jest.fn<() => Promise<any>>();
const getBusinessHoursMock = jest.fn<() => Promise<any>>();
const getBusinessHourByIdMock = jest.fn<() => Promise<any>>();
const updateBusinessHourMock = jest.fn<() => Promise<any>>();
const deleteBusinessHourMock = jest.fn<() => Promise<any>>();
const getBusinessHoursFromRedisMock = jest.fn<() => Promise<any>>();
const deleteBusinessHoursCacheMock = jest.fn<() => Promise<void>>();

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

jest.mock("../../../src/middlewares/business-hour/business-hour.middleware", () => ({
    BusinessHourMiddleware: {
        convertToISOTime_FirstPart: (_req: any, _res: any, next: any) => next(),
        handleDeleteClosedRecords_SecondPart: (_req: any, _res: any, next: any) => next(),
        preventOverlapping_ThirdPart: (_req: any, _res: any, next: any) => next(),
    },
}));

jest.mock("../../../src/features/business-hour/services/business-hour.service", () => ({
    BusinessHourService: class {
        addBusinessHour = addBusinessHourMock;
        getBusinessHours = getBusinessHoursMock;
        getBusinessHourById = getBusinessHourByIdMock;
        updateBusinessHour = updateBusinessHourMock;
        deleteBusinessHour = deleteBusinessHourMock;
        getBusinessHoursFromRedis = getBusinessHoursFromRedisMock;
    },
}));

jest.mock("../../../src/services/@redis/cache/strategies/businessHours/businessHours.strategy", () => ({
    BusinessHoursStrategy: class {
        deleteBusinessHours = deleteBusinessHoursCacheMock;
    },
}));

import router from "../../../src/features/business-hour/routes";

describe("BusinessHour routes integration", () => {
    const app = express();
    app.use(express.json());
    app.use("/api", router);

    beforeEach(() => {
        jest.clearAllMocks();
        verifyMock.mockResolvedValue({ role: "ROLE_ADMIN", idUser: "u-1" });
        addBusinessHourMock.mockResolvedValue({ id: "bh-1", idWorkspaceFk: "ws-1" });
        getBusinessHoursMock.mockResolvedValue([{ id: "bh-1" }]);
        getBusinessHourByIdMock.mockResolvedValue({ id: "bh-1" });
        updateBusinessHourMock.mockResolvedValue({ id: "bh-1", idWorkspaceFk: "ws-1" });
        deleteBusinessHourMock.mockResolvedValue({ count: 1 });
        getBusinessHoursFromRedisMock.mockResolvedValue({ MONDAY: [["09:00", "17:00"]] });
        deleteBusinessHoursCacheMock.mockResolvedValue(undefined);
    });

    it("POST /business-hours/add creates a record", async () => {
        const response = await request(app)
            .post("/api/business-hours/add")
            .send({
                idWorkspaceFk: "ws-1",
                weekDayType: "MONDAY",
                startTime: "09:00",
                endTime: "17:00",
            })
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(addBusinessHourMock).toHaveBeenCalledTimes(1);
    });

    it("POST /business-hours/search reads records", async () => {
        await request(app)
            .post("/api/business-hours/search")
            .send({ idWorkspace: "ws-1" })
            .expect(200);

        expect(getBusinessHoursMock).toHaveBeenCalledWith("ws-1");
    });

    it("PUT /business-hours/:id updates a record", async () => {
        await request(app)
            .put("/api/business-hours/bh-1")
            .send({ idWorkspaceFk: "ws-1", weekDayType: "MONDAY", startTime: "10:00", endTime: "18:00" })
            .expect(200);

        expect(updateBusinessHourMock).toHaveBeenCalledWith(expect.objectContaining({ id: "bh-1" }));
    });

    it("DELETE /business-hours deletes records", async () => {
        await request(app)
            .delete("/api/business-hours")
            .send({ idList: ["bh-1"] })
            .expect(200);

        expect(deleteBusinessHourMock).toHaveBeenCalledWith(["bh-1"]);
    });

    it("GET /business-hours returns 404", async () => {
        await request(app).get("/api/business-hours").expect(404);
    });
});
