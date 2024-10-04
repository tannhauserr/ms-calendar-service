import { IRedisSubscriptionStrategy } from "../../../interfaces/interfaces";

import { RedisPublisherService } from "../../../redis-publisher.service";
import { RedisSubscriberService } from "../../../redis-subscriber.service";
import { ActionKeys, ActionPayloads, SubscriberActions } from "../../../action/subscription.action";


export class RedisSubscriptionStrategy implements IRedisSubscriptionStrategy {
    private subscriberService = RedisSubscriberService.instance;
    private publisherService = RedisPublisherService.instance;

    async subscribe<K extends ActionKeys>(channelKey: K, callback: (message: ActionPayloads[K]) => void): Promise<void> {
        const channel = SubscriberActions[channelKey];
        await this.subscriberService.subscribe(channel, (message) => {
            const parsedMessage: ActionPayloads[K] = JSON.parse(message);
            callback(parsedMessage);
        });
    }

    async publish<K extends ActionKeys>(channelKey: K, message: ActionPayloads[K]): Promise<void> {
        const channel = SubscriberActions[channelKey];
        await this.publisherService.publish(channel, JSON.stringify(message));
    }
}
