

export interface WorkspaceBrief {
    id: string;
    idCompanyFk: string;

    name: string;
    slug: string | null;
    code: string | null;

    // Contacto / dirección
    email: string;
    phoneCode: string | null;
    phoneNumber: string | null;
    address: string;
    addressComplement: string | null;
    addressNumber: string | null;
    postalCode: string | null;
    province: string;
    city: string;
    country: string;

    // Geo / zona horaria
    latitude: number;
    longitude: number;
    timeZone: string;

    // Estado
    // isPublic: boolean;
    // moderationStatusType: ModerationStatusType;

    // Opcionales UI/portada
    image?: string | null;
    description?: string | null;
    generalConfigJson?: string | null;
    generalNotificationConfigJson?: string | null;
    generalMarketingConfigJson?: string | null;

}


