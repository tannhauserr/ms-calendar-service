// import { Service } from "@prisma/client";
import { RoleType } from "../../../models/interfaces/role-type";
import { EventForBackend } from "../../@database/event/dto/EventForBackend";
import { SendLogPayload } from "../interfaces";
import { HandleDeleteCompanyAction, HandleUserAction } from "../interfaces/action.interface";
import { RequestNotificationPayload } from "../pubsub/interfaces";
import { ServiceForEvent } from "../../@database/service/dto/my-service";

// Definimos los payloads que las acciones pueden llevar
export interface ActionPayloads {
    requestAvailableAppointments: { userId: string; dateRange: string };
    responseAvailableAppointments: { userId: string; availableAppointments: string[] };

    handleUser: HandleUserAction;
    handleDeleteCompany: HandleDeleteCompanyAction;


    // TODO: Nuevo 10 de junio 2025
    // id el establecimiento e id del cliente (general). Se guardará el cliente del establecimiento en Redis
    requestGetCliensByIdClientListAndIdWorkspace: { idWorkspace: string; idClientList: string[], idCompany?: string };
    /**
    * Recibe las categorias y los servicios de un establecimiento en concreto
    * MS-Chat - MS-Calendar - MS-Login
    */
    requestGetCategoryServiceUserForFlow: { idWorkspace: string };

    /**
     * Recibe los horarios disponibles de un establecimiento en concreto
     * MS-Chat - MS-Calendar
     */
    requestGetAvaiableTimeSlotsForFlow: {
        idCompany: string,
        timeService: number,
        idCategory: string,
        idService: string,
        daysAhead: number,
        idWorkspace?: string,
        codeWorkspace?: string,
        date: string,
        idUser: string,
        workspaceTimeZone: string,
        // Usado para editar. Es para no contar el evento a la hora de dar los tiempos etc
        idEventPrevent?: string,
    };

    /**
   * Recibe los eventos activos de un cliente
   * MS-Chat - MS-Calendar
   */
    requestGetEventsClientForFlow: {
        idClient: string;
        idClientWorkspace: string;
        type: "all" | "active" | "past";
    }


    /**
    * Añade un evento al calendario
    * MS-Chats - MS-Calendar
    */
    /**
   * Maneja un evento en el calendario (Añadir, Actualizar o Eliminar)
   * MS-Chats - MS-Calendar
   */
    requestManageEventToCalendar:
    | {
        type: 'add';
        payload: {
            idUserList: string[],
            idClient: string;
            idClientWorkspace: string;
            idCompany: string;
            idWorkspace: string;
            idService: string;
            date: string;
            eventStart: string;
            eventEnd: string;
            commentClient: string;
        };
    }
    | {
        type: 'update';
        payload: {
            idEvent: string; // ID del evento a actualizar
            idUserList: string[],
            idClient: string;
            idClientWorkspace: string;
            idCompany: string;
            idWorkspace: string;
            idService: string;
            date: string;
            eventStart: string;
            eventEnd: string;
            commentClient: string;
        };
    }
    | {
        type: 'delete';
        payload: {
            idEvent: string; // ID del evento a eliminar
            commentClient?: string;
        };
    };


    requestNotification: RequestNotificationPayload;


    // MS-Login - Ms-Category
    requestCheckUserRole: {
        idUser: string; // ID del usuario
        roleType: RoleType; // Ej: "ROLE_ADMIN", "ROLE_DEVELOPER", ...
        idCompany?: string; // Opcional, solo se usa si no es rol administrativo
    };
    // MS-Login - Ms-Category
    responseCheckUserRole: {
        isValid: boolean;
        message: string;
    };

    // Ms-Log
    requestSendLog: SendLogPayload;

    // MS-Login - Ms-Calendar - MsClient - Ms-Notification
    // Payload para eliminar registros de una tabla
    requestDeleteRecords: {
        table: 'clients'
        | 'companies'
        | 'workspaces'
        | 'users'
        | 'clientWorkspaces'
        | 'userWorkspaces-byWorkspace'
        | 'userWorkspaces-byUser'
        | 'calendarEvents'
        ;
        ids: string[]; // Array de IDs a borrar
        idRelation?: string; // ID de la relación si es necesario
    };

    // Usado solo en MS-Calendar
    requestRecurrenceJob: {
        type: "CREATE_SERIES" | "SPLIT_THIS" | "SPLIT_FUTURE" | "SPLIT_ALL";
        payload: EventForBackend;
        amount: number; // Cantidad de eventos a procesar, usado para SPLIT_FUTURE/SPLIT_ALL
        idRecurrence?: string; // opcional para SPLIT_FUTURE/SPLIT_ALL
    };

    // // Usado solo en MS-Calendar y MS-BookingPage
    requestUpdateServiceInEvent: {
        payload: ServiceForEvent
    }


    /**
   * Obtiene los establecimientos mediante una busqueda
   * MS-Chat - MS-Login - MS-Calendar
   */
    requestGetWorkspaceBySearch: {
        idWorkspace?: string,
        idWorkspaceList?: string[],
        filter?: {
            idCategoryBusiness: string,
            city?: string,
            nameWorkspace?: string
        }
    };




}

// Acciones asociadas a eventos genéricos de RabbitMQ
export const SubscriberActions = {
    requestAvailableAppointments: 'requestAvailableAppointments',
    responseAvailableAppointments: 'responseAvailableAppointments',

    handleUser: 'handleUser',
    requestGetCliensByIdClientListAndIdWorkspace: 'requestGetCliensByIdClientListAndIdWorkspace',
    // TODO: Cuando se borra la compañia, hay que "borrar" todas las relaciones
    handleDeleteCompany: 'handleDeleteCompany',

    requestGetCategoryServiceUserForFlow: 'requestGetCategoryServiceUserForFlow',
    requestGetAvaiableTimeSlotsForFlow: 'requestGetAvaiableTimeSlotsForFlow',
    requestGetEventsClientForFlow: 'requestGetEventsClientForFlow',

    requestManageEventToCalendar: 'requestManageEventToCalendar',

    // MS-Login - Ms-Category
    requestCheckUserRole: "requestCheckUserRole",
    // MS-Login - Ms-Category
    responseCheckUserRole: "responseCheckUserRole",

    // Ms-Log
    requestSendLog: "requestSendLog",

    // MS-Login - Ms-Calendar - MsClient - Ms-Notification
    requestDeleteRecords: "requestDeleteRecords",

    // Usado solo en MS-Calendar
    requestRecurrenceJob: "requestRecurrenceJob",

    // // Usado solo en MS-Calendar y MS-BookingPage
    requestUpdateServiceInEvent: "requestUpdateServiceInEvent",

    // Usado en MS-Login - MS-Calendar - MS-Chat
    requestGetWorkspaceBySearch: "requestGetWorkspaceBySearch",

} as const;

// Tipos derivados
export type ActionKeys = keyof typeof SubscriberActions;
export type ActionTypes = typeof SubscriberActions[ActionKeys];
