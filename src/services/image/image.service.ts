import { CONSOLE_COLOR } from "../../constant/console-color";
import axios from "axios";

type ImageConfig = {
    logo?: string | null;
};

export class ImageService {
    static async checkImageUrl(url: string): Promise<boolean> {
        try {
            const response = await axios.head(url);
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            // console.error('Error al verificar la URL de la imagen:', error);
            console.error(`${CONSOLE_COLOR.FgRed}Error al verificar la URL de la imagen:${CONSOLE_COLOR.Reset} ${url}`);
            return false;
        }
    }

    static async constructFullLogoUrl(config: ImageConfig): Promise<string | null> {
        if (!config.logo) return null;

        const isFullUrl = config.logo.startsWith('http://') || config.logo.startsWith('https://');
        const backendBaseUrl = process.env.BACKEND_BASE_URL;
        // const imageUrl = process.env.IMAGE_PATH;
        const imageUrl = "";

        const fullLogoUrl = isFullUrl ? config.logo : `${backendBaseUrl}${imageUrl}${config.logo}`;
        const imageWorks = await this.checkImageUrl(fullLogoUrl);

        if (imageWorks) {
            return isFullUrl ? config.logo : fullLogoUrl;
        }
        return null;
    }

}
