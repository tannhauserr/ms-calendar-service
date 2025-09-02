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
};

export type DayFlag = { date: string; hasSlots: boolean, capacity?: number };

export type EventRow = {
    id: string | number;
    idUserPlatformFk: string;
    startDate: Date;
    endDate: Date;
};