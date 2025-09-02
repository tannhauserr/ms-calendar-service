import axios from "axios";
import crypto from "crypto";
import CustomError from "../../models/custom-error/CustomError";

type WorkspaceOp = "all" | "meta" | "users" | "catalog";

export class NextJsService {
    private nextUrl: string;
    private bearer: string;
    private useHmac: boolean;
    private hmacSecret?: string;

    constructor() {
        // En Docker: http://next:3000  (NO uses la IP pública)
        this.nextUrl = process.env.URL_NEXTJS?.replace(/\/+$/, "") || "http://next:3000";
        this.bearer = process.env.REVALIDATE_TOKEN || "";
        // Activa HMAC si defines el secreto
        this.hmacSecret = process.env.REVALIDATE_HMAC_SECRET;
        this.useHmac = Boolean(this.hmacSecret);
    }



    public buildHeader(body: any) {
        const headers: Record<string, string> = {
            "Authorization": `Bearer ${this.bearer}`,
            "Content-Type": "application/json",
            "x-rbc-origin": "gateway",
        };

        // Firma opcional HMAC (anti-replay)
        if (this.useHmac && this.hmacSecret) {
            const ts = new Date().toISOString();
            const payload = ts + JSON.stringify(body);
            const mac = crypto.createHmac("sha256", this.hmacSecret).update(payload).digest("base64");
            headers["X-RBC-Timestamp"] = ts;
            headers["X-RBC-Signature"] = `sha256=${mac}`;
        }

        return headers;
    }

    /**
     * Revalida por TAGS un workspace (scoped):
     * - op: "all" | "meta" | "users" | "catalog"
     * - idWorkspace: obligatorio
     * - idCompany: opcional (si también taggeas por empresa)
     */
    public async revalidateWorkspace(op: WorkspaceOp, idWorkspace: string, idCompany?: string): Promise<void> {
        try {
            const url = `${this.nextUrl}/api/revalidate`;

            const body = {
                area: "workspace",
                op,
                idWorkspace,
                ...(idCompany ? { idCompany } : {}),
            };

            // Headers base
            const headers = this.buildHeader(body);

            const response = await axios.post(url, body, { headers, timeout: 5000 });

            if (response.status !== 200 || response.data?.revalidated !== true) {
                throw new Error(`Revalidate failed: ${response.status} ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            throw new CustomError("NextJsService.revalidateWorkspace", error);
        }
    }
}
