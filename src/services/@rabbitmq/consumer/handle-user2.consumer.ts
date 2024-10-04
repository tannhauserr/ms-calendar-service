// consumers/handleUserConsumer.ts

import { RabbitMQKeys } from '../keys/rabbitmq.keys';
import { CONSOLE_COLOR } from '../../../constant/console-color';
import { PrismaClient } from '@prisma/client';
import { RabbitMQFacade } from '../facade/rabbitmq.facade';
import { ActionPayloads } from '../actions/rabbitmq.action';

const prisma = new PrismaClient();

export const handleUserConsumer = async (): Promise<void> => {
    const queue = RabbitMQKeys.handleUserQueue();

    try {
        // Aseguramos que la cola esté creada
        await RabbitMQFacade.instance.assertQueue('handleUserQueue');

        // Consumimos mensajes de la cola, con un callback tipado
        await RabbitMQFacade.instance.consumeQueue('handleUserQueue', fn);

        console.log(`Escuchando mensajes en la cola: ${queue}`);
    } catch (error) {
        console.error('Error al procesar la cola:', error);
    }
};

// Type Guards para verificar la estructura del mensaje
function isHandleUserPayload(
    msg: any
): msg is ActionPayloads['handleUser'] {
    return msg && typeof msg === 'object' && ('user' in msg || 'company' in msg);
}

function isUserAction(user: any): user is ActionPayloads['handleUser']['user'] {
    return user && typeof user === 'object' && 'action' in user &&
        ['add', 'update', 'delete'].includes(user.action);
}

function isCompanyAction(company: any): company is ActionPayloads['handleUser']['company'] {
    return company && typeof company === 'object' && 'action' in company &&
        ['add', 'update', 'delete'].includes(company.action);
}

// Función para procesar la eliminación de usuarios en servicios relacionados con una compañía
const processDeleteUserServiceByCompany = async (userId: string, companyId: string, txPrisma: any) => {
    try {
        // Primero obtenemos todos los servicios que pertenecen a la compañía especificada
        const services = await txPrisma.service.findMany({
            where: { idCompanyFk: companyId },
            select: { id: true }, // Solo necesitamos los IDs de los servicios
        });

        const serviceIds = services.map(service => service.id); // Extraemos los IDs de los servicios

        if (serviceIds.length > 0) {
            // Eliminamos las relaciones en UserService donde el usuario esté vinculado a estos servicios
            await txPrisma.userService.deleteMany({
                where: {
                    idUserFk: userId,
                    idServiceFk: { in: serviceIds }, // Usamos los IDs de los servicios que pertenecen a la compañía
                },
            });

            console.log(`Relaciones UserService eliminadas para el usuario: ${userId} en la compañía: ${companyId}`);
        } else {
            console.log(`No se encontraron servicios para la compañía: ${companyId}`);
        }
    } catch (error) {
        console.error('Error al eliminar UserService:', error);
    }
};


