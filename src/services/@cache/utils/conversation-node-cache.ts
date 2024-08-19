import { keyCache } from "../keys-cache";
import { NodeCacheService } from "../node-cache.service";

export interface ConversationCacheProps {
    idSession: string;
    /** id de la table UserSocialMedia */
    // idUserSocialMedia?: any;
    // id: string;
    // platform: string;
    // conversation: any[];
    // /** Solo web */
    // webLocation?: string;

    // // new 24/02/08
    // intentsCountJson: any;
    // // new 24/03/04
    // parameters: any;
    // // new 24/03/09
    // botInteractionCount?: number;
}

export namespace ConversationNodeCache {

    export const deleteConversation = (id): void => {
        // const ncs = NodeCacheService.instance;
        // let n = ncs.getNodeCache().del(keyCache.conversation + id);
        // console.log(n)
    }

    export const getConversation = (id) => {
    
  
    }

    export const storeConversation = async (
        idOrIp: any,
        idSession: string,
        platform: any,
        counter: number,
        messageUser: any,
        parameters: any,
        flowId: string,
        pageName: string,
        intentName: string = "NO_INTENT",
        oldConversation: ConversationCacheProps,
        fragmentConversation: any[],
        time: any,
        webLocation?: string
    ) => {
    //     const ncs = NodeCacheService.instance;
    //     let conversation = [];
    //     let idUserSocialMedia = undefined;
    //     // console.log("1.1")
    //     fragmentConversation = await _addInfoToPayload(fragmentConversation);
    //     // console.log("1.2", fragmentConversation)

    //     /**
    //      * Creo un payload de tipo text para el mensaje del usuario que se recibe
    //      * en un simple string.
    //      * El payload se guarda junto los demás payloads
    //      */
    //     messageUser = _createPayloadText(messageUser);
    //     console.log("1.3")

    //     let payloadTransformed = [...messageUser, ...fragmentConversation];
    //     console.log("---")
    //     if (oldConversation && oldConversation.conversation) {
    //         console.log("--- 1")
    //         conversation = [...oldConversation.conversation, ...payloadTransformed];
    //     } else {
    //         console.log("--- 2", idOrIp, platform)

    //         const usms = new UserSocialMediaService();
    //         const rowFounded: UserSocialMedia = await usms.getByIpAndPlatform(idOrIp, platform);

    //         if (rowFounded) {
    //             idUserSocialMedia = rowFounded.id;
    //         }



    //         console.log("-------------------")
    //         console.log("-------------------")
    //         console.log("-------------------")
    //         console.log("RESPOPNSE NEW")
    //         console.log(rowFounded)
    //         console.log("-------------------")
    //         console.log("-------------------")
    //         console.log("-------------------")
    //         console.log("-------------------")


    //         // Si es la primera vez, entonces buscamos el id del userSocialMedia en la tabla
    //         // const { data } = await StoreConversationService.checkUserSocialMedia(id, platform);
    //         // console.log("--- 3")

    //         // if (data.ok) {
    //         //     idUserSocialMedia = data.item.id;
    //         // }
    //         conversation = [...payloadTransformed];
    //     }
    //     console.log("1.4")
    //     let intentsCountJson = oldConversation && oldConversation.intentsCountJson ? oldConversation.intentsCountJson : {};

    //     // Asegura la existencia de la estructura para flowId y pageName
    //     if (!intentsCountJson[flowId]) {
    //         intentsCountJson[flowId] = {};
    //     }
    //     if (!intentsCountJson[flowId][pageName]) {
    //         intentsCountJson[flowId][pageName] = {};
    //     }

    //     // Actualiza el contador, incluso para "Sin intent"
    //     intentsCountJson[flowId][pageName][intentName] = intentsCountJson[flowId][pageName][intentName] ? { count: intentsCountJson[flowId][pageName][intentName].count + 1 } : { count: 1 };


    //     ncs.getNodeCache().set<ConversationCacheProps>(
    //         keyCache.conversation + `_${platform}_${idOrIp}`,
    //         {
    //             idSession,
    //             id: idOrIp,
    //             conversation,
    //             platform,
    //             webLocation,
    //             idUserSocialMedia: (oldConversation && oldConversation.idUserSocialMedia)
    //                 ? oldConversation.idUserSocialMedia
    //                 : idUserSocialMedia,
    //             intentsCountJson,
    //             parameters,
    //             botInteractionCount: counter
    //         },
    //         time
    //     );
    // }


    // /**
    //  * Crea payload para los textos entrante por parte del usuario
    // */
    // const _addInfoToPayload = (fulfillmentList) => {
    //     return new Promise<any>((res, rej) => {
    //         if (!fulfillmentList || fulfillmentList.length === 0) res([]);

    //         let auxList = [];
    //         for (const [i, ful] of fulfillmentList.entries()) {
    //             let object = {
    //                 item: ful,
    //                 user: {
    //                     userType: "bot",
    //                     imageUri: undefined
    //                 },
    //                 notification: {
    //                     notificationType: "none",
    //                     hour: new Date()
    //                 }
    //             }

    //             auxList.push(object);
    //             if (i === fulfillmentList.length - 1) {
    //                 res(auxList)
    //             }
    //         }
    //     });
    // }

    // const _createPayloadText = (text: string) => {
    //     return [
    //         {
    //             item: {
    //                 message: "text",
    //                 text: [text],
    //             },
    //             user: {
    //                 userType: "human",
    //                 imageUri: undefined
    //             },
    //             notification: {
    //                 notificationType: "none",
    //                 hour: new Date()
    //             }
    //         }
    //     ]
    }


}




