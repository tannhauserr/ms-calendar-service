import axios from "axios";

/**
 * Comprueba si la URL de la imagen es válida
 * @param url 
 * @returns 
 */
export async function checkImageUrl(url: string): Promise<boolean> {
    try {
        const response = await axios.head(url);
        return response.status >= 200 && response.status < 300; 
    } catch (error) {
        console.error('Error al verificar la URL de la imagen:', error);
        return false; 
    }
}
