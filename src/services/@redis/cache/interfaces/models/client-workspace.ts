export interface ClientWorkspace {
    id: string;

    name?: string;
    surname1?: string;
    surname2?: string;
    phoneNumber?: string;
    phoneCode?: string;
    image?: string;
    idWorkspaceFk?: string;
    email?: string;
    idClientFk?: string;


    client?: {
        id: string;
        email: string;
        phoneNumber: string;
        languageType?: string;
        allowAppNotifications?: boolean;
        allowEmailNotifications?: boolean;
        allowSmsNotifications?: boolean;
        isBlockedByCompany?: boolean;
        timeZone?: string;
        isBlocked?: boolean;
    }

}