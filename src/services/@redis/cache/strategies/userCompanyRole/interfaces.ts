export interface IRedisUserCompanyRoleStrategy {
    setUserCompanyRole(
        userId: string,
        idCompany: string,
        roleType: string,
        isReal: boolean,
        ttl?: number
    ): Promise<void>;

    getUserCompanyRole(
        userId: string
    ): Promise<{ userId: string; idCompany: string; roleType: string; isReal: boolean } | null>;

    deleteUserCompanyRole(userId: string): Promise<void>;
}
