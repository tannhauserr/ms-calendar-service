import { ModerationStatusType } from "@prisma/client";
import { Response } from "../../models/messages/response";
import { Pagination } from "../../models/pagination";
import { ServiceService } from "../../services/@database/service/service.service";
import { JWTService } from "../../services/jwt/jwt.service";
import prisma from "../../lib/prisma";
import * as RabbitPUBSUB from "../../services/@rabbitmq/pubsub/functions";


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

            console.log("Add service request body:", body);
       
            const result = await this.serviceService.addService({
                ...body,
                moderationStatusType: ModerationStatusType.ACCEPTED
            });
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

    // No es necesario por ahora hacer un get mini para servicios
    public orderedServicesByCategory = async (req: any, res: any, next: any) => {
        try {
            const { idCategory } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);
            const result = await this.serviceService.orderedServicesByCategory(idCategory);
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
            // console.log("Update service request body:", req.body);
            const { body, action, notify } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);
            let result;
            if (body?.positionList && body?.idCategoryFk) {
                // Si hay una lista de posiciones, actualiza la posición
                const { positionList, idCategoryFk } = body;
                // Cambiar el orden de los servicios
                result = await this.serviceService.updatePosition(positionList, idCategoryFk);
            } else {
                delete body.positionList;
                delete body.idCategoryFk;
                // Si no hay lista de posiciones, actualiza el servicio normalmente
                result = await this.serviceService.updateService(body);
            }

            // Si se especifica notify, se envía una notificación
            let n: { email: boolean, whatsapp: boolean } = { email: false, whatsapp: false };
            if (notify) {
                if (notify.email) n.email = true;
                if (notify.whatsapp) n.whatsapp = true;
            }

            // TODO: Usad el send de RabbitMQ para crear notificación en su Microservicio
            // Por hacer

            // Si la acción es "all_appointments", actualiza todas las citas no pasadas
            // y envía a la cola de RabbitMQ para que se actualicen
            if (action === "all_appointments") {
                // Mandar a la cola de RabbitMQ para actualizar todas las citas
                // Hay que hacer la cola todavía.
                RabbitPUBSUB.sendUpdateServiceInEvent({
                    id: body.id,
                    name: body.name,
                    duration: body.duration,
                    price: body.price,
                    discount: body.discount,
                });
            } else if (action === "only_service") {
                // No hace nada
            }

            console.log("Update service result:", result);
            console.log("Update service result:", result);


            // const result = await this.serviceService.updateService(body);
            res.status(200).json(Response.build("Servicio actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public updateModerationStatus = async (req: any, res: any, next: any) => {
        try {
            const { id, moderationStatusType } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.serviceService.updateModerationStatus(id, moderationStatusType);
            res.status(200).json(Response.build("Estado de moderación actualizado", 200, true, result));
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
                result = await this.serviceService.getServices(pagination);
            } else {
                result = await this.serviceService.getServices(pagination);
            }

            // const result = await this.serviceService.autocompleteServices(search, pagination);
            res.status(200).json({ message: "Servicios encontrados", ok: true, item: result && result?.rows ? result.rows : [] });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    /**
 * Autocomplete de servicios por establecimiento (y opcionalmente por usuario)
 * - Recibe en body: 
 *     { 
 *       idWorkspace: string, 
 *       query: string, 
 *       idUser?: string 
 *     }
 * - Normaliza el query (trim, lowercase, NFD + regex para quitar tildes)
 * - Usa Postgres unaccent + ILIKE para buscar en s.name
 * - Devuelve, por cada servicio:
 *     • s.id, s.name, s.color, s.duration, s.price, s.discount, s.description  
 *     • id de categoría (cs.idCategoryFk) y nombre de categoría (c.name)  
 *     • idUserFk si existe un registro en UserService
 */
    public autocompleteServicesBackendByIdWorkspaceAndText = async (
        req: any,
        res: any,
        next: any
    ) => {
        try {
            const { idWorkspace, query, idUser } = req.body;
            await this.jwtService.verify(req.token);

            if (!idWorkspace) {
                return res.status(400).json({ message: "Se requiere idWorkspace" });
            }
            if (query != null && typeof query !== "string") {
                return res.status(400).json({ message: "Se requiere un texto de búsqueda válido" });
            }

            const normalized = query
                ? query.trim().toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                : "";

            // Sin texto: devolvemos los 15 primeros
            if (!normalized) {
                const defaults = await prisma.$queryRawUnsafe<
                    Array<{
                        id: string;
                        name: string;
                        color: string;
                        duration: number;
                        price: number;
                        discount: number;
                        description: string | null;
                        image: string | null;
                        maxParticipants: number | null;
                        idCategoryFk: string;
                        categoryName: string;
                        idUserFk: string | null;
                    }>
                >(
                    `
        SELECT
          s.id,
          s.name,
          s.color,
          s.duration,
          s.price,
          s.discount,
          s.description,
          s.image,
          s."maxParticipants",
          cs."idCategoryFk"   AS "idCategoryFk",
          c.name              AS "categoryName",
          us."idUserFk"       AS "idUserFk"
        FROM "services" s
          JOIN "categoryServiceAssignments" cs
            ON cs."idServiceFk" = s.id
          JOIN "categories" c
            ON c.id = cs."idCategoryFk"
          LEFT JOIN "userServices" us
            ON us."idServiceFk" = s.id
            AND us."idUserFk" = $1
        WHERE s."idWorkspaceFk" = $2
        ORDER BY s.name ASC
        LIMIT 15;
        `,
                    idUser ?? null,
                    idWorkspace
                );

                return res
                    .status(200)
                    .json(Response.build("Servicios por defecto encontrados", 200, true, defaults));
            }

            // Con texto: filtro + LIMIT 10
            // const searchTerm = normalized + "%";
            const searchTerm = `%${normalized}%`;

            const result = await prisma.$queryRawUnsafe<
                Array<{
                    id: string;
                    name: string;
                    color: string;
                    duration: number;
                    price: number;
                    discount: number;
                    description: string | null;
                    image: string | null;
                    maxParticipants: number | null;
                    idCategoryFk: string;
                    categoryName: string;
                    idUserFk: string | null;
                }>
            >(
                `
      SELECT
        s.id,
        s.name,
        s.color,
        s.duration,
        s.price,
        s.discount,
        s.description,
        s.image,
        s."maxParticipants",
        cs."idCategoryFk"   AS "idCategoryFk",
        c.name              AS "categoryName",
        us."idUserFk"       AS "idUserFk"
      FROM "services" s
        JOIN "categoryServiceAssignments" cs
          ON cs."idServiceFk" = s.id
        JOIN "categories" c
          ON c.id = cs."idCategoryFk"
        LEFT JOIN "userServices" us
          ON us."idServiceFk" = s.id
          AND us."idUserFk" = $1
      WHERE s."idWorkspaceFk" = $2
        AND unaccent(lower(s.name)) ILIKE unaccent($3)
      ORDER BY s.name ASC
      LIMIT 10;
      `,
                idUser ?? null,
                idWorkspace,
                searchTerm
            );

            return res
                .status(200)
                .json(Response.build("Resultados de autocompletado de servicios encontrados", 200, true, result));

        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    };


}
