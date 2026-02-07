export interface EventBrief {
    id: string;
    title: string;
    description?: string;
    startDate: string; // ISO string
    endDate: string; // ISO string
    idUserPlatformFk?: string;
    idServiceFk?: string;
    eventPurposeType: string;
    eventSourceType: string;
    eventStatusType: string;
    allDay: boolean;
    serviceNameSnapshot?: string;
    servicePriceSnapshot?: number;
    serviceDiscountSnapshot?: number;
    serviceDurationSnapshot?: number;
    
    eventParticipant: Array<{
        id: string;
        idClientFk?: string;
        idClientWorkspaceFk?: string;
        eventStatusType: string;
    }>;
}