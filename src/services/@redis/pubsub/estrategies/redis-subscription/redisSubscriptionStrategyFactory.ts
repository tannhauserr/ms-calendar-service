

import { ActionKeys, ActionPayloads } from "../../action/subscription.action";
import { RedisSubscriptionStrategy } from "./unique-strategy/RedisSubscriptionStrategy";

export class RedisSubscriptionStrategyFactory {
    private static strategy: RedisSubscriptionStrategy = new RedisSubscriptionStrategy();

    public static async execute<K extends ActionKeys>(
        actionType: 'publish' | 'subscribe',
        channelKey: K,
        payloadOrCallback: ActionPayloads[K] | ((message: ActionPayloads[K]) => void)
    ): Promise<void> {
        switch (actionType) {
            case 'publish':
                if (typeof payloadOrCallback === 'function') {
                    throw new Error('Se esperaba un payload de tipo objeto para publicar.');
                }
                await this.strategy.publish(channelKey, payloadOrCallback);
                break;
            case 'subscribe':
                if (typeof payloadOrCallback !== 'function') {
                    throw new Error('Se esperaba un callback de tipo función para suscribirse.');
                }
                await this.strategy.subscribe(channelKey, payloadOrCallback);
                break;
            default:
                throw new Error(`Acción no soportada: ${actionType}`);
        }
    }
}
