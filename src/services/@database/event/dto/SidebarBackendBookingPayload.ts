
export type EventEditorMode = 'create' | 'edit' | 'view';
export type SidebarBackendEventType = "event" | "block" | "holiday";

export type SidebarBackendService = {
    idEvent: string;
    idService: string;
    duration: number;
    name: string;
    price: number;
    discount: number;
    idWorker: string;
};

export type SidebarBackendClient = {
    idClient: string;
    idClientWorkspace: string;
};

/**
 * Payload esperado por backend desde el sidebar.
 * Nota: `startDate` y `endDate` van en formato ISO string.
 */
export type SidebarBackendBookingPayload = {
    type: SidebarBackendEventType;
    mode: EventEditorMode;

    description?: string;
    eventStatusType?: string;
    commentClient?: string;


    // El id de la reserva (vacío si es nueva)
    idGroup: string;
    
    // IDs necesarios para crear eventos
    idCompany: string;
    idWorkspace: string;
    
    services: SidebarBackendService[];
    clients: SidebarBackendClient[];

    startDate: string;
    endDate: string;

    sendNotification: boolean;
};
