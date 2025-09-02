// rpc-client/getOneClientByWorkspace.rpc.ts

import { ClientWorkspace } from "../../../../@redis/cache/interfaces/models/client-workspace";
import { SubscriberActions, ActionPayloads } from "../../../actions/rabbitmq.action";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { RabbitRpcService } from "../../rabbit-rpc.service";
import { v4 as uuidv4 } from "uuid";

/**
 * Solicita (vía RPC) los datos de un cliente específico en un establecimiento.
 * @param idWorkspace - ID del establecimiento (clave parcial)
 * @param idClientList - ID array de clientes en ese establecimiento
 * @returns Promise con la info del cliente, o un error si no existe
 */
export async function getClientstByIdClientAndIdWorkspace(
    idWorkspace: string,
    idClientList: string[],
): Promise<ClientWorkspace[]> {
    const rpcService = RabbitRpcService.instance;
    const correlationId = uuidv4(); // generar un ID único para la correlación

    // Payload a enviar
    const payload: ActionPayloads["requestGetCliensByIdClientListAndIdWorkspace"] = {
        idWorkspace,
        idClientList, // Enviamos un array con el ID del cliente
    };

    try {
        // Enviar la solicitud RPC y esperar la respuesta
        const result = await rpcService.sendRpc(
            RabbitMQKeys.handleRpcGetClientListByIdsQueue(),
            SubscriberActions.requestGetCliensByIdClientListAndIdWorkspace,
            payload,
            correlationId
        );

        return result; // Contendrá los datos del cliente (o lo que responda el consumer)
    } catch (error) {
        console.error("Error en getOneClientByWorkspace RPC:", error);
        throw error;
    }
}
