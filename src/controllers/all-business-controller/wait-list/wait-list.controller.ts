import { CONSOLE_COLOR } from "../../../constant/console-color";
import { Response } from "../../../models/messages/response";
import { WaitListService } from "../../../services/@database/all-business-services/wait-list/wait-list.service";
import { JWTService } from "../../../services/jwt/jwt.service";

export class WaitListController {
    public waitListService: WaitListService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.waitListService = new WaitListService();
    }

    /* helper uniforme para 4xx */
    private static endBadRequest(
        res: any,
        status: number,
        message: string,
        where: string,
        error?: unknown
    ) {
        const ERROR_CODES_BY_WHERE: Record<string, string> = {
            "WaitList.CreateLimit": "210",
        };

        const code = ERROR_CODES_BY_WHERE[where] ?? "299";

        if (error) {
            console.error(
                CONSOLE_COLOR.BgRed,
                `[${where}]`,
                `code=${code}`,
                message,
                error instanceof Error ? error.message : error,
                CONSOLE_COLOR.Reset
            );
        } else {
            console.warn(
                CONSOLE_COLOR.BgYellow,
                `[${where}] code=${code} ${message}`,
                CONSOLE_COLOR.Reset
            );
        }

        return res.status(status).json(
            Response.build(
                message,
                status,
                false,
                null,
                code
            )
        );
    }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.waitListService.getWaitLists(pagination);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            if (body?.idClientFk && body?.idWorkspaceFk) {
                const currentCount = await this.waitListService.countCurrentWindowByClientAndWorkspace(
                    body.idClientFk,
                    body.idWorkspaceFk
                );

                if (currentCount >= 5) {
                    return WaitListController.endBadRequest(
                        res,
                        400,
                        "Límite de waitlist alcanzado para la fecha actual",
                        "WaitList.CreateLimit"
                    );
                }
            }

            const result = await this.waitListService.addWaitList(body);
            res.status(200).json(Response.build("Registro creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.waitListService.getWaitListById(id);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getByWorkspace = async (req: any, res: any, next: any) => {
        try {
            const { idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.waitListService.getWaitListByWorkspace(idWorkspace);
            res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getPendingCount = async (req: any, res: any, next: any) => {
        try {
            const token = req.token;
            await this.jwtService.verify(token);

            const rawIdClient = req.query?.idClient;
            const rawIdWorkspace = req.query?.idWorkspace;
            const idClient = Array.isArray(rawIdClient) ? rawIdClient[0] : rawIdClient;
            const idWorkspace = Array.isArray(rawIdWorkspace) ? rawIdWorkspace[0] : rawIdWorkspace;

            if (!idClient || !idWorkspace) {
                return res.status(400).json({ ok: false, message: "idClient and idWorkspace are required" });
            }

            const count = await this.waitListService.getPendingCountByClientAndWorkspace(
                String(idClient),
                String(idWorkspace)
            );

            res.status(200).json(Response.build("Registros encontrados", 200, true, { count }));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            if (!body?.id && req.params?.id) {
                body.id = req.params.id;
            }

            const result = await this.waitListService.updateWaitList(body);
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

            const result = await this.waitListService.deleteWaitList(idList);
            res.status(200).json(Response.build("Registro eliminado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }
}
