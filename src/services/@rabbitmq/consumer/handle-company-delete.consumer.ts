import { RabbitMQKeys } from '../keys/rabbitmq.keys';
import { CONSOLE_COLOR } from '../../../constant/console-color';
import { PrismaClient } from '@prisma/client';
import { RabbitMQFacade } from '../facade/rabbitmq.facade';
import { ActionPayloads } from '../actions/rabbitmq.action';

const prisma = new PrismaClient();

export const handleCompanyDeleteConsumer = async (): Promise<void> => {
    const queue = RabbitMQKeys.handleCompanyDeleteQueue();

    try {
        // Aseguramos que la cola esté creada
        await RabbitMQFacade.instance.assertQueue('handleCompanyDeleteQueue');

        // Consumimos mensajes de la cola, con un callback tipado
        await RabbitMQFacade.instance.consumeQueue('handleCompanyDeleteQueue', fn);

        console.log(`Escuchando mensajes en la cola: ${queue}`);
    } catch (error) {
        console.error('Error al procesar la cola:', error);
    }
};

// Función que contiene la lógica de procesamiento de los mensajes
const fn = async (content: any, ack: () => void) => {
    console.log('Mensaje recibido:', content);

    const { idCompany } = content;

    if (!idCompany) {
        console.error('idCompany no proporcionado en el mensaje');
        ack();
        return;
    }

    try {
        await prisma.$transaction(async (txPrisma) => {
            const now = new Date();

            // Actualizar todas las tablas relacionadas con la compañía con soft delete
            // await txPrisma.calendar.updateMany({
            //     where: { idCompanyFk: idCompany },
            //     data: { deletedDate: now }
            // });

            // await txPrisma.userCalendar.updateMany({
            //     where: { calendar: { idCompanyFk: idCompany } },
            //     data: { deletedDate: now }
            // });

            // await txPrisma.userColor.updateMany({
            //     where: { user: { companyRoleJson: { path: ['$[*].id'], equals: idCompany } } },
            //     data: { deletedDate: now }
            // });

            await txPrisma.workerBusinessHour.updateMany({
                where: { idCompanyFk: idCompany },
                data: { deletedDate: now }
            });

            await txPrisma.temporaryBusinessHour.updateMany({
                where: { idCompanyFk: idCompany },
                data: { deletedDate: now }
            });

            // await txPrisma.userService.updateMany({
            //     where: { service: { idCompanyFk: idCompany } },
            //     data: { deletedDate: now }
            // });

            // Procesar usuarios con el idCompany en el campo companyRoleJson
            // const usersWithCompany = await txPrisma.user.findMany({
            //     where: {
            //         companyRoleJson: { path: ['$[*].id'], equals: idCompany }
            //     }

            // });

            // for (const user of usersWithCompany) {
            //     let companyRoles: any[] = [];

            //     // Verificamos si companyRoleJson es un string antes de usar JSON.parse
            //     if (typeof user.companyRoleJson === 'string') {
            //         companyRoles = JSON.parse(user.companyRoleJson);
            //     } else if (Array.isArray(user.companyRoleJson)) {
            //         // Si ya es un array (JsonArray), lo asignamos directamente
            //         companyRoles = user.companyRoleJson;
            //     } else {
            //         // Si companyRoleJson es null o de un tipo inesperado, lo tratamos como un array vacío
            //         companyRoles = [];
            //     }

            //     // Si el usuario tiene la empresa en el JSON, le agregamos deletedDate
            //     companyRoles = companyRoles.map((role: any) => {
            //         if (role.companyId === idCompany) {
            //             role.deletedDate = now;
            //         }
            //         return role;
            //     });

            //     // Guardar los cambios en companyRoleJson
            //     // await txPrisma.user.update({
            //     //     where: { id: user.id },
            //     //     data: { companyRoleJson: companyRoles }
            //     // });
            // }


            console.log(`Soft delete completado para la compañía: ${idCompany}`);
        });

        // Confirmamos que el mensaje ha sido procesado correctamente
        ack();
    } catch (error) {
        console.error('Error al procesar la transacción de eliminación:', error);
        // Si ocurre un error, podemos decidir si no hacer ack para reintentar
        ack();
    }
};
