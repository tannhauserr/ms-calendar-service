// import { ModerationStatusType, Prisma } from "@prisma/client";
// import { Pagination } from "../../../models/pagination";
// import { getGeneric } from "../../../utils/get-genetic/getGenetic";
// import CustomError from "../../../models/custom-error/CustomError";
// import prisma from "../../../lib/prisma";




// export class CategoryService {
//     constructor() { }

//     // Obtener todos los establecimientos con paginación
//     async get(pagination: Pagination) {
//         try {
//             const select: Prisma.CategorySelect = {
//                 id: true,
//                 idCompanyFk: true,
//                 name: true,
//                 color: true,
//                 description: true,
//                 position: true,
//                 moderationStatusType: true,

//             };

//             const result = await getGeneric(pagination, "category", select);

//             return result;
//         } catch (error: any) {
//             throw new CustomError('CategoryService.get', error);
//         }
//     }


//     // Obtener un establecimiento por ID
//     async getById(id: string) {
//         try {
//             const result = await prisma.category.findUnique({
//                 where: { id },
//                 select: {
//                     id: true,
//                     idCompanyFk: true,
//                     color: true,

//                     name: true,
//                     description: true,

//                 },
//             });
//             return result;
//         } catch (error: any) {
//             throw new CustomError('CategoryService.getById', error);
//         }
//     }





//     // Crear una nueva categoría
//     async add(item: any) {
//         try {
//             const result = await prisma.category.create({
//                 data: item,
//                 select: {
//                     id: true,
//                     idCompanyFk: true,

//                     name: true,
//                     description: true,
//                     color: true,
//                 },
//             });
//             return result;
//         } catch (error: any) {
//             throw new CustomError('CategoryService.add', error);
//         }
//     }



//     async update(item: any) {
//         try {
//             const id = item.id;
//             delete item.id;

//             // 1. Obtener el registro original con los campos que se muestran por WhatsApp
//             const oldRecord = await prisma.category.findUnique({
//                 where: { id },
//                 select: {
//                     name: true,
//                     description: true,
//                     color: true,
//                 },
//             });

//             // 2. Comparar los campos para ver si han cambiado
//             const nameChanged =
//                 item.name !== undefined && item.name !== oldRecord?.name;
//             const descriptionChanged =
//                 item.description !== undefined && item.description !== oldRecord?.description;
//             const colorChanged =
//                 item.color !== undefined && item.color !== oldRecord?.color;

//             // 3. Si alguno de los campos cambió, marcar la categoría como no revisada
//             if (nameChanged || descriptionChanged || colorChanged) {
//                 item.moderationStatusType = 'PENDING'; // Asegúrate de que el campo moderationStatusType existe en tu modelo
//             }

//             // 4. Actualizar la categoría con los nuevos datos y la fecha de actualización
//             const result = await prisma.category.update({
//                 where: { id },
//                 data: {
//                     ...item,
//                     updatedDate: new Date(),
//                 },
//                 select: {
//                     id: true,
//                     idCompanyFk: true,
//                     name: true,
//                     description: true,
//                     color: true,
//                     moderationStatusType: true
//                 },
//             });

//             return result;
//         } catch (error: any) {
//             throw new CustomError('CategoryService.update', error);
//         }
//     }


//     async updateModerationStatus(id: any, moderationStatusType: ModerationStatusType) {
//         try {
//             return await prisma.category.update({
//                 where: { id },
//                 data: {
//                     moderationStatusType,
//                     updatedDate: new Date(),
//                 },
//             });
//         } catch (error: any) {
//             throw new CustomError('CompanyService.updateModerationStatus', error);
//         }
//     }

//     updatePosition = async (positionList: string[], idWorkspaceFk: string) => {
//         try {
//             // Update each category's position based on its index using a transaction
//             const updates = positionList.map((catId, index) =>
//                 prisma.category.update({
//                     where: { id: catId },
//                     data: { position: index + 1 },
//                 })
//             );
//             const result = await prisma.$transaction(updates);
//             return result;
//         } catch (error: any) {
//             throw new CustomError('CategoryService.updatePosition', error);
//         }
//     };

//     async updateMultipleById(idList: string[], dataNew: any) {
//         try {
//             delete dataNew?.id;
//             dataNew.updatedDate = new Date();


//             const result = await prisma.category.updateMany({
//                 data: dataNew,
//                 where: {
//                     id: {
//                         in: idList,
//                     },
//                 },
//             });
//             return result;
//         } catch (error: any) {
//             throw new CustomError('CategoryService.updateMultipleById', error);
//         }
//     }



//     // Eliminar múltiples establecimientos (borrado lógico)
//     async deleteMultiple(ids: string[]) {
//         try {
//             const result = await prisma.$transaction([
//                 // Primero borrar las relaciones en la tabla pivot
//                 prisma.categoryService.deleteMany({
//                     where: { idCategoryFk: { in: ids } },
//                 }),
//                 // Luego borrar las categorías
//                 prisma.category.deleteMany({
//                     where: { id: { in: ids } },
//                 }),
//             ]);
//             return result;
//         } catch (error: any) {
//             throw new CustomError('CategoryService.deleteMultiple', error);
//         }
//     }

