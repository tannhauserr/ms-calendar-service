/**
 * Regla para validar si un rango cae dentro de alguna ventana de trabajo.
 */
export class WorkspaceHoursPolicy {
    /**
     * Devuelve true si [startDate, endDate] está contenido en alguna ventana disponible.
     */
    public static isInsideWindows(
        startDate: Date,
        endDate: Date,
        windows: Array<{ start: Date; end: Date }>
    ): boolean {
        return windows.some((window) => {
            return startDate.getTime() >= window.start.getTime() && endDate.getTime() <= window.end.getTime();
        });
    }
}
