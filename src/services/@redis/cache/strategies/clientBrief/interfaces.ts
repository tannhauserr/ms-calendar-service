import { ClientWorkspaceBrief } from "../../interfaces/models/client-brief";

/**
 * Estrategia Redis para ClientBrief (cache de clientes con workspace/company data)
 */
export interface IRedisClientWorkspaceBriefStrategy {
    setClientWorkspace(cw: ClientWorkspaceBrief, ttlSec?: number): Promise<void>;

    getClientWorkspaceById(idClientWorkspace: string, idCompany?: string): Promise<ClientWorkspaceBrief | null>;
    getClientWorkspacesByCompany(idCompany: string): Promise<ClientWorkspaceBrief[]>;

    getClientWorkspacesByClientId(idClient: string, idCompany?: string): Promise<ClientWorkspaceBrief[]>;
    getClientWorkspaceByEmail(idCompany: string, email: string): Promise<ClientWorkspaceBrief | null>;
    getClientWorkspaceByPhone(idCompany: string, e164Phone: string): Promise<ClientWorkspaceBrief | null>;

    deleteClientWorkspace(
        idClientWorkspace: string,
        idCompany: string,
        email?: string,
        phoneE164?: string
    ): Promise<void>;
}
