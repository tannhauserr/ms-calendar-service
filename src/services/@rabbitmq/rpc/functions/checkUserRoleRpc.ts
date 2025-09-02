import { v4 as uuidv4 } from "uuid";
import { ActionPayloads, SubscriberActions } from "../../actions/rabbitmq.action";
import { RabbitMQKeys } from "../../keys/rabbitmq.keys";
import { RabbitRpcService } from "../rabbit-rpc.service";
import { RoleType } from "../../../../models/interfaces/role-type";


/**
 * Verifica si un usuario tiene un rol determinado (RPC).
 * @param idUser    ID del usuario.
 * @param roleType  Rol a verificar (e.g. "ROLE_ADMIN", "ROLE_DEVELOPER", "ROLE_USER"...).
 * @param idCompany ID de la compañía. Solo necesario si el rol NO es administrativo.
 * @returns         { isValid, message }
 */
export async function checkUserRoleRpc(
    idUser: string,
    roleType: RoleType,
    idCompany?: string
): Promise<{ isValid: boolean; message: string }> {
    
    const correlationId = uuidv4();
    const queueName = RabbitMQKeys.handleRpcCheckUserRoleQueue();

    // Construimos el payload
    const payload: ActionPayloads["requestCheckUserRole"] = {
        idUser,
        roleType,
        idCompany,
    };

    try {
        // Llamamos a sendRpc del RabbitRpcService
        const response = await RabbitRpcService.instance.sendRpc(
            queueName,
            SubscriberActions.requestCheckUserRole, // action
            payload,
            correlationId
        );

        /**
         * Esperamos algo como:
         * {
         *   action: "responseCheckUserRole",
         *   data: {
         *     isValid: boolean,
         *     message: string
         *   }
         * }
         */
        if (!response || !response.data) {
            throw new Error("Respuesta inválida del RPC checkUserRole");
        }

        // Devolvemos los datos
        return response.data;
    } catch (error) {
        console.error("[checkUserRoleRpc] Error RPC:", error);
        throw error;
    }
}
