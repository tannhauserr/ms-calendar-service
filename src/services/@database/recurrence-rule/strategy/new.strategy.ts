// Recurrencia deshabilitada temporalmente.
// Este archivo se deja como placeholder para evitar compilación de lógica legacy.

export class NewStrategy {
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
