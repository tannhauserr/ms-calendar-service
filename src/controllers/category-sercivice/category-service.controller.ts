import { Response } from "../../models/messages/response";
import { CategoryServiceService } from "../../services/@database/category-service/category-service.service";
import { JWTService } from "../../services/jwt/jwt.service";


export class CategoryServiceController {
    private jwtService: JWTService;
    private categoryService: CategoryServiceService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.categoryService = new CategoryServiceService();
    }

    // Obtener todos los servicios por establecimiento
    public getByWorkspace = async (req: any, res: any, next: any) => {
        try {
            const { idWorkspace } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.getByWorkspace(String(idWorkspace));
            res.status(200).json(Response.build("Servicios de categoría encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    // Obtener una relación por ID
    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.getById(String(id));
            res.status(200).json(Response.build("Relación encontrada", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    // Crear múltiples relaciones categoría-servicio
    public addMultiple = async (req: any, res: any, next: any) => {
        try {
            const items = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.addMultipleCategoryService(items);
            res.status(200).json(Response.build("Relaciones creadas", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    // Eliminar una relación por ID
    public deleteMultiple = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.deleteMultiple(idList);
            res.status(200).json(Response.build("Relación eliminada", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    // Eliminar relaciones por categoría y servicio
    public deleteMultipleByCategoryAndService = async (req: any, res: any, next: any) => {
        try {
            // Esperamos un array de pares { idCategory, idService }
            const pairs: { idCategory: string; idService: string }[] = req.body.pairs;
            const token = req.token;

            // Verificar JWT
            await this.jwtService.verify(token);

            // Llamamos al método que borra múltiples relaciones a la vez
            const result = await this.categoryService.deleteMultipleByCategoryAndService(pairs);

            res.status(200)
                .json(Response.build(
                    "Relaciones eliminadas por categoría y servicio",
                    200,
                    true,
                    result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

}
