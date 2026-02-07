// ────────────────────────────────────────────────────────────
// Tipos del endpoint
// ────────────────────────────────────────────────────────────
export type AttendeeSelection = {
    serviceId: string;
    durationMin: number;             // duración del servicio en minutos
    staffId?: string | null;         // null = “cualquiera”
    categoryId?: string;             // si necesitas mapear usuarios por categoría
};

export type GetAvailableDaysInput = {
    idCompany: string;
    idWorkspace: string;
    timezone: string; // tz del negocio o para presentar (usa la del workspace)
    range: { start: string; end: string }; // YYYY-MM-DD
    attendees: AttendeeSelection[];        // 1 servicio por elemento (como en tu store)
    excludeEventId?: string;               // para edición
    idClient?: string;
};



export type DayAvailabilityStatus = "available" | "completed" | "dayoff";

export type DayStatus =
    | "available"
    | "dayoff"        // nadie trabaja ese día
    | "completed"     // trabajan pero no queda hueco válido
    | "past"          // día en el pasado
    | "out_of_window" // fuera de bookingWindow
    | "no_staff"      // no hay profesionales válidos
    | "no_services";  // input sin servicios

export type DayFlag = {
    date: string;
    hasSlots: boolean;
    capacity: number; // cantidad de huecos disponibles
    status: DayAvailabilityStatus;
};



export type EventRow = {
    id: string | number;
    idUserPlatformFk: string;
    startDate: Date;
    endDate: Date;
};
