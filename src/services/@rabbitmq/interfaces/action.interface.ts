export interface HandleUserAction {
    user: {
        id?: any,
        email?: any,
        emailGoogle?: any,
        name?: any,
        lastName?: any,
        image?: any,
        companyRoleJson?: string;
        action: 'add' | 'update' | 'delete'
    },
    company: {
        id?: any,
        roleType?: any,
        // TODO: Cuando se borra la compañia, se borra de manera soft del json y un cron se encargará de borrarlo definitivamente
        deletedDate?: any,
        action: 'add' | 'update' | 'delete'
    }
}


export interface HandleDeleteCompanyAction {
    idCompany: string;
}