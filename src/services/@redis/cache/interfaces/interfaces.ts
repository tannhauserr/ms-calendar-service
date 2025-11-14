import { BusinessHoursType } from "../../../../models/interfaces";
import { GetCategoriesAndServicesResponse } from "../../../../models/rabbitmq/getCateroiesAndServicesResponse";
import { HoursRangeInput, HoursMap } from "../../../@database/all-business-services/interfaces";
import { ChannelCalendar } from "../../../caledar-googleapi/interfaces/channel-calendar";
import { UserColorCalendar } from "../../../caledar-googleapi/interfaces/user-color-calendar";
import { BookingPageBrief } from "./models/booking-brief";
import { ServiceBrief } from "./models/service-brief";
import { ClientBrief, ClientWorkspaceBrief } from "./models/client-brief";
import { Workspace } from "./models/workspace";
import { WorkspaceBrief } from "./models/workspace-brief";
import { UserBrief } from "./models/user-brief";



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



export interface IRedisRoundRobinStrategy {
    pickWeightedSmoothRR(params: {
        idWorkspace: string;
        idBookingPage: string;               // ← nuevo ámbito
        idService?: string;
        eligibles: string[];                 // staff ya filtrados por skill + disponibilidad
        weights?: Record<string, number>;    // 0–100 (default 100 si falta)
        stateTTLSec?: number;                // TTL opcional para el estado RR
    }): Promise<string | null>;

    getState(idWorkspace: string, idBookingPage: string, idService: string):
        Promise<Record<string, { weight: number; current: number }>>;
    resetState(idWorkspace: string, idBookingPage: string, idService: string): Promise<void>;

    acquireHold(params: {
        idWorkspace: string;
        idBookingPage: string;
        idService: string;
        startISO: string;
        endISO: string;
        ttlSec?: number;                     // default 60s
    }): Promise<boolean>;
    releaseHold(params: {
        idWorkspace: string;
        idBookingPage: string;
        idService: string;
        startISO: string;
        endISO: string;
    }): Promise<void>;
}


// Brief

export interface IRedisWorkspaceBriefStrategy {
    /**
     * Guarda snapshot de workspace por id.
     */
    setWorkspace(workspace: WorkspaceBrief, ttl?: number): Promise<void>;

    /**
     * Recupera snapshot por id.
     */
    getWorkspaceById(idWorkspace: string): Promise<WorkspaceBrief | null>;

    /**
     * Elimina snapshot.
     */
    deleteWorkspace(idWorkspace: string): Promise<void>;
}


export interface IRedisBookingPageBriefStrategy {
    setBookingPage(page: BookingPageBrief, ttl?: number): Promise<void>;
    getBookingPageById(idBookingPage: string): Promise<BookingPageBrief | null>;
    getBookingPagesByWorkspace(idWorkspace: string): Promise<BookingPageBrief[]>;
    getBookingPageBySlug(idWorkspace: string, slug: string): Promise<BookingPageBrief | null>;
    deleteBookingPage(idBookingPage: string, idWorkspace: string, slug?: string): Promise<void>;
}


export interface IRedisServiceBriefStrategy {
    /**
     * Guarda snapshot de servicio por id, y actualiza índices:
     * - workspace → [serviceIds]
     * - company → [serviceIds]
     * - category → [serviceIds]
     */
    setService(service: ServiceBrief, ttl?: number): Promise<void>;

    /**
     * Recupera snapshot por id.
     */
    getServiceById(idService: string): Promise<ServiceBrief | null>;

    /**
     * Recupera todos los servicios de un workspace.
     */
    getServicesByWorkspace(idWorkspace: string): Promise<ServiceBrief[]>;

    /**
     * Recupera todos los servicios de una company.
     */
    getServicesByCompany(idCompany: string): Promise<ServiceBrief[]>;

    /**
     * Recupera todos los servicios de una categoría.
     */
    getServicesByCategory(idCategory: string): Promise<ServiceBrief[]>;


    /**
     * Recupera todos los servicios únicos de múltiples usuarios.
     */
    getServicesByUsers(userIds: string[]): Promise<ServiceBrief[]>;

    /**
     * Borra snapshot e índices derivados.
     */
    deleteService(idService: string, idWorkspace: string, idCompany: string, categoryIds?: string[], userIds?: string[]): Promise<void>;

    /**
     * Invalida todos los servicios de un workspace.
     */
    invalidateWorkspaceServices(idWorkspace: string): Promise<void>;

    /**
     * Invalida todos los servicios de una company.
     */
    invalidateCompanyServices(idCompany: string): Promise<void>;
}

/**
 * Estrategia Redis para ClientBrief (cache de clientes con workspace data)
 */
export interface IRedisClientWorkspaceBriefStrategy {
    setClientWorkspace(cw: ClientWorkspaceBrief, ttlSec?: number): Promise<void>;

    getClientWorkspaceById(idClientWorkspace: string, idWorkspace?: string): Promise<ClientWorkspaceBrief | null>;
    getClientWorkspacesByWorkspace(idWorkspace: string): Promise<ClientWorkspaceBrief[]>;

    // Índices útiles
    getClientWorkspacesByClientId(idClient: string, idWorkspace?: string): Promise<ClientWorkspaceBrief[]>;
    getClientWorkspaceByEmail(idWorkspace: string, email: string): Promise<ClientWorkspaceBrief | null>;
    getClientWorkspaceByPhone(idWorkspace: string, e164Phone: string): Promise<ClientWorkspaceBrief | null>;

    deleteClientWorkspace(
        idClientWorkspace: string,
        idWorkspace: string,
        email?: string,
        phoneE164?: string
    ): Promise<void>;
}

export interface IRedisUserBriefStrategy {
    /**
     * Guarda un snapshot de usuario en Redis.
     * Además crea índice email → userId.
     */
    setUser(user: UserBrief, ttl?: number): Promise<void>;

    /**
     * Recupera un snapshot de usuario por su ID.
     */
    getUserById(userId: string): Promise<UserBrief | null>;

    /**
     * Recupera un snapshot de usuario por su email.
     */
    getUserByEmail(email: string): Promise<UserBrief | null>;

    /**
     * Elimina el snapshot y el índice email → id.
     */
    deleteUser(userId: string, email: string): Promise<void>;
}
