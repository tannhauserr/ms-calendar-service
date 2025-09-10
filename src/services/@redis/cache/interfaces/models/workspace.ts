import { OnlineBookingConfig } from "./booking-config";

export interface Workspace {
    id: string;
    code: string;
    name: string;
    formattedAddress: string;
    idCompany: string;
    image: string;
    timeZone: string;
    config?: OnlineBookingConfig;
}
