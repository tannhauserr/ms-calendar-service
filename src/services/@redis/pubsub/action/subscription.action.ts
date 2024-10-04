export const KEY_PROJECT = process.env.KEY_PROJECT;

export interface ActionPayloads {
    userConnectedToGoogle: { idUser: string; googleAccessToken: string };
    userDisconnectedFromGoogle: { idUser: string };
    addUserToCalendar: { idUser: string; emailGoogle: string, idCalendarGoogle?: string };
    removeUserFromCalendar: { idUser: string; emailGoogle: string, idCalendarGoogle?: string };
    createEventGoogle: {
        idRowEventDB: number;
        idUserPlatformFk: string;
        idGoogleCalendar: string;
        title: string;
        startDate: string;
        endDate: string;
        description?: string;
        eventColor: string;
    };
    updateEventGoogle: {
        idRowEventDB: number;
        idUserPlatformFk: string;
        idGoogleCalendar: string;
        idGoogleEvent: string;
        title: string;
        startDate: string;
        endDate: string;
        description?: string;
        eventColor: string;
    };
    deleteEventGoogle: {
        idUserPlatformFk: string;
        idGoogleCalendar: string;
        idGoogleEvent: string;
    };

}

export const SubscriberActions = {
    userConnectedToGoogle: `${KEY_PROJECT}:booking:action:userConnectedToGoogle`,
    userDisconnectedFromGoogle: `${KEY_PROJECT}:booking:action:userDisconnectedFromGoogle`,
    addUserToCalendar: `${KEY_PROJECT}:booking:action:addUserToCalendar`,
    removeUserFromCalendar: `${KEY_PROJECT}:booking:action:removeUserFromCalendar`,
    createEventGoogle: `${KEY_PROJECT}:booking:action:createEventGoogle`,
    updateEventGoogle: `${KEY_PROJECT}:booking:action:updateEventGoogle`,
    deleteEventGoogle: `${KEY_PROJECT}:booking:action:deleteEventGoogle`,
} as const;


export type ActionKeys = keyof typeof SubscriberActions;
export type Channels = typeof SubscriberActions[ActionKeys];
