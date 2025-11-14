import { OnlineBookingConfig } from "./booking-config";


export type BookingPageStatusType = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface BookingPageSlugHistory {
    oldSlug: string;
}

export interface BookingPageBrief {
    id: string;
    idWorkspaceFk: string;

    code: string;                  // único para /p/:code
    name: string;
    slug: string | null;

    bookingPageStatusType: BookingPageStatusType; // DRAFT | PUBLISHED | ARCHIVED
    
    // SEO fields
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageUrl: string | null;
    seoIndexable: boolean | null;
    seoCanonicalUrl: string | null;
    seoLocale: string | null;

    // Configuration JSONs
    bookingPageConfJson: OnlineBookingConfig;          // configuración completa (guardada como JSON en DB)
    bookingPageNotificationsJson: string | null; // configuración de notificaciones
    bookingPageMarketingJson: string | null;     // configuración de marketing

    // Form and Flow references
    idFormPreFk: string | null;    // formulario pre-booking
    idFormPostFk: string | null;   // formulario post-booking
    idFlowNodeFk: string | null;   // nodo de flujo asociado

    // Slug history (últimos 4 slugs)
    slugs: BookingPageSlugHistory[];
}
