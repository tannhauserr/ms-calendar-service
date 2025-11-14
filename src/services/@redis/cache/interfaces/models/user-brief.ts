export interface UserBrief {
    id: string;
    email: string;
    name: string;
    surname1?: string | null;
    surname2?: string | null;
    phoneCode?: string | null;
    phoneNumber?: string | null;
    image?: string | null;
    timeZone: string;
    verified: boolean;
    verifiedAt?: string | null;
    idCompanyFk?: string | null;
    idRoleFk: number;
    roleType: string;  
    roleName: string;   
    v: number;          
}
