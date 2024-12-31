import { Response } from "../../../models/messages/response";
import { BusinessHourService } from "../../../services/@database/all-business-services/business-hours/business-hours.service";
import { JWTService } from "../../../services/jwt/jwt.service";




export class BusinessHourController {
    public businessHourBusinessHour: BusinessHourService;
    private jwtBusinessHour: JWTService;

    constructor() {
        this.jwtBusinessHour = JWTService.instance;
        this.businessHourBusinessHour = new BusinessHourService();
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.addBusinessHour(body);
            res.status(200).json(Response.build("Registro creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { idEstablishment } = req.body;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.getBusinessHours(idEstablishment);
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.getBusinessHourById(id);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getByWeekDay = async (req: any, res: any, next: any) => {
        try {
            const { weekDayType } = req.params;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.getBusinessHourByWeekDay(weekDayType);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.updateBusinessHour(body);
            res.status(200).json(Response.build("Registro actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public delete = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.deleteBusinessHour(idList);
            res.status(200).json(Response.build("Registro eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getBusinessHoursFromRedis = async (req: any, res: any, next: any) => {
        try {
            const { idCompany, idEstablishment } = req.body;

            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.getBusinessHoursFromRedis(idCompany, idEstablishment);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    // public autocomplete = async (req: any, res: any, next: any) => {
    //     try {

    //         const token = req.token;
    //         await this.jwtBusinessHour.verify(token);

    //         let result = undefined;


    //         result = await this.businessHourBusinessHour.getBusinessHours();


    //         // const result = await this.businessHourBusinessHour.autocompleteBusinessHours(search, pagination);
    //         res.status(200).json({ message: "Registros encontrados", ok: true, item: result && result?.rows ? result.rows : [] });
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }
}
