import { HandleDeleteCompanyAction, HandleUserAction } from "../interfaces/action.interface";

// Definimos los payloads que las acciones pueden llevar
export interface ActionPayloads {
    requestAvailableAppointments: { userId: string; dateRange: string };
    responseAvailableAppointments: { userId: string; availableAppointments: string[] };

    handleUser: HandleUserAction;
    handleDeleteCompany: HandleDeleteCompanyAction;

}

// Acciones asociadas a eventos genéricos de RabbitMQ
export const SubscriberActions = {
    requestAvailableAppointments: 'requestAvailableAppointments',
    responseAvailableAppointments: 'responseAvailableAppointments',

    handleUser: 'handleUser',

    // TODO: Cuando se borra la compañia, hay que "borrar" todas las relaciones
    handleDeleteCompany: 'handleDeleteCompany',

} as const;

// Tipos derivados
export type ActionKeys = keyof typeof SubscriberActions;
export type ActionTypes = typeof SubscriberActions[ActionKeys];
