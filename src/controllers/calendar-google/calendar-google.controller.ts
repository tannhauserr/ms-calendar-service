// import { Request, Response } from 'express';
// import { CalendarGoogleService } from '../../services/caledar-google/calendar-google.service';


// export class GoogleCalendarController {
//     private calendarGoogleService = new CalendarGoogleService();

//     async addCalendar(req: Request, res: Response) {
//         const { idUserFk, idGoogleCalendar, name, ownerEmailGoogle } = req.body;

//         try {
//             const newCalendar = await this.calendarGoogleService.addCalendar(idUserFk, "Esto es 'summary'", "Creado desde Frontend");
//             return res.status(200).json({
//                 success: true,
//                 message: 'Calendario creado con éxito.',
//                 data: newCalendar,
//             });
//         } catch (error) {
//             console.error('Error al crear el calendario:', error);
//             return res.status(500).json({
//                 success: false,
//                 message: 'Hubo un error al crear el calendario.',
//             });
//         }
//     }

//     async deleteCalendar(req: Request, res: Response) {
//         const { userId, calendarId } = req.body;

//         try {
//             await this.calendarGoogleService.deleteCalendar(userId, calendarId);
//             return res.status(200).json({
//                 success: true,
//                 message: 'Calendario eliminado con éxito.',
//             });
//         } catch (error) {
//             console.error('Error al eliminar el calendario:', error);
//             return res.status(500).json({
//                 success: false,
//                 message: 'Hubo un error al eliminar el calendario.',
//             });
//         }
//     }
// }
