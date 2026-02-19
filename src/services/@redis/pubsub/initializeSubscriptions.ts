// @redis/pubsub/initializeSubscriptions.ts

import { RedisSubscriberService } from './redis-subscriber.service';

export const initializeSubscriptionsRedis = async () => {
    await unsubscribeAllChannels();
}


const unsubscribeAllChannels = async () => {
    const redisSubscriberService = RedisSubscriberService.instance;

    try {
        // Obtén todos los canales suscritos
        const channels = await redisSubscriberService.getSubscribedChannels();
        if (channels.length > 0) {
            // Desuscribirse de todos los canales
            for (const channel of channels) {
                await redisSubscriberService.unsubscribe(channel);
                console.log(`Desuscrito del canal: ${channel}`);
            }
        } else {
            console.log('No hay suscriptores activos.');
        }
    } catch (error) {
        console.error('Error al obtener o desuscribirse de los canales:', error);
    }
}
