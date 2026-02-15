// Recurrencia deshabilitada temporalmente.
// Este archivo se deja como placeholder para evitar compilación de lógica legacy.

export class AllStrategy {
    async handleImmediate(): Promise<string> {
        return "";
    }

    async handleBackground(): Promise<void> {
        return;
    }

    async handleWindow(): Promise<void> {
        return;
    }
}
