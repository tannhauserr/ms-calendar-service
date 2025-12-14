
// ─────────────────────────────────────────────────────────────
// Payload genérico para pedir borrados (soft/hard) al sistema
// ─────────────────────────────────────────────────────────────

/**
 * Tablas/escenarios soportados por el sistema de borrado.
 *
 * Nota:
 * - "SOFT DELETE": se marca con deletedDate / isDeleted.
 * - "HARD DELETE": se elimina físicamente el registro.
 */
export type DeleteRecordsTable =
    // SOFT DELETE — Cuando se decide borrar un cliente
    | "clients"
    // SOFT DELETE — Cuando se decide borrar una empresa
    | "companies"
    // SOFT DELETE — Cuando se decide borrar un establecimiento (workspace)
    | "workspaces"
    // SOFT DELETE — Cuando se decide borrar un usuario
    | "users"
    // SOFT DELETE — Limpieza de relaciones cliente ←→ workspace
    | "clientWorkspaces"
    // HARD DELETE (caso especial) — Cuando se decide borrar de forma definitiva
    // los eventos de un usuario (normalmente eventos futuros)
    | "usersEventDeleteDefinitive"
    // HARD DELETE — Borrado definitivo de eventos (se espera que sean futuros sin enviar) de calendario
    | "calendarEvents"
    // HARD DELETE — Borrado de relaciones usuario ←→ workspace,
    // filtrando por workspace (se expulsan usuarios de un workspace)
    | "userWorkspaces-byWorkspace"
    // HARD DELETE — Borrado de relaciones usuario ←→ workspace,
    // filtrando por usuario (se saca a un usuario de todos los workspaces)
    | "userWorkspaces-byUser";


/**
 * Mensaje que se envía al sistema de "delete-records"
 * para pedir borrados masivos.
 */
export interface RequestDeleteRecords {
    table: DeleteRecordsTable; // Qué conjunto lógico queremos borrar
    ids: string[];             // IDs principales a borrar (según la tabla)
    idRelation?: string;       // ID de relación si aplica (ej: idWorkspace, idUser, etc.)
}