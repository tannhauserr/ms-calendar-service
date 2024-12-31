// Interfaz principal del objeto de respuesta
export interface GetCategoriesAndServicesResponse {
    categories: Category[];
    users: TransformedUser[];
    establishment: {
        id: string;
        code: string;
        idCompanyFk: string;
        name: string;
        address: string;
        timeZone: string;
    };
}

// Interfaz para Categoría
export interface Category {
    id: string;
    name: string;
    services: Service[];
}

// Interfaz para Servicio
// export interface Service {
//     id: number;
//     name: string;
//     duration: number;
//     price: number;
//     users: User[];
// }
export interface Service {
    id: string;
    name: string;
    duration: number;
    price: number;
    userServices: UserService[];
    // Posteriormente, después de procesar los datos, 'userServices' se reemplazará por 'users'
    users?: User[]; // Opcional, se agregará después del procesamiento
}

// Interfaz para UserService
export interface UserService {
    idUserFk: string;
}

// Interfaz para Servicio (después del procesamiento)
export interface ProcessedService {
    id: string
    name: string;
    duration: number;
    price: number;
    users: User[];
}

// Interfaz para Usuario (dentro de Servicio)
export interface User {
    id: string;
    name: string;
    lastName: string;
    image: string | null;
}

// Interfaz para Usuario Transformado (con horarios)
export interface TransformedUser {
    id: string;
    name: string;
    lastName: string;
    image: string | null;
    hourBusiness: HourBusiness;
    temporaryBusinessHours: TemporaryBusinessHour[];
}

// Interfaz para los horarios de trabajo (hourBusiness)
export interface HourBusiness {
    Mon: TimeRange[];
    Tue: TimeRange[];
    Wed: TimeRange[];
    Thu: TimeRange[];
    Fri: TimeRange[];
    Sat: TimeRange[];
    Sun: TimeRange[];
}

// Interfaz para un rango de tiempo (inicio y fin)
export type TimeRange = [string, string];

// Interfaz para los horarios temporales
export interface TemporaryBusinessHour {
    date: string; // Fecha en formato 'YYYY-MM-DD'
    startTime: string | null; // Hora de inicio en formato 'HH:MM'
    endTime: string | null; // Hora de fin en formato 'HH:MM'
    closed: boolean;
}