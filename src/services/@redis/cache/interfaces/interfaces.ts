import { BusinessHoursType } from "../../../../models/interfaces";
import { GetCategoriesAndServicesResponse } from "../../../../models/rabbitmq/getCateroiesAndServicesResponse";
import { HoursRangeInput, HoursMap } from "../../../@database/all-business-services/interfaces";
import { ChannelCalendar } from "../../../caledar-googleapi/interfaces/channel-calendar";
import { UserColorCalendar } from "../../../caledar-googleapi/interfaces/user-color-calendar";
import { Workspace } from "./models/workspace";



export interface IRedisOAuthStrategy {
    setAccessToken(userId: string, token: string, ttl?: number): Promise<void>;
    getAccessToken(userId: string): Promise<string | null>;
    // deleteAccessToken(userId: string): Promise<number>;
    // Otros métodos específicos de la categoría...
}

export interface IRedisChannelClanedarStrategy {
    getChannelCalendar(): Promise<ChannelCalendar>;
    saveChannelCalendar(channelConfig: ChannelCalendar): Promise<void>;
}

export interface IRedisUserColorStrategy {
    getUserColorByIdUser(idUserFk: string): Promise<UserColorCalendar>;
    saveUserColorByIdUser(idUserFk: string, userColor: UserColorCalendar, ttl?: number): Promise<void>;
    deleteUserColorByIdUser(idUserFk: string): Promise<void>;
}

export interface IRedisAvoidSameEventStrategy {
    setEventFromGoogle(eventId: string, ttl?: number): Promise<void>;
    getEventFromGoogle(eventId: string): Promise<string | null>;
}

/**
 * Ms-Chat, Ms-Login y Ms-Calendar
 * Mantiene información como categorias, servicios y usuarios para un establecimiento en concreto
 */
export interface IRedisSavedBasicInformationToCreateReservationByIdWorkspaceStrategy {
    setSavedBasicInformationToCreateReservationByIdWorkspace(idWorkspace: string, data: GetCategoriesAndServicesResponse, ttl?: number): Promise<void>;
    getSavedBasicInformationToCreateReservationByIdWorkspace(idWorkspace: string): Promise<GetCategoriesAndServicesResponse | null>;
    deleteSavedBasicInformationToCreateReservationByIdWorkspace(idWorkspace: string): Promise<number>;
}

/**
 * Usada en getAvailableTimeSlots
 * 
 */
// export interface IRedisBusinessHoursStrategy {
//     getBusinessHours(companyId: string): Promise<BusinessHoursType | null>;
//     saveBusinessHours(companyId: string, businessHours: BusinessHoursType, ttl?: number): Promise<void>;
//     deleteBusinessHours(companyId: string): Promise<void>;
// }
export interface IRedisBusinessHoursStrategy {
    getBusinessHours(workspaceId: string): Promise<BusinessHoursType | null>;
    saveBusinessHours(workspaceId: string, businessHours: BusinessHoursType, ttl?: number): Promise<void>;
    deleteBusinessHours(workspaceId: string): Promise<void>;
}

/**
 * Usada en getAvailableTimeSlots
 */
export interface IRedisWorkerHoursStrategy {
    getWorkerHours(workspaceId: string, userId: string): Promise<{ [weekday: string]: string[][] } | null>;
    saveWorkerHours(workspaceId: string, userId: string, workerHours: { [weekday: string]: string[][] }, ttl?: number): Promise<void>;
    deleteWorkerHours(workspaceId: string, userId: string): Promise<void>;
}


/**
 * Usada en getAvailableTimeSlots
 */
// export interface IRedisTemporaryHoursStrategy {
//     getTemporaryHours(workspaceId: string, userId: string): Promise<{ [date: string]: string[][] } | null>;
//     saveTemporaryHours(workspaceId: string, userId: string, temporaryHours: { [date: string]: string[][] }, ttl?: number): Promise<void>;
//     deleteTemporaryHours(workspaceId: string, userId: string): Promise<void>;
// }

export interface IRedisTemporaryHoursStrategy {
    /**
     * Lee la cache maestra de un usuario desde Redis.
     * - Si NO pasas `range`, devuelve TODO lo cacheado (comportamiento anterior).
     * - Si pasas `range`, devuelve SOLO las fechas dentro del rango (filtrado en memoria).
     * - Si no hay clave en Redis → null.
     */
    getTemporaryHours(
        workspaceId: string,
        userId: string,
        range?: HoursRangeInput
    ): Promise<HoursMap | null>;

    /**
     * Guarda la cache maestra (puede contener múltiples días/rangos acumulados).
     */
    saveTemporaryHours(
        workspaceId: string,
        userId: string,
        temporaryHours: HoursMap,
        ttl?: number
    ): Promise<void>;

    deleteTemporaryHours(workspaceId: string, userId: string): Promise<void>;
}


export interface IRedisUserCompanyRoleStrategy {
    /**
     * Almacena un objeto { userId, idCompany, roleType } en Redis,
     * con un TTL opcional.
     */
    setUserCompanyRole(
        userId: string,
        idCompany: string,
        roleType: string,
        isReal: boolean,
        ttl?: number
    ): Promise<void>;

    /**
     * Obtiene los datos { userId, idCompany, roleType } para el usuario indicado.
     * Retorna null si no existe.
     */
    getUserCompanyRole(
        userId: string
    ): Promise<{ userId: string; idCompany: string; roleType: string } | null>;

    /**
     * Elimina la entrada de Redis para ese userId.
     */
    deleteUserCompanyRole(userId: string): Promise<void>;
}



// Interfaz de la estrategia para guardar el establecimiento en Redis
export interface IRedisSavedWorkspaceStrategy {
    setSavedWorkspaceByIdWorkspace(
        idWorkspace: string,
        codeWorkspace: Workspace,
        ttl?: number
    ): Promise<void>;

    updateSavedWorkspaceByIdWorkspace(
        idWorkspace: string,
        workspace: Workspace,
        ttl?: number
    ): Promise<void>;

    getSavedWorkspaceByIdWorkspace(
        idWorkspace: string
    ): Promise<Workspace | null>;

    getSavedWorkspaceByCode(
        code: string
    ): Promise<Workspace | null>;

    deleteSavedWorkspaceByIdWorkspace(
        idWorkspace: string,
        code?: string | null
    ): Promise<void>;
}
