import { ModerationStatusType } from "@prisma/client";
import { Response } from "../../models/messages/response";
import { Pagination } from "../../models/pagination";
import { CategoryService } from "../../services/@database/category/category.service";
import { JWTService } from "../../services/jwt/jwt.service";


export class CategoryController {
    private categoryService: CategoryService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.categoryService = new CategoryService();
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const pagination = req.body.pagination;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.get(pagination);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.getById(String(id));
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            // moderationStatusType false por defecto al crear
            body.moderationStatusType = ModerationStatusType.PENDING;

            const result = await this.categoryService.add(body);
            res.status(200).json(Response.build("Registro creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            let result;
            if (body?.positionList) {
                // Son id de las categorias por orden
                const { positionList, idWorkspaceFk } = body;
                // Cambiar el orden de las categorias
                result = await this.categoryService.updatePosition(positionList, idWorkspaceFk);
            } else {
                result = await this.categoryService.update(body);
            }

            res.status(200).json(Response.build("Registro actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };






    public updateModerationStatus = async (req: any, res: any, next: any) => {
        try {
            const { id, moderationStatusType } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.updateModerationStatus(id, moderationStatusType);
            res.status(200).json(Response.build("Estado de moderación actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    public deleteMultiple = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.deleteMultiple(idList);
            res.status(200).json(Response.build("Registro eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };


    /**
     * Devuelve todos los servicios por una categoria
     * @param req 
     * @param res 
     * @param next 
     */
    public getServiceByCategoryId = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.getServiceByCategoryId(id);
            res.status(200).json(Response.build("Servicios encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    public getCategoriesWithServicesAndUsers = async (req: any, res: any, next: any) => {
        try {
            const { idCompany, idWorkspace } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.getCategoriesWithServicesAndUsers(idCompany, idWorkspace);

            console.log("category with service", result);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    public autocomplete = async (req: any, res: any, next: any) => {
        try {
            const { idUser } = req.body;
            const token = req.token;
            const decoded = await this.jwtService.verify(token);

            let result = undefined;
            let pagination: Pagination = {
                page: 1,
                itemsPerPage: 10000,
            }
            if (idUser) {
                pagination.filters = {
                    idCompanyFk: {
                        value: decoded.idCompanySelected
                    }
                }
                result = await this.categoryService.get(pagination);
            } else {
                result = await this.categoryService.get(pagination);
            }

            // const result = await this.workBusinessHourWorkBusinessHour.autocompleteTemporaryWorkBusinessHours(search, pagination);
            res.status(200).json({ message: "Registros encontrados", ok: true, item: result && result?.rows ? result.rows : [] });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    // Nuevo por listado nuevo de Servicios

    counterServicesByCategories = async (req: any, res: any, next: any) => {
        try {
            const { idCompany, idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.categoryService.counterServicesByCategories(idCompany, idWorkspace);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


}
