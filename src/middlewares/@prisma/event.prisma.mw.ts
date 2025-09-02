import { Prisma } from "@prisma/client";

// Cargar variables de entorno una vez en el módulo
const TIME_TO_CHARGE_EDIT = parseInt(process.env.TIME_TO_CHARGE_EDIT || "16", 10);
const TIME_TO_ALLOW_EDIT = parseInt(process.env.TIME_TO_ALLOW_EDIT || "48", 10);
const TIME_AFTER_CREATION_FREE = parseInt(process.env.TIME_AFTER_CREATION_FREE || "2", 10);
const MAX_ALLOWED_CHARGED_EDITS = parseInt(process.env.MAX_ALLOWED_CHARGED_EDITS || "10", 10);

const MILLISECONDS_PER_HOUR = 1000 * 60 * 60;

export const eventExtension = Prisma.defineExtension((prisma) => {
  return prisma.$extends({
    query: {
      event: {
        update: async ({ args, query }) => {
          // Validar que se proporcione el ID del evento
          if (!args.where?.id) {
            throw new Error("Falta el ID del evento para actualizar.");
          }

          const eventId = args.where.id;

          // Buscar el evento actual
          const event = await prisma.event.findUnique({
            where: { id: eventId },
          });

          if (!event) {
            throw new Error("El evento no existe.");
          }

          const now = new Date();
          const startDate = new Date(event.startDate);
          const createdDate = new Date(event.createdDate);

          // Calcular tiempos en horas
          const timeSinceCreationInHours =
            (now.getTime() - createdDate.getTime()) / MILLISECONDS_PER_HOUR;
          const timeToStartInHours =
            (startDate.getTime() - now.getTime()) / MILLISECONDS_PER_HOUR;

          // Variables descriptivas para la lógica de edición
          const dentroDeVentanaDeEdicion = timeToStartInHours <= TIME_TO_ALLOW_EDIT;
          const requiereCobro =
            dentroDeVentanaDeEdicion &&
            timeToStartInHours <= TIME_TO_CHARGE_EDIT &&
            timeSinceCreationInHours > TIME_AFTER_CREATION_FREE;

          // Registro de auditoría
          console.log({
            eventId,
            timeSinceCreationInHours,
            timeToStartInHours,
            now,
            startDate,
            createdDate,
          });

          // Lógica para la edición facturable
          if (requiereCobro) {
            // Verificar que no se exceda el número máximo de ediciones facturables
            if ((event.numberUpdates || 0) >= MAX_ALLOWED_CHARGED_EDITS) {
              throw new Error("Número máximo de actualizaciones facturables alcanzado.");
            }
            console.log(`Edición facturable detectada para el evento ${eventId}.`);

            // Incrementar el contador de actualizaciones facturables
            args.data.numberUpdates = {
              increment: 1,
            };
          } else if (dentroDeVentanaDeEdicion) {
            console.log(`Edición permitida sin cargo para el evento ${eventId}.`);
          } else {
            console.log(
              `Edición gratuita para el evento ${eventId} (fuera de las ${TIME_TO_ALLOW_EDIT} horas previas al inicio).`
            );
          }

          // Ejecutar la consulta real
          return query(args);
        },
      },
    },
  });
});
