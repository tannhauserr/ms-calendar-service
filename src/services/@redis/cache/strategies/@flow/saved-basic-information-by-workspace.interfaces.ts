import { GetCategoriesAndServicesResponse } from "../../../../../models/rabbitmq/getCateroiesAndServicesResponse";

/**
 * Ms-Chat, Ms-Login y Ms-Calendar
 * Mantiene informacion como categorias, servicios y usuarios para un establecimiento en concreto.
 */
export interface IRedisSavedBasicInformationToCreateReservationByIdWorkspaceStrategy {
    setSavedBasicInformationToCreateReservationByIdWorkspace(
        idWorkspace: string,
        data: GetCategoriesAndServicesResponse,
        ttl?: number
    ): Promise<void>;

    getSavedBasicInformationToCreateReservationByIdWorkspace(
        idWorkspace: string
    ): Promise<GetCategoriesAndServicesResponse | null>;

    deleteSavedBasicInformationToCreateReservationByIdWorkspace(idWorkspace: string): Promise<number>;
}
