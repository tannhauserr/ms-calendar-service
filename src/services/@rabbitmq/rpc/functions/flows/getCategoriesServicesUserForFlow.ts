
import { v4 as uuidv4 } from 'uuid';
import { RabbitRpcService } from '../../rabbit-rpc.service';
import { RabbitMQKeys } from '../../../keys/rabbitmq.keys';
import { ActionPayloads, SubscriberActions } from '../../../actions/rabbitmq.action';
import { TIME_MILLISECONDS, TIME_SECONDS } from '../../../../../constant/time';


/**
 * Se usa para agregar datos del clientes a todas las conversaciones obtenidas
 * para una compañía en concreto.
 * 
 * @param idClientList ID del cliente a buscar.
 * @param idCompany ID de la compañía a la que pertenece el cliente.
 * 
 * @returns Promesa que resuelve con el `idClientFk` del nuevo cliente.
 */
export async function getCategoriesServicesUserForFlow(idWorkspace: string): Promise<any | null> {
    const rabbitRpc = RabbitRpcService.instance;

    try {
        const correlationId = uuidv4();
        const correlationId2 = uuidv4();

        console.log("mandando cosas", idWorkspace);

        // Devuelve categorias y servicios de un establecimiento
        const promiseMsCalendar: any = rabbitRpc.sendRpc(
            RabbitMQKeys.handleRpcGetCategoryAndServicesForFlowQueue(),
            SubscriberActions.requestGetCategoryServiceUserForFlow,
            { idWorkspace } as ActionPayloads['requestGetCategoryServiceUserForFlow'],
            correlationId,
            TIME_MILLISECONDS.SECOND * 8
        );

        const promiseMsLogin: any = rabbitRpc.sendRpc(
            RabbitMQKeys.handleRpcGetUserForFlowQueue(),
            SubscriberActions.requestGetCategoryServiceUserForFlow,
            { idWorkspace } as ActionPayloads['requestGetCategoryServiceUserForFlow'],
            correlationId2,
            TIME_MILLISECONDS.SECOND * 8
        );


        const [dataMsCalendar, dataMsLogin] = await Promise.all([promiseMsCalendar, promiseMsLogin]);

        // console.log('getCategoriesAndServices (flows)', dataMsCalendar);
        // console.log('getUsers (flows)', dataMsLogin);
        const { users = [], workspace = { name: '', timeZome: '', address: '' } } = dataMsLogin;

        return {
            categories: dataMsCalendar,
            users,
            workspace
        };
    } catch (error) {
        console.error('Error during RPC calls:', error);
        throw new Error('Error during RPC calls. getCategoriesServicesUserForFlow');
    }
}

