import { TIME_SECONDS } from "../../constant/time";
import { avatarWorkerDefault } from "../../models/image/avatar-worker";
import { IRedisSavedBasicInformationToCreateReservationByIdEstablishmentStrategy } from "../../services/@redis/cache/interfaces/interfaces";
import { RedisStrategyFactory } from "../../services/@redis/cache/strategies/redisStrategyFactory";
import { convertToWebPAndResizeBuffer } from "../convertToWebPAndResizeBuffer";
import * as RPC from "../../services/@rabbitmq/rpc/functions";
import * as InformationReservation from "../../models/rabbitmq/getCateroiesAndServicesResponse";


export const getMainDataForAppointmentFlow = async (codeEstablishment: string): Promise<InformationReservation.GetCategoriesAndServicesResponse> => {
    const FACTORY = RedisStrategyFactory.getStrategy("savedBasicInformationToCreateReservationByIdEstablishment") as IRedisSavedBasicInformationToCreateReservationByIdEstablishmentStrategy;

    let object: InformationReservation.GetCategoriesAndServicesResponse | null = null;

    // FACTORY.deleteSavedBasicInformationToCreateReservationByIdEstablishment(codeEstablishment);
    try {
        // Intentamos obtener los datos almacenados en Redis
        object = await FACTORY.getSavedBasicInformationToCreateReservationByIdEstablishment(codeEstablishment);
    } catch (error) {
        console.error("Error al obtener datos de Redis:", error);
        // Podemos decidir si continuamos o lanzamos el error
        // En este caso, continuamos y trataremos de obtener los datos desde RPC
    }

    if (!object) {
        console.log("No se encontraron datos en Redis para el establecimiento:", codeEstablishment);

        try {
            // Obtener categorías, servicios y usuarios a través de RPC
            object = await RPC.getCategoriesServicesUserForFlow(codeEstablishment);
        } catch (error) {
            console.error("Error al obtener datos a través de RPC:", error);
            throw new Error("No se pudo obtener la información necesaria para el flujo");
        }

        if (object) {


            let { categories, users } = object;

            // Validamos que categories y users existan y sean arrays
            if (!Array.isArray(categories) || !Array.isArray(users)) {
                throw new Error("Datos inválidos recibidos desde RPC");
            }

            // Procesar las imágenes de los usuarios de forma asincrónica usando Promise.all
            users = await Promise.all(users.map(async user => {
                let img = avatarWorkerDefault || ""; // Imagen por defecto

                if (user.image) {
                    try {
                        img = await convertToWebPAndResizeBuffer(user.image, avatarWorkerDefault);
                    } catch (error) {
                        console.error(`Error al procesar la imagen del usuario ${user.id}:`, error);
                        // Podrías asignar una imagen por defecto o dejar la imagen existente
                    }
                }

                return {
                    ...user,
                    image: img,
                };
            }));

            // Asociar usuarios con servicios
            categories.forEach(category => {
                if (category && Array.isArray(category.services)) {
                    category.services.forEach(service => {
                        if (service && Array.isArray(service.userServices)) {
                            service.users = service.userServices.map(userService => {
                                return users.find(user => user.id === userService.idUserFk);
                            }).filter(user => user !== undefined) as InformationReservation.User[];
                            delete service.userServices; // Limpiar datos innecesarios
                        } else {
                            service.users = [];
                        }
                    });
                }
            });



            // Asignar los usuarios procesados de vuelta al objeto
            object.users = users;


            try {
                await FACTORY.setSavedBasicInformationToCreateReservationByIdEstablishment(codeEstablishment, object, TIME_SECONDS.HOUR * 2);
            } catch (error) {
                console.error("Error al guardar datos en Redis:", error);
                // Podemos continuar sin lanzar el error, ya que los datos se han obtenido correctamente
            }
        } else {
            throw new Error("No se recibieron datos válidos desde RPC");
        }
    } else {
        console.log("Datos obtenidos de Redis para el establecimiento:", codeEstablishment);
    }

    // console.log("Datos para el init:", object);

    return object;
}