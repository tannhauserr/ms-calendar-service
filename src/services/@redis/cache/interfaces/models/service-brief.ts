// service-brief.ts

export interface ServiceCategoryBrief {
    id: string;
    name: string;
    color: string;
}

export interface ServiceCategoryAssignment {
    position: number;
    category: ServiceCategoryBrief;
}

export interface ServiceUserAssignment {
    idUserFk: string;
}

export interface ServiceBrief {
    id: string;
    idCompanyFk: string;
    idWorkspaceFk: string;
    name: string;
    description: string;
    duration: number;
    price: number;
    discount: number;
    color: string;
    image: string | null;
    isVisible: boolean;
    serviceType: string;
    maxParticipants: number;
    moderationStatusType: string;
    createdDate: Date;
    updatedDate: Date;
    
    // Relaciones
    categoryServices: ServiceCategoryAssignment[];
    userServices: ServiceUserAssignment[];
}