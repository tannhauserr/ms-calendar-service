import { Response } from "../../../models/messages/response";
import { buildControllerErrorResponse } from "../../../models/error-codes";
import { Pagination } from "../../../models/pagination";
import { WorkerBusinessHourService } from "../services/worker-business-hour.service";
import { WorkerHoursStrategy } from "../../../services/@redis/cache/strategies/workerHours/workerHours.strategy";


import { JWTService } from "../../../services/jwt/jwt.service";
import {
    AddWorkerBusinessHourDto,
    DeleteWorkerBusinessHourDto,
    GetWorkerBusinessHoursDto,
    UpdateWorkerBusinessHourDto,
    WorkerBusinessHourByWorkerAndWorkspaceParamsDto,
    WorkerBusinessHourIdParamsDto,
    WorkerBusinessHourWeekDayParamsDto,
    WorkerHoursRedisDto,
} from "../dto";




export class WorkerBusinessHourController {
    public workBusinessHourService: WorkerBusinessHourService;
    private jwtService: JWTService;

    /** Initializes controller dependencies. */
    constructor() {
        this.jwtService = JWTService.instance;
        this.workBusinessHourService = new WorkerBusinessHourService();
    }

    /** Creates a worker business-hour record. */
    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body as AddWorkerBusinessHourDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.addWorkerBusinessHour(body as any);

            const workerHoursStrategy = new WorkerHoursStrategy();
            if (body?.idWorkspaceFk && body?.idUserFk) {
                await workerHoursStrategy.deleteWorkerHours(result.idWorkspaceFk, result.idUserFk);
            }

            res.status(200).json(Response.build("Registro creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body as GetWorkerBusinessHoursDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getWorkerBusinessHours();
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    // public getById = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id } = req.params as WorkerBusinessHourIdParamsDto;
    //         const token = req.token;
    //         await this.jwtService.verify(token);
    //
    //         const result = await this.workBusinessHourService.getWorkerBusinessHourById(id);
    //         res.status(200).json(Response.build("Registro encontrado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
    //     }
    // }
    //
    // public getByWeekDay = async (req: any, res: any, next: any) => {
    //     try {
    //         const { weekDayType } = req.params as WorkerBusinessHourWeekDayParamsDto;
    //         const token = req.token;
    //         await this.jwtService.verify(token);
    //
    //         const result = await this.workBusinessHourService.getWorkerBusinessHourByWeekDay(weekDayType);
    //         res.status(200).json(Response.build("Registro encontrado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
    //     }
    // }
    //
    public getByWorkerAndWorkspace = async (req: any, res: any, next: any) => {
        try {
            const { idWorker, idWorkspace } = req.params as WorkerBusinessHourByWorkerAndWorkspaceParamsDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getWorkerBusinessHourByWorkerAndWorkspace(idWorker, idWorkspace);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    /** Updates a worker business-hour record. */
    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body as UpdateWorkerBusinessHourDto & { id?: string };
            const token = req.token;
            await this.jwtService.verify(token);
            if (!body?.id && req.params?.id) {
                body.id = req.params.id;
            }

            const result = await this.workBusinessHourService.updateWorkerBusinessHour(body as any);
            const workerHoursStrategy = new WorkerHoursStrategy();
            if (body?.idWorkspaceFk && body?.idUserFk) {
                await workerHoursStrategy.deleteWorkerHours(result.idWorkspaceFk, result.idUserFk);
            }
            
            res.status(200).json(Response.build("Registro actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    /** Deletes one or many worker business-hour records. */
    public delete = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body as DeleteWorkerBusinessHourDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const normalizedIdList = Array.isArray(idList) ? idList : [idList];
            const result = await this.workBusinessHourService.deleteWorkerBusinessHour(normalizedIdList);
            res.status(200).json(Response.build("Registro eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    getWorkerHoursFromRedis = async (req: any, res: any, next: any) => {
        try {
            const { idUserList, idWorkspace } = req.body as WorkerHoursRedisDto;

            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getWorkerHoursFromRedis(idUserList, idWorkspace);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }
}
