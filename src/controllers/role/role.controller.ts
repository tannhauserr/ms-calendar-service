import { RoleService } from "../../services/@database/role/role.service";
import { JWTService } from "../../services/jwt/jwt.service";

export class RoleController {


    public roleService: RoleService;
    public jwtService: JWTService;

    constructor() {
        this.roleService = new RoleService();
        this.jwtService = JWTService.instance;
    }


    autocomplete = async (req, res) => {
        try {
            const token = req.token;
            await this.jwtService.verify(token);
            const result = await this.roleService.autocomplete();

            res.status(200).json({ message: "Registros encontrados", ok: true, item: result });

        } catch (err: any) {
            console.error(err)
            if (err?.message === "Clave privada no disponible") {
                res.status(500).json({ message: "Clave privada no disponible" });
            } else {
                res.status(500).json({ message: err.message });
            }
        }
    }


}