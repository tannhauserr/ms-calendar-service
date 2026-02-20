import { KeyCacheType } from "./keys-cache";



// export const handleCacheExpiration = async (key, value) => {
//     console.log(`La clave "${key}" ha expirado. El valor era...`);
//     console.log(`La clave "${key}" ha expirado. El valor era...`);
//     console.log(`La clave "${key}" ha expirado. El valor era...`);

//     // console.log(value)
//     if (key.substring(0, 'conversation'.length) === "conversation") {

//         const conversationCache: ConversationCacheProps = value;
//         // console.log("store 1.1")
//         let store = new StoreConversationService();
//         await store.checkAndAdd(conversationCache);
//         // console.log("store 1.2")

//     }
// }

/**
 * Usado para guardar las conversaciones de redes sociales
 * @param key 
 * @param value 
 */
export const handleCacheDelete = async (key: KeyCacheType, value: unknown) => {
    console.log(`DELETE "${key}" ha sido eliminada.`);
    try {
        const parts = key.split("_");
        // Suponiendo que la parte que te interesa es siempre la primera (ej. "user", "conversation", etc.)
        const keyCut = parts[0];
        switch (keyCut) {
            case "pon aqui el nombre de la clave":
                break;
            default:
                break;
        }
    } catch (e) {
        console.error(e)
    }
}






