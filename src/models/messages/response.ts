export class Response {
    static build(message: string, status: number, ok: boolean, item?: any, code?: string) {
        return { message, ok, status, item, code}
    }
}


