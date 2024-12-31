import { Response } from "../../models/messages/response";
import { Pagination } from "../../models/pagination";
import { ServiceService } from "../../services/@database/service/service.service";
import { JWTService } from "../../services/jwt/jwt.service";


export class ServiceController {
    public serviceService: ServiceService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.serviceService = new ServiceService();
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.serviceService.addService(body);
            res.status(200).json(Response.build("Servicio creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.serviceService.getServices(pagination);
            res.status(200).json({ message: "Servicios encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);
            
            const result = await this.serviceService.getServiceById(id);
            res.status(200).json(Response.build("Servicio encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.serviceService.updateService(body);
            res.status(200).json(Response.build("Servicio actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public delete = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.serviceService.deleteService(id);
            res.status(200).json(Response.build("Servicio eliminado", 200, true, result));
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
                result = await this.serviceService.getServices(pagination, false);
            } else {
                result = await this.serviceService.getServices(pagination, false);
            }

            // const result = await this.serviceService.autocompleteServices(search, pagination);
            res.status(200).json({ message: "Servicios encontrados", ok: true, item: result && result?.rows ? result.rows : [] });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }
}
