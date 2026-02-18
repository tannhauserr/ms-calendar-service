import { Response } from "../../../models/messages/response";
import { BusinessHourService } from "../services/business-hour.service";
import { BusinessHoursStrategy } from "../../../services/@redis/cache/strategies/businessHours/businessHours.strategy";
import { JWTService } from "../../../services/jwt/jwt.service";
import {
    AddBusinessHourDto,
    BusinessHourIdParamsDto,
    BusinessHourWeekDayParamsDto,
    BusinessHoursRedisDto,
    BusinessHoursRedisQueryDto,
    DeleteBusinessHourDto,
    GetBusinessHoursDto,
    GetBusinessHoursQueryDto,
    UpdateBusinessHourDto,
} from "../dto";




export class BusinessHourController {
    public businessHourBusinessHour: BusinessHourService;
    private jwtBusinessHour: JWTService;

    /** Initializes controller dependencies. */
    constructor() {
        this.jwtBusinessHour = JWTService.instance;
        this.businessHourBusinessHour = new BusinessHourService();
    }

    /** Creates a business-hour record. */
    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body as AddBusinessHourDto;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.addBusinessHour(body as any);
            const businessHoursStrategy = new BusinessHoursStrategy();
            if (body?.idWorkspaceFk) {
                await businessHoursStrategy.deleteBusinessHours(body.idWorkspaceFk);
            }

            res.status(200).json(Response.build("Registro creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Returns business hours for a workspace. */
    public get = async (req: any, res: any, next: any) => {
        try {
            const query = req.query as Partial<GetBusinessHoursQueryDto>;
            const body = req.body as Partial<GetBusinessHoursDto>;
            const idWorkspace = query?.idWorkspace ?? body?.idWorkspace;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.getBusinessHours(idWorkspace);
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Returns a business-hour record by id. */
    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params as BusinessHourIdParamsDto;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.getBusinessHourById(id);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Returns business-hour records by weekday. */
    public getByWeekDay = async (req: any, res: any, next: any) => {
        try {
            const { weekDayType } = req.params as BusinessHourWeekDayParamsDto;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.getBusinessHourByWeekDay(weekDayType);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Updates a business-hour record. */
    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body as UpdateBusinessHourDto & { id?: string };
            const token = req.token;
            await this.jwtBusinessHour.verify(token);
            if (!body?.id && req.params?.id) {
                body.id = req.params.id;
            }

            const result = await this.businessHourBusinessHour.updateBusinessHour(body as any);
            const businessHoursStrategy = new BusinessHoursStrategy();
            if (body?.idWorkspaceFk) {
                await businessHoursStrategy.deleteBusinessHours(body.idWorkspaceFk);
            }

            res.status(200).json(Response.build("Registro actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Deletes one or many business-hour records. */
    public delete = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body as DeleteBusinessHourDto;
            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const normalizedIdList = Array.isArray(idList) ? idList : [idList];
            const result = await this.businessHourBusinessHour.deleteBusinessHour(normalizedIdList);
            res.status(200).json(Response.build("Registro eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Returns cached business hours for a workspace. */
    public getBusinessHoursFromRedis = async (req: any, res: any, next: any) => {
        try {
            const query = req.query as Partial<BusinessHoursRedisQueryDto>;
            const body = req.body as Partial<BusinessHoursRedisDto>;
            const idCompany = query?.idCompany ?? body?.idCompany;
            const idWorkspace = query?.idWorkspace ?? body?.idWorkspace;

            console.log("llego aqui para algo?", idCompany, idWorkspace);

            const token = req.token;
            await this.jwtBusinessHour.verify(token);

            const result = await this.businessHourBusinessHour.getBusinessHoursFromRedis(idCompany, idWorkspace);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    /** Returns cached business hours for internal microservice calls. */
    public getBusinessHoursFromRedis_internalMS = async (req: any, res: any, next: any) => {
        try {
            const { idCompany, idWorkspace } = req.body as BusinessHoursRedisDto;

            console.log("llego aqui para algo?", idCompany, idWorkspace);

            const result = await this.businessHourBusinessHour.getBusinessHoursFromRedis(idCompany, idWorkspace);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    /** Generates a default business-hours schedule for a workspace. */
    public internalGenerateWorkspaceBusinessHours = async (req: any, res: any, next: any) => {
        try {
            const { idCompany, idWorkspace, businessHours } = req.body;

            const result = await this.businessHourBusinessHour.internalGenerateWorkspaceBusinessHours(
                idCompany,
                idWorkspace,
                businessHours
            );
            res.status(200).json(Response.build("Horario de workspace generado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }
}