// Función que contiene la lógica de procesamiento de los mensajes
const fn = async (content: any, ack: () => void) => {
    console.log('Mensaje recibido:', content);

    // Verificamos si el mensaje es del tipo handleUser
    if (isHandleUserPayload(content)) {
        const { user, company } = content;

        try {
            await prisma.$transaction(async (txPrisma) => {
                // Procesar acción de usuario si existe y es válida
                if (isUserAction(user)) {
                    const { action: userAction, ...userData } = user;
                    console.log(`${CONSOLE_COLOR.FgBlue}Procesando acción de usuario: ${userAction}${CONSOLE_COLOR.Reset}`);

                    switch (userAction) {
                        case 'add':
                            try {
                                // Crear el usuario
                                await txPrisma.user.create({
                                    data: {
                                        id: userData.id,
                                        email: userData.email,
                                        emailGoogle: userData.emailGoogle,
                                        name: userData.name || '',
                                        lastName: userData.lastName || '',
                                        image: userData.image || null,
                                        companyRoleJson: userData.companyRoleJson || '[]',
                                    },
                                });
                                console.log('Usuario agregado:', userData.id);
                            } catch (error) {
                                console.error('Error al agregar usuario:', error);
                                throw error;
                            }
                            break;

                        case 'update':
                            try {
                                const updateData: any = {};
                                if (userData.email !== undefined) updateData.email = userData.email;
                                if (userData.emailGoogle !== undefined) updateData.emailGoogle = userData.emailGoogle;
                                if (userData.name !== undefined) updateData.name = userData.name;
                                if (userData.lastName !== undefined) updateData.lastName = userData.lastName;
                                if (userData.image !== undefined) updateData.image = userData.image;
                                if (userData.companyRoleJson !== undefined) updateData.companyRoleJson = userData.companyRoleJson;

                                await txPrisma.user.update({
                                    where: { id: userData.id },
                                    data: updateData,
                                });
                                console.log('Usuario actualizado:', userData.id);
                            } catch (error) {
                                console.error('Error al actualizar usuario:', error);
                                throw error;
                            }
                            break;

                        case 'delete':
                            try {
                                // Eliminar registros relacionados y el usuario
                                await txPrisma.userCalendar.deleteMany({ where: { idUserFk: userData.id } });
                                await txPrisma.userColor.deleteMany({ where: { idUserFk: userData.id } });
                                await txPrisma.workerBusinessHour.deleteMany({ where: { idUserFk: userData.id } });
                                await txPrisma.userService.deleteMany({ where: { idUserFk: userData.id } });
                                await txPrisma.temporaryBusinessHour.deleteMany({ where: { idUserFk: userData.id } });
                                await txPrisma.user.delete({ where: { id: userData.id } });


                                console.log(`Usuario y registros relacionados eliminados: ${userData.id}`);
                            } catch (error) {
                                console.error('Error al eliminar usuario:', error);
                                throw error;
                            }
                            break;

                        default:
                            console.log('Acción de usuario no reconocida:', userAction);
                            break;
                    }
                } else {
                    console.log('No hay acción válida de usuario o usuario es null');
                }

                // Procesar acción de compañía si existe y es válida
                if (isCompanyAction(company) && isUserAction(user)) {
                    const { action: companyAction, ...companyData } = company;
                    const userId = user.id;
                    const companyId = companyData.id;

                    console.log(`${CONSOLE_COLOR.FgBlue}Procesando acción de compañía: ${companyAction}${CONSOLE_COLOR.Reset}`);

                    switch (companyAction) {
                        case 'add':
                            // Como no tenemos una tabla Company, no hacemos nada aquí
                            // Sin embargo, podemos actualizar el campo companyRoleJson del usuario
                            try {
                                // Obtener el usuario actual
                                const existingUser = await txPrisma.user.findUnique({
                                    where: { id: userId },
                                });

                                if (existingUser) {
                                    // Actualizar el campo companyRoleJson
                                    const companyRoles = existingUser.companyRoleJson as any[] || [];
                                    companyRoles.push({
                                        companyId: companyId,
                                        role: companyData.roleType || 'ROLE_USER',
                                    });

                                    await txPrisma.user.update({
                                        where: { id: userId },
                                        data: {
                                            companyRoleJson: companyRoles,
                                        },
                                    });
                                    console.log(`Usuario ${userId} actualizado con nueva compañía ${companyId}`);
                                }
                            } catch (error) {
                                console.error('Error al agregar compañía al usuario:', error);
                                throw error;
                            }
                            break;

                        case 'update':
                            // Actualizar el rol del usuario en la compañía en companyRoleJson
                            try {
                                const existingUser = await txPrisma.user.findUnique({
                                    where: { id: userId },
                                });

                                if (existingUser) {
                                    let companyRoles = existingUser.companyRoleJson as any[] || [];

                                    companyRoles = companyRoles.map((entry) => {
                                        if (entry.companyId === companyId) {
                                            return {
                                                ...entry,
                                                role: companyData.roleType || entry.role,
                                            };
                                        }
                                        return entry;
                                    });

                                    await txPrisma.user.update({
                                        where: { id: userId },
                                        data: {
                                            companyRoleJson: companyRoles,
                                        },
                                    });
                                    console.log(`Rol del usuario ${userId} actualizado en la compañía ${companyId}`);
                                }
                            } catch (error) {
                                console.error('Error al actualizar rol en compañía:', error);
                                throw error;
                            }
                            break;

                        case 'delete':
                            // Eliminar registros donde estén tanto el usuario como la compañía
                            try {
                                // Actualizar el campo companyRoleJson del usuario
                                const existingUser = await txPrisma.user.findUnique({
                                    where: { id: userId },
                                });

                                if (existingUser) {
                                    const companyRoles = (existingUser.companyRoleJson as any[] || []).filter(
                                        (entry) => entry.companyId !== companyId
                                    );

                                    await txPrisma.user.update({
                                        where: { id: userId },
                                        data: {
                                            companyRoleJson: companyRoles,
                                        },
                                    });
                                    console.log(`Compañía ${companyId} eliminada del usuario ${userId}`);
                                }

                                // Eliminar registros relacionados donde estén ambos
                                await txPrisma.workerBusinessHour.deleteMany({
                                    where: { idUserFk: userId, idCompanyFk: companyId },
                                });
                                await txPrisma.temporaryBusinessHour.deleteMany({
                                    where: { idUserFk: userId, idCompanyFk: companyId },
                                });

                                await processDeleteUserServiceByCompany(userId, companyId, txPrisma);




                                // Otros registros si aplica

                                console.log(`Registros relacionados eliminados para usuario ${userId} y compañía ${companyId}`);
                            } catch (error) {
                                console.error('Error al eliminar registros relacionados con la compañía:', error);
                                throw error;
                            }
                            break;

                        default:
                            console.log('Acción de compañía no reconocida:', companyAction);
                            break;
                    }
                } else {
                    console.log('No hay acción válida de compañía o compañía es null');
                }
            });

            // Confirmamos que el mensaje ha sido procesado correctamente
            ack();
        } catch (error) {
            console.error('Error al procesar la transacción:', error);
            ack(); // Dependiendo de la estrategia, puedes decidir no hacer ack para reintentar
        }
    } else {
        console.log('Mensaje no válido para handleUser');
        ack(); // Acknowledge el mensaje si no corresponde al tipo esperado
    }
};


