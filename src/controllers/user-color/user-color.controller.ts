import { Response } from "../../models/messages/response";
import { UserColorService } from "../../services/@database/user-color/user-color.service";
import { JWTService } from "../../services/jwt/jwt.service";


export class UserColorController {
    // public userColorService: UserColorService;
    // private jwtService: JWTService;

    // constructor() {
    //     this.jwtService = JWTService.instance;
    //     this.userColorService = new UserColorService();
    // }

    // public getUserColorSimple = async (req: any, res: any, next: any) => {
    //     try {
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.userColorService.getUserColorSimple();
    //         res.status(200).json(Response.build("Colores de usuario encontrados", 200, true, result));
    //     } catch (err: any) {
    //         res.status(401).json({ message: err.message });
    //     }
    // }

    // public add = async (req: any, res: any, next: any) => {
    //     try {
    //         const body = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.userColorService.addUserColor(body);
    //         res.status(200).json(Response.build("Color de usuario creado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // public getById = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id } = req.params;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.userColorService.getById(id);
    //         res.status(200).json(Response.build("Color de usuario encontrado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // public getByidUser = async (req: any, res: any, next: any) => {
    //     try {
    //         const { idUserFk } = req.params;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.userColorService.getUserColorByIdUser(idUserFk);

    //         res.status(200).json(Response.build("Color de usuario encontrado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // public update = async (req: any, res: any, next: any) => {
    //     try {
    //         const body = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.userColorService.updateUserColor(body);
    //         res.status(200).json(Response.build("Color de usuario actualizado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // public delete = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.userColorService.deleteUserColor(id);
    //         res.status(200).json(Response.build("Color de usuario eliminado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }
}
