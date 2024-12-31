import { Response } from "../../models/messages/response";
import { UserServiceService } from "../../services/@database/user-service/user-service.service";
import { JWTService } from "../../services/jwt/jwt.service";


export class UserServiceController {
    public userServiceService: UserServiceService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.userServiceService = new UserServiceService();
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userServiceService.getUserService(pagination);
            res.status(200).json({ message: "Servicios de usuario encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    // public add = async (req: any, res: any, next: any) => {
    //     try {
    //         const body = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.userServiceService.addUserService(body);
    //         res.status(200).json(Response.build("Servicio de usuario creado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    public addMultiple = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userServiceService.addMultipleUserService(body);
            res.status(200).json(Response.build("Servicio de usuario creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userServiceService.getUserServiceById(id);
            res.status(200).json(Response.build("Servicio de usuario encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userServiceService.updateUserService(body);
            res.status(200).json(Response.build("Servicio de usuario actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public delete = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userServiceService.deleteUserService(idList);
            res.status(200).json(Response.build("Servicio de usuario eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }
}
