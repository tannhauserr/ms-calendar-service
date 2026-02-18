import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const verifyMock = jest.fn<() => Promise<{ role: string; idUser: string }>>();
const addTemporaryBusinessHourMock = jest.fn<() => Promise<any>>();
const getTemporaryBusinessHours2Mock = jest.fn<() => Promise<any>>();
const getTemporaryBusinessHourByDateMock = jest.fn<() => Promise<any>>();
const updateTemporaryBusinessHourMock = jest.fn<() => Promise<any>>();
const deleteTemporaryBusinessHourFromRedisMock = jest.fn<() => Promise<any>>();
const deleteTemporaryHoursCacheMock = jest.fn<() => Promise<void>>();

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

jest.mock("../../../src/features/temporary-business-hour/services/temporary-business-hour.service", () => ({
    TemporaryBusinessHourService: class {
        addTemporaryBusinessHour = addTemporaryBusinessHourMock;
        getTemporaryBusinessHours2 = getTemporaryBusinessHours2Mock;
        getTemporaryBusinessHourByDate = getTemporaryBusinessHourByDateMock;
        updateTemporaryBusinessHour = updateTemporaryBusinessHourMock;
        deleteTemporaryBusinessHourFromRedis = deleteTemporaryBusinessHourFromRedisMock;
    },
}));

jest.mock("../../../src/services/@redis/cache/strategies/temporaryHours/temporaryHours.strategy", () => ({
    TemporaryHoursStrategy: class {
        deleteTemporaryHours = deleteTemporaryHoursCacheMock;
    },
}));

import router from "../../../src/features/temporary-business-hour/routes";

describe("TemporaryBusinessHour routes integration", () => {
    const app = express();
    app.use(express.json());
    app.use("/api", router);

    beforeEach(() => {
        jest.clearAllMocks();
        verifyMock.mockResolvedValue({ role: "ROLE_ADMIN", idUser: "u-1" });
        addTemporaryBusinessHourMock.mockResolvedValue({
            temporary: { id: "tmp-1", idWorkspaceFk: "ws-1", idUserFk: "u-1" },
        });
        getTemporaryBusinessHours2Mock.mockResolvedValue([{ id: "tmp-1" }]);
        getTemporaryBusinessHourByDateMock.mockResolvedValue([{ id: "tmp-1" }]);
        updateTemporaryBusinessHourMock.mockResolvedValue({
            temporary: { id: "tmp-1", idWorkspaceFk: "ws-1", idUserFk: "u-1" },
        });
        deleteTemporaryBusinessHourFromRedisMock.mockResolvedValue({ count: 1 });
        deleteTemporaryHoursCacheMock.mockResolvedValue(undefined);
    });

    it("POST /temporary-business-hours/add creates a record", async () => {
        await request(app)
            .post("/api/temporary-business-hours/add")
            .send({
                idCompanyFk: "co-1",
                idWorkspaceFk: "ws-1",
                idUserFk: "u-1",
                date: "2026-02-17",
                startTime: "09:00",
                endTime: "12:00",
            })
            .expect(200);

        expect(addTemporaryBusinessHourMock).toHaveBeenCalledTimes(1);
    });

    it("POST /temporary-business-hours/search reads records", async () => {
        await request(app).post("/api/temporary-business-hours/search").send({}).expect(200);
        expect(getTemporaryBusinessHours2Mock).toHaveBeenCalledTimes(1);
    });

    it("POST /temporary-business-hours/by-date reads by date", async () => {
        await request(app)
            .post("/api/temporary-business-hours/by-date")
            .send({ date: "2026-02-17" })
            .expect(200);

        expect(getTemporaryBusinessHourByDateMock).toHaveBeenCalledWith("2026-02-17");
    });

    it("PUT /temporary-business-hours/:id updates a record", async () => {
        await request(app)
            .put("/api/temporary-business-hours/tmp-1")
            .send({ title: "Updated title" })
            .expect(200);

        expect(updateTemporaryBusinessHourMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: "tmp-1" })
        );
    });

    it("DELETE /temporary-business-hours deletes records", async () => {
        await request(app)
            .delete("/api/temporary-business-hours")
            .send({ idList: ["tmp-1"], idWorkspace: "ws-1" })
            .expect(200);

        expect(deleteTemporaryBusinessHourFromRedisMock).toHaveBeenCalledWith(["tmp-1"], "ws-1");
    });

    it("old update path returns 404", async () => {
        await request(app).post("/api/temporary-business-hours/update-tmp-1").send({}).expect(404);
    });
});
