import { Response } from "../../../models/messages/response";
import { Pagination } from "../../../models/pagination";
import { TemporaryBusinessHourService } from "../../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";



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

            const result = await this.workBusinessHourService.addTemporaryBusinessHour(body);
            res.status(200).json(Response.build("Registro creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryBusinessHours(pagination);
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
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
            res.status(500).json({ message: err.message });
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
            res.status(500).json({ message: err.message });
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
            res.status(500).json({ message: err.message });
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
            res.status(500).json({ message: err.message });
        }
    }



    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.updateTemporaryBusinessHour(body);
            res.status(200).json(Response.build("Registro actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public delete = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.deleteTemporaryBusinessHour(idList);
            res.status(200).json(Response.build("Registro eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
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
            res.status(500).json({ message: err.message });
        }
    }


    getTemporaryHoursFromRedis = async (req: any, res: any, next: any) => {
        try {
            const { idUserList, idCompany} = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.workBusinessHourService.getTemporaryHoursFromRedis(idUserList, idCompany);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }
}
