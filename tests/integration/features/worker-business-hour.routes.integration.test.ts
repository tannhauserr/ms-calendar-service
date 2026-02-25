import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const verifyMock = jest.fn<() => Promise<{ role: string; idUser: string }>>();
const addWorkerBusinessHourMock = jest.fn<() => Promise<any>>();
const getWorkerBusinessHourByWorkerAndWorkspaceMock = jest.fn<() => Promise<any>>();
const updateWorkerBusinessHourMock = jest.fn<() => Promise<any>>();
const deleteWorkerBusinessHourMock = jest.fn<() => Promise<any>>();
const getWorkerHoursFromRedisMock = jest.fn<() => Promise<any>>();
const deleteWorkerHoursCacheMock = jest.fn<() => Promise<void>>();

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
    },
}));

jest.mock("../../../src/middlewares/business-hour/business-hour.middleware", () => ({
    BusinessHourMiddleware: {
        convertToISOTime_FirstPart: (_req: any, _res: any, next: any) => next(),
        handleDeleteClosedRecords_SecondPart: (_req: any, _res: any, next: any) => next(),
        preventOverlapping_ThirdPart: (_req: any, _res: any, next: any) => next(),
    },
}));

jest.mock("../../../src/features/worker-business-hour/services/worker-business-hour.service", () => ({
    WorkerBusinessHourService: class {
        addWorkerBusinessHour = addWorkerBusinessHourMock;
        getWorkerBusinessHourByWorkerAndWorkspace = getWorkerBusinessHourByWorkerAndWorkspaceMock;
        updateWorkerBusinessHour = updateWorkerBusinessHourMock;
        deleteWorkerBusinessHour = deleteWorkerBusinessHourMock;
        getWorkerHoursFromRedis = getWorkerHoursFromRedisMock;
    },
}));

jest.mock("../../../src/services/@redis/cache/strategies/workerHours/workerHours.strategy", () => ({
    WorkerHoursStrategy: class {
        deleteWorkerHours = deleteWorkerHoursCacheMock;
    },
}));

import router from "../../../src/features/worker-business-hour/routes";

describe("WorkerBusinessHour routes integration", () => {
    const app = express();
    app.use(express.json());
    app.use("/api", router);

    beforeEach(() => {
        jest.clearAllMocks();
        verifyMock.mockResolvedValue({ role: "ROLE_ADMIN", idUser: "u-1" });
        addWorkerBusinessHourMock.mockResolvedValue({ id: "wbh-1", idWorkspaceFk: "ws-1", idUserFk: "u-1" });
        getWorkerBusinessHourByWorkerAndWorkspaceMock.mockResolvedValue([{ id: "wbh-1" }]);
        updateWorkerBusinessHourMock.mockResolvedValue({ id: "wbh-1", idWorkspaceFk: "ws-1", idUserFk: "u-1" });
        deleteWorkerBusinessHourMock.mockResolvedValue({ count: 1 });
        getWorkerHoursFromRedisMock.mockResolvedValue({ "u-1": { MONDAY: [["09:00", "17:00"]] } });
        deleteWorkerHoursCacheMock.mockResolvedValue(undefined);
    });

    it("POST /worker-business-hours/add creates a record", async () => {
        await request(app)
            .post("/api/worker-business-hours/add")
            .send({
                idUserFk: "u-1",
                idCompanyFk: "co-1",
                idWorkspaceFk: "ws-1",
                weekDayType: "MONDAY",
                startTime: "09:00",
                endTime: "17:00",
            })
            .expect(200);

        expect(addWorkerBusinessHourMock).toHaveBeenCalledTimes(1);
    });

    it("GET /worker-business-hours/by-worker/:idWorker/workspace/:idWorkspace reads by worker", async () => {
        await request(app)
            .get("/api/worker-business-hours/by-worker/u-1/workspace/ws-1")
            .expect(200);

        expect(getWorkerBusinessHourByWorkerAndWorkspaceMock).toHaveBeenCalledWith("u-1", "ws-1");
    });

    it("PUT /worker-business-hours/:id updates a record", async () => {
        await request(app)
            .put("/api/worker-business-hours/wbh-1")
            .send({ idUserFk: "u-1", idWorkspaceFk: "ws-1" })
            .expect(200);

        expect(updateWorkerBusinessHourMock).toHaveBeenCalledWith(expect.objectContaining({ id: "wbh-1" }));
    });

    it("DELETE /worker-business-hours deletes records", async () => {
        await request(app)
            .delete("/api/worker-business-hours")
            .send({ idList: ["wbh-1"] })
            .expect(200);

        expect(deleteWorkerBusinessHourMock).toHaveBeenCalledWith(["wbh-1"]);
    });

    it("old update path returns 404", async () => {
        await request(app).post("/api/worker-business-hours/update-wbh-1").send({}).expect(404);
    });

    it("POST /worker-business-hours/r-worker-business-hours/search reads redis data", async () => {
        await request(app)
            .post("/api/worker-business-hours/r-worker-business-hours/search")
            .send({ idUserList: ["u-1"], idWorkspace: "ws-1" })
            .expect(200);

        expect(getWorkerHoursFromRedisMock).toHaveBeenCalledWith(["u-1"], "ws-1");
    });
});
