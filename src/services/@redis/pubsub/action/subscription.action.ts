export const KEY_PROJECT = process.env.KEY_PROJECT;

export interface ActionPayloads {
    healthCheck: {
        timestamp: number;
    };
}

export const SubscriberActions = {
    healthCheck: `${KEY_PROJECT}:booking:action:healthCheck`,
} as const;


export type ActionKeys = keyof typeof SubscriberActions;
export type Channels = typeof SubscriberActions[ActionKeys];
