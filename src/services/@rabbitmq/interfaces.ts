// log

export interface SendLogPayload {
    idCompanyFk?: string;
    idUserFk?: string;
    idClientFk?: string;
    idEventFk?: string;
    description: string;
    origin?: string;
    metadataJson?: string;
    logType: "SYSTEM" | "USER" | "BOOKING" | "OTHER";
    priorityType: "LOWEST" | "LOW" | "MEDIUM" | "HIGH" | "HIGHEST";

}
