// src/lib/service-token.client.ts
import axios from "axios";

type CacheEntry = { token: string; exp: number };
const cache = new Map<string, CacheEntry>();

function decodeExp(token: string): number | null {
    try {
        const [, payloadB64] = token.split(".");
        const json = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
        return typeof json.exp === "number" ? json.exp : null;
    } catch { return null; }
}

async function fetchServiceToken(aud: string, sub: string): Promise<string> {
    // TODO: Este no pasa por el GATEWAY
    // const url = `${process.env.SERVICE_ISSUER_URL}/api/ms/internal-token/service/token`;
    const url_internal_token = "/api/ms/internal-token/service/token"
    const url = `${process.env.URL_BACK_MS_GATEWAY}/${process.env.SERVICE_ISSUER_NAME}${url_internal_token}`;
    const { data } = await axios.post(
        url,
        { aud, sub, scope: "internal:read" },
        // { aud, sub, scope: process.env.SERVICE_SCOPE || "internal:read" },
        {
            // headers: { "x-internal-key": process.env.INTERNAL_API_KEY! }, No se manda ya. Docker red privada es suficiente
            timeout: 3000,
        }
    );

    console.log("mira el token 3", data);
    return data.access_token as string;
}

async function getServiceToken(aud: string, sub: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const cached = cache.get(aud);
    console.log("mira el token 1 cache", cached?.token);

    if (cached && cached.exp - now > 30) return cached.token;

    const token = await fetchServiceToken(aud, sub);
    const exp = decodeExp(token) ?? (now + Number(process.env.SERVICE_TOKEN_TTL_SEC || 120));
    cache.set(aud, { token, exp });


    console.log("mira el token 2", token);
    return token;
}

function setAuthorizationHeader(config: { headers?: unknown }, token: string): void {
    const headers = (config.headers ?? {}) as {
        set?: (name: string, value: string) => void;
        Authorization?: string;
    };

    if (typeof headers.set === "function") {
        headers.set("Authorization", `Bearer ${token}`);
    } else {
        headers.Authorization = `Bearer ${token}`;
    }

    config.headers = headers;
}

export function attachServiceAuth(
    instance: ReturnType<typeof axios.create>,
    aud: string,
    sub: string
) {
    instance.interceptors.request.use(async (config) => {
        const tok = await getServiceToken(aud, sub);
        setAuthorizationHeader(config, tok);
        return config;
    });

    instance.interceptors.response.use(undefined, async (error) => {
        const status = error?.response?.status;
        const config = error?.config;
        if ((status === 401 || status === 403) && !config?._retry) {
            config._retry = true;
            cache.delete(aud);
            const tok = await getServiceToken(aud, sub);
            setAuthorizationHeader(config, tok);
            return axios.request(config);
        }
        throw error;
    });
}
