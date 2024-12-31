import { Prisma } from "@prisma/client";

export const eventExtension = Prisma.defineExtension((prisma) => {
    return prisma.$extends({
        query: {
            event: {
                update: async ({ args, query }) => {
                    // LOG: Validar que `args.where.id` exista
                    if (!args.where?.id) {
                        // LOG: Evento no pudo ser actualizado porque falta el ID (error crítico)
                        throw new Error("Falta el ID del evento para actualizar.");
                    }

                    const eventId = args.where.id;

                    // Buscar el evento actual
                    const event = await prisma.event.findUnique({
                        where: { id: eventId },
                    });

                    if (!event) {
                        // LOG: Evento no encontrado al intentar actualizar (error crítico)
                        throw new Error("El evento no existe.");
                    }

                    // Cargar valores desde variables de entorno con valores predeterminados
                    const TIME_TO_CHARGE_EDIT = parseInt(process.env.TIME_TO_CHARGE_EDIT || "16", 10); // Horas para cobrar ediciones (por defecto 16)
                    const TIME_TO_ALLOW_EDIT = parseInt(process.env.TIME_TO_ALLOW_EDIT || "48", 10); // Horas para permitir ediciones sin cobro (por defecto 48)
                    const TIME_AFTER_CREATION_FREE = parseInt(process.env.TIME_AFTER_CREATION_FREE || "2", 10); // Horas para ediciones gratuitas tras creación (por defecto 2)

                    const now = new Date();
                    const startDate = new Date(event.startDate);
                    const createdDate = new Date(event.createdDate);

                    // Calcular tiempos
                    const timeSinceCreationInHours =
                        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
                    const timeToStartInHours =
                        (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

                    // LOG: Registrar los tiempos calculados para auditoría
                    console.log({
                        eventId,
                        timeSinceCreationInHours,
                        timeToStartInHours,
                        now,
                        startDate,
                        createdDate,
                    });

                    // Lógica de edición facturable
                    if (timeToStartInHours <= TIME_TO_ALLOW_EDIT) {
                        if (timeToStartInHours <= TIME_TO_CHARGE_EDIT && timeSinceCreationInHours > TIME_AFTER_CREATION_FREE) {
                            // LOG: Edición facturable detectada dentro de las últimas X horas antes del inicio
                            console.log(
                                `Edición facturable detectada para el evento ${eventId}.`
                            );

                            // Incrementar el contador de actualizaciones facturables
                            args.data.numberUpdates = {
                                increment: 1,
                            };
                        } else {
                            // LOG: Edición permitida sin cargo dentro del rango de tiempo permitido
                            console.log(
                                `Edición permitida sin cargo para el evento ${eventId}.`
                            );
                        }
                    } else {
                        // LOG: Edición gratuita fuera del rango permitido para cargos
                        console.log(
                            `Edición gratuita para el evento ${eventId} (fuera de las ${TIME_TO_ALLOW_EDIT} horas previas al inicio).`
                        );
                    }

                    // LOG: Ejecutar la consulta real
                    return query(args);
                },
            },
        },
    });
});
