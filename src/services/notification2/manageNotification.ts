
// import { Notification2Service } from "./notification2.service";

// /**
//  * Comprueba si tiene los datos necesarios para lanzar una notificación
//  * @param agent 
//  */
// export async function manageNotification(agent: WebhookClient, idChat) {
//     try {

//         const parameters = agent.parameters;
//         const { sendNotification, calculatePoints, holded } = parameters;

//         console.log("entro para mandar notificación")
//         if (sendNotification && !calculatePoints) {
//             parameters.rrss = agent.requestSource;
//             console.log("supuestamente lo estoy mandando")

//             await Notification2Service.addNotification(parameters);
//         }

//         if (holded) {
//             await Notification2Service.addHoldedSymfony(parameters)
//         }

//     } catch (e) {
//         throw new Error(JSON.stringify(e));
//     }
// }

// /**
//  * Comprueba si tiene los datos necesarios para lanzar una notificación
//  * @param agent 
//  */
// export async function manageNotificationWhatsapp(parameters?: any) {
//     try {


//         const { sendNotification, calculatePoints, holded } = parameters;

//         if (sendNotification && !calculatePoints) {
//             parameters.rrss = "WHATSAPP";
//             await Notification2Service.addNotification(parameters);
//         }

//         if (holded) {
//             await Notification2Service.addHoldedSymfony(parameters)
//         }

//     } catch (e) {
//         throw new Error(JSON.stringify(e));
//     }
// }