import { BusinessHoursType } from "../../../../models/interfaces";
import { GetCategoriesAndServicesResponse } from "../../../../models/rabbitmq/getCateroiesAndServicesResponse";
import { ChannelCalendar } from "../../../caledar-googleapi/interfaces/channel-calendar";
import { UserColorCalendar } from "../../../caledar-googleapi/interfaces/user-color-calendar";



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
export interface IRedisSavedBasicInformationToCreateReservationByIdEstablishmentStrategy {
    setSavedBasicInformationToCreateReservationByIdEstablishment(idEstablishment: string, data: GetCategoriesAndServicesResponse, ttl?: number): Promise<void>;
    getSavedBasicInformationToCreateReservationByIdEstablishment(idEstablishment: string): Promise<GetCategoriesAndServicesResponse | null>;
    deleteSavedBasicInformationToCreateReservationByIdEstablishment(idEstablishment: string): Promise<number>;
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
    getBusinessHours(establishmentId: string): Promise<BusinessHoursType | null>;
    saveBusinessHours(establishmentId: string, businessHours: BusinessHoursType, ttl?: number): Promise<void>;
    deleteBusinessHours(establishmentId: string): Promise<void>;
}

/**
 * Usada en getAvailableTimeSlots
 */
export interface IRedisWorkerHoursStrategy {
    getWorkerHours(companyId: string, userId: string): Promise<{ [weekday: string]: string[][] } | null>;
    saveWorkerHours(companyId: string, userId: string, workerHours: { [weekday: string]: string[][] }, ttl?: number): Promise<void>;
    deleteWorkerHours(companyId: string, userId: string): Promise<void>;
}


/**
 * Usada en getAvailableTimeSlots
 */
export interface IRedisTemporaryHoursStrategy {
    getTemporaryHours(companyId: string, userId: string): Promise<{ [date: string]: string[][] } | null>;
    saveTemporaryHours(companyId: string, userId: string, temporaryHours: { [date: string]: string[][] }, ttl?: number): Promise<void>;
    deleteTemporaryHours(companyId: string, userId: string): Promise<void>;
}


