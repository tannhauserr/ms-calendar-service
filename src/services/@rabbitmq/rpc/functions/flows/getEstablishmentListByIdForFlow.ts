import { v4 as uuidv4 } from 'uuid';
import { RabbitRpcService } from '../../rabbit-rpc.service';
import { RabbitMQKeys } from '../../../keys/rabbitmq.keys';
import { ActionPayloads, SubscriberActions } from '../../../actions/rabbitmq.action';
import { TIME_MILLISECONDS, TIME_SECONDS } from '../../../../../constant/time';


export async function getEstablishmentListByIdForFlow(
    idWorkspaceList: string[],

): Promise<any | null> {
    const rabbitRpc = RabbitRpcService.instance;

    try {
        const correlationId = uuidv4();



        //    Se tiene que mandar un array de idWorkspace, también he de crear una key para Redis
        const result: any = await rabbitRpc.sendRpc(
            RabbitMQKeys.handleRpcGetEstablishmentBySearchQueue(),
            SubscriberActions.requestGetWorkspaceBySearch,
            {
                idWorkspaceList,

            } as ActionPayloads['requestGetWorkspaceBySearch'],
            correlationId,
            TIME_MILLISECONDS.SECOND * 8
        );

        return {
            workspaceList: result,
        };
    } catch (error) {
        console.error('Error during RPC calls:', error);
        throw new Error('Error during RPC calls. getCategoriesServicesUserForFlow');
    }
}



export async function getEstablishmentByIdForFlow(
    idWorkspace: string,
): Promise<any | null> {
    const rabbitRpc = RabbitRpcService.instance;

    try {
        const correlationId = uuidv4();


        console.log("idWorkspace", idWorkspace);
        //    Se tiene que mandar un array de idWorkspace, también he de crear una key para Redis
        const result: any = await rabbitRpc.sendRpc(
            RabbitMQKeys.handleRpcGetEstablishmentBySearchQueue(),
            SubscriberActions.requestGetWorkspaceBySearch,
            {
                idWorkspace
            } as ActionPayloads['requestGetWorkspaceBySearch'],
            correlationId,
            TIME_MILLISECONDS.SECOND * 8
        );

        return {
            workspace: result,
        };
    } catch (error) {
        console.error('Error during RPC calls:', error);
        throw new Error('Error during RPC calls. getCategoriesServicesUserForFlow');
    }
}
