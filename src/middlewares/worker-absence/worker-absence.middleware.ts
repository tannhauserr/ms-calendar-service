import moment from "moment";
import { Response } from "../../models/messages/response";
import prisma from "../../lib/prisma";



export class WorkerAbsenceMiddleware {

    static cleanExceptionDate = async (req: any, res: any, next: any) => {
        try {
            const { idUserFk, startDate, endDate } = req.body;

            // Validamos los parámetros necesarios
            if (!idUserFk) return res.status(400).json(Response.build("El idUserFk es obligatorio", 400, false));
            if (!startDate) return res.status(400).json(Response.build("La startDate es obligatoria", 400, false));
            if (!endDate) return res.status(400).json(Response.build("La endDate es obligatoria", 400, false));

            // Convertimos las fechas a objetos Date para asegurarnos de que estén en el formato correcto
            const start = moment(startDate).startOf("day").toDate();
            const end = moment(endDate).endOf("day").toDate();

            // Realizamos una consulta RAW para eliminar los registros de la tabla temporaryBusinessHours
            const result = await prisma.$executeRawUnsafe(`
        DELETE FROM "temporaryBusinessHours"
        WHERE "idUserFk" = $1
        AND "date" BETWEEN $2 AND $3
      `, idUserFk, start, end);

            // Enviamos una respuesta de éxito si se eliminaron registros
            if (result > 0) {
                console.log(`${result} registros eliminados de temporaryBusinessHours.`);
            } else {
                console.log("No se encontraron registros para eliminar.");
            }

            // Continuamos con el flujo de la solicitud
            next();
        } catch (error: any) {
            console.error("Error en cleanExceptionDate:", error);
            return res.status(500).json(Response.build("Error interno del servidor", 500, false));
        }
    }

}
