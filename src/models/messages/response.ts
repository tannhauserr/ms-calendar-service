export class Response {
    static build(message: string, status: number, ok: boolean, item?: any) {
        return { message, ok, status, item }
    }
}


