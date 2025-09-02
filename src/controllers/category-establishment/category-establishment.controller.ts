// import { Response } from "../../models/messages/response";

// import { JWTService } from "../../services/jwt/jwt.service";

// export class CategoryWorkspaceController {
//     private categoryWorkspaceService: CategoryWorkspaceService;
//     private jwtService: JWTService;

//     constructor() {
//         this.jwtService = JWTService.instance;
//         this.categoryWorkspaceService = new CategoryWorkspaceService();
//     }

//     public get = async (req: any, res: any, next: any) => {
//         try {
//             const pagination = req.body.pagination;
//             const token = req.token;
//             await this.jwtService.verify(token);

//             const result = await this.categoryWorkspaceService.get(pagination);
//             res.status(200).json(Response.build('Registros encontrados', 200, true, result));
//         } catch (err: any) {
//             res.status(500).json({ message: err.message });
//         }
//     };

//     public getById = async (req: any, res: any, next: any) => {
//         try {
//             const { id } = req.params;
//             const token = req.token;
//             await this.jwtService.verify(token);

//             const result = await this.categoryWorkspaceService.getById(String(id));
//             res.status(200).json(Response.build('Registro encontrado', 200, true, result));
//         } catch (err: any) {
//             res.status(500).json({ message: err.message });
//         }
//     };

//     // public add = async (req: any, res: any, next: any) => {
//     //     try {
//     //         const body = req.body;
//     //         const token = req.token;
//     //         await this.jwtService.verify(token);

//     //         const result = await this.categoryWorkspaceService.add(body);
//     //         res.status(200).json(Response.build('Registro creado', 200, true, result));
//     //     } catch (err: any) {
//     //         res.status(500).json({ message: err.message });
//     //     }
//     // };

//     public addMultiple = async (req: any, res: any, next: any) => {
//         try {
//             const body = req.body;
//             const token = req.token;
//             await this.jwtService.verify(token);

//             const result = await this.categoryWorkspaceService.addMultipleCategoryWorkspace(body);
//             res.status(200).json(Response.build("Servicio de usuario creado", 200, true, result));
//         } catch (err: any) {
//             res.status(500).json({ message: err.message });
//         }
//     }

//     public delete = async (req: any, res: any, next: any) => {
//         try {
//             const { idList } = req.body;
//             const token = req.token;
//             await this.jwtService.verify(token);

//             console.log("mira que es idList", idList);

//             if (!idList) {
//                 res.status(400).json(Response.build('No se ha proporcionado una lista de IDs', 400, false));
//                 return;
//             }

//             const result = await this.categoryWorkspaceService.deleteMultiple(idList);
//             res.status(200).json(Response.build('Registros eliminados', 200, true, result));
//         } catch (err: any) {
//             res.status(500).json({ message: err.message });
//         }
//     };
// }
