// booking-config.ts

/** DeepPartial que respeta arrays */
export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[K] extends object
    ? DeepPartial<T[K]>
    : T[K];
};

// ---- Literales seguros (evitan ensanchado a string)
export const BUILTIN_FIELDS = ["name", "email", "phone", "notes"] as const;
export type BuiltinFormField = (typeof BUILTIN_FIELDS)[number];

// ---- Enums y tipos base
export type ResourceFilterMode = "all" | "allowlist" | "denylist" | "blocklist";
export type AlignMode = "clock" | "service";
export type NotificationChannel = "email" | "whatsapp" | "sms";
export type PaymentProvider = "none" | "stripe"; // amplía si hace falta

// Helper: array con máximo 6 elementos (en tiempo de tipos)
export type MaxSix<T> =
    | []
    | [T]
    | [T, T]
    | [T, T, T]
    | [T, T, T, T]
    | [T, T, T, T, T]
    | [T, T, T, T, T, T];

// ---- Secciones
export interface WeightedResource {
    id: string;     // UUID del staff
    weight: number; // 0..100
}

export interface ResourcesConfig {
    mode: ResourceFilterMode;
    ids: WeightedResource[];
}

export interface ServicesConfig {
    mode: ResourceFilterMode;
    /**
     * Mapa categoría -> lista de servicios seleccionados en esa categoría.
     * Permite que un mismo servicio aparezca en varias categorías.
     */
    selectionsByCategory: Record<string, string[]>;
}

export interface SlotConfig {
    /** para modo clock; en modo service no se usa visualmente */
    stepMinutes: 10 | 15 | 20 | 30 | 60 | number;
    /** solo aplica si alignMode === "clock" */
    alignToClock: boolean;
    /** buffers opcionales (si no los usas, déjalos en 0) */
    bufferBeforeMin: number;
    bufferAfterMin: number;
    /** "service" = encadena por duración real; "clock" = rejilla fija */
    alignMode: AlignMode;
}

export interface BookingWindowConfig {
    minLeadTimeMin: number; // antelación mínima
    maxAdvanceDays: number; // a cuántos días vista
    sameDayCutoffHourLocal: number; // 0..23
}

export interface LimitsConfig {
    perUserPerDay: number;
    perUserConcurrent: number;
    maxServicesPerBooking: number;
}

export interface ExtraQuestion {
    key: string; // ej: "refCode"
    label: string; // ej: "Código de referencia"
    type: "text" | "textarea" | "number" | "select" | "checkbox" | "date";
    required?: boolean;
    options?: string[]; // para selects
}

export interface FormConfig {
    ask: BuiltinFormField[];
    required: BuiltinFormField[];
    extraQuestions: ExtraQuestion[];
    privacyConsentRequired: boolean;
}

export interface PoliciesConfig {
    allowCancel: boolean;
    cancelMinHours: number;
    allowReschedule: boolean;
    rescheduleMinHours: number;
    noShowPenalty: boolean;

    /** Texto visible al cliente con tu política de cancelación */
    cancellationPolicyText?: string;
    /** URL externa (opcional) con tu política ampliada */
    cancellationPolicyUrl?: string;
}

export interface PaymentsConfig {
    required: boolean;
    provider: PaymentProvider;
    depositPercent: number; // 0..100
    /** ISO 4217 (ej. "EUR","USD","GBP") */
    currencyCode?: string;
}

export interface Reminder {
    when: string; // "24h" | "2h" | "30m" etc.
}

export interface NotificationsConfig {
    channels: NotificationChannel[];
    reminders: Reminder[];
}

export interface UIConfig {
    showAddress: boolean;
    showPhone: boolean;
    labels: {
        event: string;
        service: string;
        staff: string;
    };
    showLinkedin?: boolean;
    showFacebook?: boolean;
    showInstagram?: boolean;
    showX?: boolean;
    showTiktok?: boolean;


    /**
     * Si es true, el cliente puede elegir el profesional en la reserva online.
     * Si es false, se asigna automáticamente sin mostrar lista.
     * Si no se define, el frontend asumirá true por defecto.
     */
    showStaffPicker?: boolean;

    colorTheme?: string; // "light" | "dark" | hex, etc.

    /**
     * Zona horaria en la que se mostrará el calendario online al cliente.
     * Si se omite, el frontend puede hacer fallback a la del workspace.
     * Ej.: "Europe/Madrid", "America/New_York"
     */
    timeZone?: string;
}

export interface OverridesConfig {
    address: {
        enabled: boolean;
        value?: string;
    };
}

export interface I18nConfig {
    locale: string; // ej: "es-ES"
    labels: Record<string, string>; // microcopys opcionales
}

export interface LegalConfig {
    privacyUrl?: string; // URL externa a la política de privacidad
    termsUrl?: string; // URL externa a términos y condiciones
    consentText?: string; // Texto del checkbox de consentimiento (si no pones, usaré uno por defecto del i18n)
}

/** Item de galería superior (banner/carrusel) */
export interface BrandImage {
    src: string; // URL de la imagen
    alt?: string;
    href?: string; // opcional: link al hacer clic
    label?: string; // opcional: texto superpuesto
}

export interface BrandConfig {
    /** Nombre visible del negocio en la cabecera */
    name: string;
    /** Nombre corto opcional (ej. para app PWA) */
    shortName?: string;
    /** Descripción o tagline del negocio */
    description?: string;

    /** URL del logo cuadrado (ideal para avatares y PWA) */
    logoUrl?: string;
    /** Imagen de portada/cabecera rápida (fallback si no hay galería) */
    coverUrl?: string;

    /** Galería superior: 0..6 imágenes para banner/carrusel */
    gallery?: MaxSix<BrandImage>;

    /** Colores de marca (se pueden usar en manifest/tema) */
    themeColor?: string; // ej. "#0ea5e9"
    backgroundColor?: string; // ej. "#ffffff"

    /** Iconos específicos para PWA (manifest.webmanifest) */
    icons?: Array<{
        src: string;
        sizes: string; // "192x192", "512x512"
        type: string; // "image/png"
        purpose?: "any" | "maskable";
    }>;

    /** Config PWA opcional */
    pwa?: {
        display?: "standalone" | "minimal-ui" | "fullscreen";
        orientation?: "any" | "portrait" | "landscape";
    };

    /** SEO por negocio público */
    seo?: {
        title?: string;
        description?: string;
        imageUrl?: string;
        noindex?: boolean;
    };
}

// ---- Config completa
export interface OnlineBookingConfig {
    schemaVersion: 1;
    idCompany: string;
    idWorkspace: string;
    codeWorkspace?: string;

    enabled: boolean;

    brand?: BrandConfig;

    resources: ResourcesConfig;
    services: ServicesConfig;
    slot: SlotConfig;
    bookingWindow: BookingWindowConfig;
    limits: LimitsConfig;
    form: FormConfig;
    policies: PoliciesConfig;

    payments: PaymentsConfig; // aunque no lo uses en UI, mantenlo tipado

    notifications: NotificationsConfig;
    ui: UIConfig;
    overrides: OverridesConfig;
    i18n: I18nConfig;

    legal: LegalConfig;
}

