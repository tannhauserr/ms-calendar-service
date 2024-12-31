import { HandleDeleteCompanyAction, HandleUserAction } from "../interfaces/action.interface";

// Definimos los payloads que las acciones pueden llevar
export interface ActionPayloads {
    requestAvailableAppointments: { userId: string; dateRange: string };
    responseAvailableAppointments: { userId: string; availableAppointments: string[] };

    handleUser: HandleUserAction;
    handleDeleteCompany: HandleDeleteCompanyAction;



    /**
    * Recibe las categorias y los servicios de un establecimiento en concreto
    * MS-Chat - MS-Calendar - MS-Login
    */
    requestGetCategoryServiceUserForFlow: { idEstablishment: string };

    /**
     * Recibe los horarios disponibles de un establecimiento en concreto
     * MS-Chat - MS-Calendar
     */
    requestGetAvaiableTimeSlotsForFlow: {
        idCompany: string,
        timeService: number,
        idCategory: number,
        idService: number,
        daysAhead: number,
        idEstablishment?: string,
        codeEstablishment?: string,
        date: string,
        idUser: string,
        establishmentTimeZone: string
    };


    /**
    * Añade un evento al calendario
    * MS-Chats - MS-Calendar
    */
    requestAddEventToCalendar: {
        idUser: string,
        idClient: string,
        idCompany: string,
        idEstablishment: string,
        idService: string,
        date: string,
        eventStart: string,
        eventEnd: string
    };


}

// Acciones asociadas a eventos genéricos de RabbitMQ
export const SubscriberActions = {
    requestAvailableAppointments: 'requestAvailableAppointments',
    responseAvailableAppointments: 'responseAvailableAppointments',

    handleUser: 'handleUser',

    // TODO: Cuando se borra la compañia, hay que "borrar" todas las relaciones
    handleDeleteCompany: 'handleDeleteCompany',

    requestGetCategoryServiceUserForFlow: 'requestGetCategoryServiceUserForFlow',
    requestGetAvaiableTimeSlotsForFlow: 'requestGetAvaiableTimeSlotsForFlow',
    requestAddEventToCalendar: 'requestAddEventToCalendar',



} as const;

// Tipos derivados
export type ActionKeys = keyof typeof SubscriberActions;
export type ActionTypes = typeof SubscriberActions[ActionKeys];
