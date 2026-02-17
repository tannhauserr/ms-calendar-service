import { Response } from "../../../models/messages/response";
import { Pagination } from "../../../models/pagination";
import { TemporaryBusinessHourService } from "../services/temporary-business-hour.service";
import { TemporaryHoursStrategy } from "../../../services/@redis/cache/strategies/temporaryHours/temporaryHours.strategy";
import { JWTService } from "../../../services/jwt/jwt.service";




export class TemporaryBusinessHourController {
    public workBusinessHourService: TemporaryBusinessHourService;
    private jwtService: JWTService;

    /** Initializes controller dependencies. */
    constructor() {
        this.jwtService = JWTService.instance;
        this.workBusinessHourService = new TemporaryBusinessHourService();
    }

    /** Creates a temporary business-hour exception. */
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
            res.status(500).json({ message: err.message });
        }
    }

    /** Returns temporary exceptions using pagination/filter payload. */
    public get = async (req: any, res: any, next: any) => {
        try {
            const bodyPagination = (req.body?.pagination ?? {}) as Partial<Pagination>;
            const pageQuery = typeof req.query?.page === "string" ? Number(req.query.page) : undefined;
            const itemsPerPageQuery =
                typeof req.query?.itemsPerPage === "string" ? Number(req.query.itemsPerPage) : undefined;

            const pagination: Pagination = {
                page:
                    Number.isFinite(pageQuery) && (pageQuery as number) > 0
                        ? (pageQuery as number)
                        : Number(bodyPagination.page ?? 1),
                itemsPerPage:
                    Number.isFinite(itemsPerPageQuery) && (itemsPerPageQuery as number) > 0
                        ? (itemsPerPageQuery as number)
                        : Number(bodyPagination.itemsPerPage ?? 20),
            };

            const filters = { ...(bodyPagination.filters ?? {}) } as any;
            if (typeof req.query?.idUserFk === "string" && req.query.idUserFk.trim()) {
                filters.idUserFk = { value: req.query.idUserFk };
            }
            if (typeof req.query?.idWorkspaceFk === "string" && req.query.idWorkspaceFk.trim()) {
                filters.idWorkspaceFk = { value: req.query.idWorkspaceFk };
            }
            if (Object.keys(filters).length > 0) {
                pagination.filters = filters;
            }

            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHours2(pagination);
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Returns one temporary exception by id. */
    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHourById(id);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Returns temporary exceptions for one date. */
    public getByDate = async (req: any, res: any, next: any) => {
        try {
            const { date } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHourByDate(date);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Returns temporary exceptions for one worker and date. */
    public getByWorkerAndDate = async (req: any, res: any, next: any) => {
        try {
            const { idWorker, date } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHourByWorkerAndDate(idWorker, date);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    /** Returns dates that contain exceptions for one worker. */
    public getDistinctDatesWithExceptionsByWorker = async (req: any, res: any, next: any) => {
        try {
            const { idWorker, minDate, maxDate } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getDistinctDatesWithExceptionsByWorker(idWorker, minDate, maxDate);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }



    /** Updates a temporary business-hour exception. */
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
            res.status(500).json({ message: err.message });
        }
    }

    /** Deletes temporary exceptions and clears cache. */
    public delete = async (req: any, res: any, next: any) => {
        try {
            const { idList, idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.deleteTemporaryBusinessHourFromRedis(idList, idWorkspace);
            res.status(200).json(Response.build("Registro eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    /** Returns autocomplete data for temporary exceptions. */
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
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result && result?.rows ? result.rows : [] });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    /** Returns temporary exceptions from cache/database by users and workspace. */
    getTemporaryHoursFromRedis = async (req: any, res: any, next: any) => {
        try {
            const { idUserList, idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryHoursFromRedis(idUserList, idWorkspace);

            console.log("mira el result de redis", result);

            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


}
