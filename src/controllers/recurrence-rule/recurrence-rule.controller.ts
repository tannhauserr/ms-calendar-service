import { Response } from "../../models/messages/response";
import { RecurrenceRuleService, RecurrenceRuleWithClients } from "../../services/@database/recurrence-rule/recurrence-rule.service";
import { JWTService } from "../../services/jwt/jwt.service";


export class RecurrenceRuleController {
    private recurrenceRuleService: RecurrenceRuleService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.recurrenceRuleService = new RecurrenceRuleService();
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.recurrenceRuleService.addRule(body);
            res
                .status(200)
                .json(Response.build("Regla de recurrencia creada", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    // public get = async (req: any, res: any, next: any) => {
    //     try {
    //         const { pagination } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const idWorkspace = pagination?.filters?.idWorkspaceFk?.value

    //         if (!idWorkspace) {
    //             return res.status(400).json({ message: "Falta el id del establecimiento" });
    //         }

    //         const result = await this.recurrenceRuleService.getRules(pagination);
    //         const recurrenceRulesList: RecurrenceRuleWithClients[] = result?.rows;


    //         // TODO: Petición a clientes (RabbitMQ y Redis) para que se muestren los nombres y avatares
    //         // TODO: De los usuarios no es necesario hacer petición a su MS, siempre serán pocos y se hace desde el front una sola vez
    //         const allIds = recurrenceRulesList
    //             .flatMap(rule =>
    //                 rule.events.flatMap(event =>
    //                     event.eventParticipant.map(client => client.idClientFk)
    //                 )
    //             );

    //         // 2) Elimina duplicados usando Set
    //         const uniqueIdsClient = Array.from(new Set(allIds)) || [];

    //         console.log("IDs únicos de clientes:", uniqueIdsClient);

    //         const clientWorkspaceRPCList = await RPC.getClientstByIdClientAndIdWorkspace(
    //             idWorkspace,
    //             uniqueIdsClient);

    //         // 2) Construyes un Map para lookup rápido
    //         const clientMap = new Map(
    //             clientWorkspaceRPCList.map(c => [c.idClientFk, c])
    //         );

    //         // 3) Mapeas las reglas, asignando datos de cliente en O(1)
    //         const recurrenceRulesWithClients = recurrenceRulesList.map(rule => ({
    //             ...rule,
    //             events: rule.events.map(event => ({
    //                 ...event,
    //                 eventParticipant: event.eventParticipant.map(ec => ({
    //                     ...ec,
    //                     client: clientMap.get(ec.idClientFk) ?? null
    //                 }))
    //             }))
    //         }));


    //         result.rows = recurrenceRulesWithClients;

    //         res.status(200).json(Response.build("Reglas encontradas", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // };

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const idWorkspace = pagination?.filters?.idWorkspaceFk?.value;
            if (!idWorkspace) {
                return res.status(400).json({ message: "Falta el id del establecimiento" });
            }

            // 1) Traigo las reglas con su lista 'clients'
            const result = await this.recurrenceRuleService.getRules(pagination);
            // const recurrenceRulesList: RecurrenceRuleWithClients[] = result.rows;
            const recurrenceRulesList = result.rows as Array<
                RecurrenceRuleWithClients & { clients: { idClientFk: string; idClientWorkspaceFk: string }[] }
            >;
            // 2) Extraigo todos los idClientFk de la propiedad 'clients'
            const allIds = recurrenceRulesList
                .flatMap(rule =>
                    rule.clients.map(c => c.idClientFk)
                );

            // // 3) Elimino duplicados
            // const uniqueIdsClient = Array.from(new Set(allIds));

            // // 4) Obtengo datos de cliente por RPC
            // const clientWorkspaceRPCList = await RPC.getClientstByIdClientAndIdWorkspace(
            //     idWorkspace,
            //     uniqueIdsClient
            // );

            // // 5) Construyo mapa { idClientFk → datosRPC }
            // const clientMap = new Map(
            //     clientWorkspaceRPCList.map(c => [c.idClientFk, c])
            // );

            // 6) Inyecto los datosRPC en cada regla
            // const recurrenceRulesWithClients = recurrenceRulesList.map(rule => ({
            //     ...rule,
            //     clients: rule.clients.map(c => ({
            //         ...c,
            //         client: clientMap.get(c.idClientFk) ?? null
            //     }))
            // }));
            const recurrenceRulesWithClients = recurrenceRulesList;

            result.rows = recurrenceRulesWithClients;
            return res
                .status(200)
                .json(Response.build("Reglas encontradas", 200, true, result));

        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    };

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.recurrenceRuleService.getRuleById(id);
            res
                .status(200)
                .json(Response.build("Regla encontrada", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const { id, ...data } = body;
            const result = await this.recurrenceRuleService.updateRule(id, data);
            res
                .status(200)
                .json(Response.build("Regla de recurrencia actualizada", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    public delete = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.recurrenceRuleService.deleteRule(id);
            res
                .status(200)
                .json(Response.build("Regla de recurrencia eliminada", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    public getByCalendar = async (req: any, res: any, next: any) => {
        try {
            const { idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.recurrenceRuleService.getRulesByCalendar(
                idWorkspace
            );
            res
                .status(200)
                .json(
                    Response.build(
                        "Reglas de calendario encontradas",
                        200,
                        true,
                        result
                    )
                );
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };

    // public getInstances = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id, from, to } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const options: { from?: Date; to?: Date } = {};
    //         if (from) options.from = new Date(from);
    //         if (to) options.to = new Date(to);

    //         const result = await this.recurrenceRuleService.getInstances(
    //             id,
    //             options
    //         );
    //         res
    //             .status(200)
    //             .json(Response.build("Instancias generadas", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // };
}
