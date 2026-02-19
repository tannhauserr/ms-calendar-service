import { Response } from "../../../models/messages/response";
import { buildControllerErrorResponse } from "../../../models/error-codes";
import { Pagination } from "../../../models/pagination";
import { WorkerAbsenceService } from "../../../services/@database/all-business-services/worker-absence/worker-absence.service";
import { JWTService } from "../../../services/jwt/jwt.service";

export class WorkerAbsenceController {
    public workerAbsenceService: WorkerAbsenceService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.workerAbsenceService = new WorkerAbsenceService();
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);
            const result = await this.workerAbsenceService.getWorkerAbsences(pagination);
            res.status(200).json(Response.build("Ausencias encontradas", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const { idEventFk, ...rest } = body;

            const result = await this.workerAbsenceService.addWorkerAbsence(rest);
            res.status(200).json(Response.build("Ausencia registrada", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    // public get = async (req: any, res: any, next: any) => {
    //     try {
    //         const { pagination } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.workerAbsenceService.getWorkerAbsences();
    //         res.status(200).json({ message: "Ausencias encontradas", ok: true, item: result });
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workerAbsenceService.getWorkerAbsenceById(id);
            res.status(200).json(Response.build("Ausencia encontrada", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public getByWorkspace = async (req: any, res: any, next: any) => {

        try {
            const { idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workerAbsenceService.getWorkerAbsencesByWorkspace(idWorkspace);
            res.status(200).json(Response.build("Ausencias encontradas", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public getByUser = async (req: any, res: any, next: any) => {
        try {
            const { idUser } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workerAbsenceService.getWorkerAbsencesByUser(idUser);
            res.status(200).json(Response.build("Ausencias encontradas", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workerAbsenceService.updateWorkerAbsence(body);
            res.status(200).json(Response.build("Ausencia actualizada", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public delete = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workerAbsenceService.deleteWorkerAbsence(idList);
            res.status(200).json(Response.build("Ausencia eliminada", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    // public autocomplete = async (req: any, res: any, next: any) => {
    //     try {
    //         const { idUser } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         let result = undefined;
    //         let pagination: Pagination = {
    //             page: 1,
    //             itemsPerPage: 10000,
    //         }
    //         if (idUser) {
    //             pagination.filters = {
    //                 idUserFk: idUser
    //             }
    //             result = await this.workerAbsenceService.getWorkerAbsencesByUser(idUser);
    //         } else {
    //             result = await this.workerAbsenceService.getWorkerAbsences();
    //         }

    //         res.status(200).json({
    //             message: "Ausencias encontradas",
    //             ok: true,
    //             item: result && result?.rows ? result.rows : [],
    //         });
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }
}
