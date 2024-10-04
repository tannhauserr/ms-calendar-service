// @redis/pubsub/initializeSubscriptions.ts

import {
    createEventGoogleSubscription,
    deleteEventGoogleSubscription,
    updateEventGoogleSubscription
} from './estrategies/redis-subscription/subscriptions';
import { RedisSubscriptionStrategyFactory } from './estrategies/redis-subscription/redisSubscriptionStrategyFactory';
import { RedisSubscriberService } from './redis-subscriber.service';

export const initializeSubscriptionsRedis = async () => {
    const redisSubscriberService = RedisSubscriberService.instance;
    const SSFactory = RedisSubscriptionStrategyFactory;


    await unsubscribeAllChannels();

    // Ejemplo de suscripción al canal 'removeUserFromCalendar'
    // SSFactory.execute('subscribe', 'removeUserFromCalendar', async (message) => {
    //     console.log(`Mensaje recibido en el canal "${SubscriberActions.removeUserFromCalendar}": ${message}`);
    //     const { idUser, emailGoogle, idCalendarGoogle } = message;

    //     try {
    //         // Eliminar el usuario del servicio de calendario de usuario
    //         const userCalendarService = new UserCalendarService();
    //         await userCalendarService.deleteUserCalendarMassive([idUser], idCalendarGoogle);
    //         console.log(`Usuario ${idUser} eliminado del calendario ${idCalendarGoogle} en el servicio local.`);

    //         // Eliminar el usuario del Google Calendar
    //         const calendarGoogleService = new CalendarGoogleApiService();
    //         await calendarGoogleService.removeUserFromCalendar(idCalendarGoogle, emailGoogle);
    //         console.log(`Usuario ${emailGoogle} eliminado del calendario ${idCalendarGoogle} en Google Calendar.`);

    //     } catch (error: any) {
    //         console.error(`Error al procesar la eliminación del usuario ${idUser} del calendario ${idCalendarGoogle}:`, error);
    //         new CustomError('ISR.removeUserFromCalendar', error, 'simple');
    //     }
    // });

    // // Agregar más suscripciones según sea necesario
    // SSFactory.execute('subscribe', 'addUserToCalendar', (message) => {
    //     console.log(`Mensaje recibido en el canal "${SubscriberActions.addUserToCalendar}": ${message}`);
    //     const { idUser, emailGoogle, idCalendarGoogle } = message;
    //     // Lógica para agregar al usuario al calendario
    // });

    // Puedes agregar más suscripciones aquí de la misma manera...

    // Inicializa la suscripción para 'createEventGoogle'
    createEventGoogleSubscription();
    // Inicializa la suscripción para 'updateEventGoogle'
    updateEventGoogleSubscription();
    // Inicializa la suscripción para 'deleteEventGoogle'
    deleteEventGoogleSubscription();

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