//     // Obtener todos los servicios asociados a una categoría específica
//     async getServiceByCategoryId(idCategory: string) {
//         try {
//             const result = await prisma.service.findMany({
//                 where: {
//                     categoryServices: {              // Buscar servicios asociados a la categoría
//                         some: {
//                             idCategoryFk: idCategory,
//                         },
//                     },
//                     deletedDate: null,       // Filtrar servicios no eliminados
//                 },
//                 select: {
//                     id: true,
//                     name: true,
//                     description: true,
//                     price: true,
//                 },
//             });

//             return result; // Retornar directamente los servicios encontrados
//         } catch (error: any) {
//             throw new CustomError('CategoryService.getServiceByCategoryId', error);
//         }
//     }



//     // TODO: Quizás se borre
//     // TODO: Quizás se borre
//     // TODO: Quizás se borre
//     // TODO: Quizás se borre
//     // TODO: Quizás se borre
//     // /**
//     //  * Manda todas las categorias de una empresa con sus servicios y el id de los usuarios que tienen ese servicio
//     //  * @param idCompany 
//     //  * @param idWorkspace
//     //  * @returns 
//     //  */
//     // getCategoriesWithServicesAndUsers = async (idCompany: string, idWorkspace: string) => {
//     //     try {
//     //         const result = await prisma.category.findMany({
//     //             where: {
//     //                 idCompanyFk: idCompany,
//     //                 idWorkspaceFk: idWorkspace,
//     //             },
//     //             select: {
//     //                 id: true,
//     //                 name: true,
//     //                 color: true,
//     //                 categoryServices: {
//     //                     where: {
//     //                         deletedDate: null,
//     //                     },
//     //                     select: {
//     //                         service: {
//     //                             select: {
//     //                                 id: true,
//     //                                 // name: true,
//     //                                 color: true,
//     //                                 // duration: true,
//     //                                 userServices: {
//     //                                     select: {
//     //                                         idUserFk: true,
//     //                                     }
//     //                                 },
//     //                             }
//     //                         }
//     //                     },
//     //                 },
//     //             },
//     //         });

//     //         return result;
//     //     } catch (error: any) {
//     //         throw new CustomError('CategoryService.getCategoriesWithServicesAndUsers', error);
//     //     }
//     // }


//     async getCategoriesWithServicesAndUsers(
//         idWorkspace: string,
//         idCompany: string
//     ) {
//         const categories = await prisma.category.findMany({
//             where: {
//                 idWorkspaceFk: idWorkspace,
//                 idCompanyFk: idCompany,
//                 deletedDate: null,
//             },
//             select: {
//                 id: true,
//                 name: true,
//                 color: true,
//                 position: true,
//                 categoryServices: {
//                     where: { deletedDate: null },
//                     select: {
//                         position: true,
//                         service: {
//                             select: {
//                                 id: true,
//                                 name: true,
//                                 description: true,
//                                 duration: true,
//                                 price: true,
//                                 discount: true,
//                                 color: true,
//                                 userServices: {
//                                     where: {
//                                         deletedDate: null,
//                                         idCompanyFk: idCompany,
//                                     },
//                                     // ⚠️ No hay "position" en UserService; orden estable:
//                                     orderBy: [{ createdDate: "asc" }, { idUserFk: "asc" }],
//                                     select: { idUserFk: true },
//                                 },
//                             },
//                         },
//                     },
//                     // Servicios ordenados por la posición del pivot
//                     orderBy: [{ position: "asc" }],
//                 },
//             },
//             // Categorías por position; desempates por name e id
//             orderBy: [{ position: "asc" }, { name: "asc" }, { id: "asc" }],
//         });

//         return categories.map((cat) => ({
//             id: cat.id,
//             name: cat.name,
//             color: cat.color,
//             position: cat.position ?? 0,
//             services: cat.categoryServices.map((cs) => ({
//                 id: cs.service.id,
//                 name: cs.service.name,
//                 description: cs.service.description,
//                 duration: cs.service.duration,
//                 price: cs.service.price,
//                 discount: cs.service.discount,
//                 color: cs.service.color,
//                 userIds: cs.service.userServices.map((u) => u.idUserFk),
//             })),
//         }));
//     }


//     // Nuevo por listado nuevo de Servicios
//     // Nuevo listado de servicios por categoría (contando servicios)
//     counterServicesByCategories = async (idCompany: string, idWorkspace: string) => {
//         try {
//             // 1) Buscamos en la tabla `Category`, filtrando por empresa y establecimiento
//             const cats = await prisma.category.findMany({
//                 where: {
//                     idCompanyFk: idCompany,
//                     idWorkspaceFk: idWorkspace,
//                     deletedDate: null,
//                 },
//                 // Asegúrate de que Category tenga un campo `position` si quieres ordenarlo;
//                 // si no, quita este orderBy o usa otro campo de orden.
//                 orderBy: { position: 'asc' },
//                 select: {
//                     id: true,
//                     name: true,
//                     position: true,  // si tu modelo Category incluye position
//                     color: true,
//                     _count: {
//                         select: {
//                             categoryServices: true  // el pivot con los servicios
//                         }
//                     }
//                 }
//             });

//             // 2) Mapeamos al shape esperado por tu UI/backend
//             return cats.map(cat => ({
//                 id: cat.id,
//                 name: cat.name,
//                 position: cat.position,
//                 color: cat.color,
//                 serviceCount: cat._count.categoryServices
//             }));
//         } catch (error: any) {
//             throw new CustomError('CategoryService.counterServicesByCategories', error);
//         }
//     }





// }
