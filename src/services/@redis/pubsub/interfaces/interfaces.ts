import { ActionKeys, ActionPayloads } from "../action/subscription.action";

export interface IRedisSubscriptionStrategy {
    subscribe<K extends ActionKeys>(channelKey: K, callback: (message: ActionPayloads[K]) => void): Promise<void>;
    publish<K extends ActionKeys>(channelKey: K, message: ActionPayloads[K]): Promise<void>;
}
