import { Response } from "../../../models/messages/response";
import { buildControllerErrorResponse } from "../../../models/error-codes";
import { Pagination } from "../../../models/pagination";
import { TemporaryBusinessHourService } from "../../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { TemporaryHoursStrategy } from "../../../services/@redis/cache/strategies/temporaryHours/temporaryHours.strategy";
import { JWTService } from "../../../services/jwt/jwt.service";




export class TemporaryBusinessHourController {
    public workBusinessHourService: TemporaryBusinessHourService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.workBusinessHourService = new TemporaryBusinessHourService();
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const { idEventFk, ...payload } = body;
            const result = await this.workBusinessHourService.addTemporaryBusinessHour(payload);

            const temporaryHoursStrategy = new TemporaryHoursStrategy();
            if (result?.temporary?.idWorkspaceFk && result?.temporary?.idUserFk) {
                await temporaryHoursStrategy.deleteTemporaryHours(result.temporary.idWorkspaceFk, result.temporary.idUserFk);
            }


            res.status(200).json(Response.build("Registro creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHours2(pagination);
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHourById(id);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public getByDate = async (req: any, res: any, next: any) => {
        try {
            const { date } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHourByDate(date);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public getByWorkerAndDate = async (req: any, res: any, next: any) => {
        try {
            const { idWorker, date } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHourByWorkerAndDate(idWorker, date);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }


    public getDistinctDatesWithExceptionsByWorker = async (req: any, res: any, next: any) => {
        try {
            const { idWorker, minDate, maxDate } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getDistinctDatesWithExceptionsByWorker(idWorker, minDate, maxDate);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }



    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            if (!body?.id && req.params?.id) {
                body.id = req.params.id;
            }

            const result = await this.workBusinessHourService.updateTemporaryBusinessHour(body);
            const temporaryHoursStrategy = new TemporaryHoursStrategy();
            if (result?.temporary?.idWorkspaceFk && result?.temporary?.idUserFk) {
                await temporaryHoursStrategy.deleteTemporaryHours(result.temporary.idWorkspaceFk, result.temporary.idUserFk);
            }


            res.status(200).json(Response.build("Registro actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }

    public delete = async (req: any, res: any, next: any) => {
        try {
            const { idList, idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.deleteTemporaryBusinessHourFromRedis(idList, idWorkspace);
            res.status(200).json(Response.build("Registro eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }


    public autocomplete = async (req: any, res: any, next: any) => {
        try {
            const { idUser } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            let result = undefined;
            let pagination: Pagination = {
                page: 1,
                itemsPerPage: 10000,
            }
            if (idUser) {
                pagination.filters = {
                    idUserFk: idUser
                }
                result = await this.workBusinessHourService.getTemporaryBusinessHours(pagination, false);
            } else {
                result = await this.workBusinessHourService.getTemporaryBusinessHours(pagination, false);
            }

            // const result = await this.workBusinessHourWorkBusinessHour.autocompleteTemporaryWorkBusinessHours(search, pagination);
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result && result?.rows ? result.rows : [] });
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }


    getTemporaryHoursFromRedis = async (req: any, res: any, next: any) => {
        try {
            const { idUserList, idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryHoursFromRedis(idUserList, idWorkspace);

            console.log("mira el result de redis", result);

            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    }


}
