// const sharp = require('sharp');
// const fs = require('fs');
// const path = require('path');

import axios from "axios";

// /**
//  * Convierte una imagen a WebP y la redimensiona a 100px.
//  * 
//  * @param {string} inputPath - Ruta de la imagen de entrada.
//  * @param {string} outputDir - Directorio donde se guardará la imagen convertida.
//  * @returns {Promise<string>} - Ruta de la imagen convertida en WebP.
//  */
// async function convertToWebPAndResize(inputPath, outputDir) {
//     try {
//         // Asegúrate de que el directorio de salida existe
//         if (!fs.existsSync(outputDir)) {
//             fs.mkdirSync(outputDir, { recursive: true });
//         }

//         // Nombre del archivo de salida (con extensión .webp)
//         const fileName = path.basename(inputPath, path.extname(inputPath)) + '_100px.webp';
//         const outputPath = path.join(outputDir, fileName);

//         // Redimensionar a 100x100 y convertir a WebP
//         await sharp(inputPath)
//             .resize(100, 100) // Ajusta a 100px x 100px
//             .toFormat('webp') // Convierte a WebP
//             .toFile(outputPath);

//         console.log(`Imagen convertida y redimensionada: ${outputPath}`);
//         return outputPath;
//     } catch (error) {
//         console.error('Error al convertir y redimensionar la imagen:', error);
//         throw error;
//     }
// }

// // Uso de la función
// (async () => {
//     try {
//         const inputPath = 'ruta/de/tu/imagen.png'; // Cambia a la ruta de tu imagen
//         const outputDir = 'ruta/de/salida'; // Directorio de salida
//         const webpImagePath = await convertToWebPAndResize(inputPath, outputDir);
//         console.log(`Imagen WebP creada en: ${webpImagePath}`);
//     } catch (error) {
//         console.error(error);
//     }
// })();


import sharp from 'sharp';

/**
 * Convierte una imagen a WebP y la redimensiona a 100px sin guardar en disco.
 * 
 * @param {string} inputPath - Ruta de la imagen de entrada.
 * @returns {Promise<Buffer>} - Buffer de la imagen en WebP redimensionada.
 */
// async function convertToWebPAndResizeBuffer(inputPath: string) {
//     try {
//         // Redimensionar a 100x100 y convertir a WebP, devolviendo el buffer
//         const buffer = await sharp(inputPath)
//             .resize(100, 100) // Ajusta a 100px x 100px
//             .toFormat('webp') // Convierte a WebP
//             .toBuffer();

//         console.log('Imagen convertida y redimensionada en buffer.');
//         return buffer;
//     } catch (error) {
//         console.error('Error al convertir y redimensionar la imagen:', error);
//         throw error;
//     }
// }


/**
 * Convierte una imagen a WebP y la redimensiona a 100px sin guardar en disco.
 * @param image 
 * @param imageBase64Default 
 * @returns 
 */
export const convertToWebPAndResizeBuffer = async (image: string, imageBase64Default = ""): Promise<string> => {

    console.log("que es image", image)
    // Base URL del backend
    const route_image = process.env.URL_BACK_MS_AUTH || "";
    const url = `${route_image}${image}`;

    // Validar que la URL no esté vacía y que comience con "http"
    if (!url || !url.startsWith("http") || !image) {
        console.log("que es imageBase64Default", imageBase64Default)
        return imageBase64Default || "";
    }

  


    try {
        // Obtener la imagen desde la URL usando axios
        const urlEncodeUri = encodeURI(url);
        const response = await axios.get(urlEncodeUri, { responseType: 'arraybuffer' });
        console.log("mira el response", response?.data)

        // Verificar que el contenido sea una imagen
        const contentType = response.headers['content-type'];

        console.log("mira contentType", contentType)
        if (!contentType.startsWith('image/')) {
            throw new Error("El contenido obtenido no es una imagen válida.");
        }

        // Convertir y redimensionar la imagen a WebP en 100x100 y obtener el buffer
        const webpBuffer = await sharp(response?.data)
            .resize(100, 100) // Ajusta el tamaño a 100px x 100px
            .toFormat('webp')  // Convierte a formato WebP
            .toBuffer();

        // Convertir el buffer de WebP a una cadena en base64
        // const base64Image = `data:image/webp;base64,${webpBuffer.toString('base64')}`;
        // console.log("mira base64Image", webpBuffer.toString('base64'))
        return webpBuffer.toString('base64');
    } catch (error) {
        console.error("Error al transformar la imagen a base64:", error);
        return  imageBase64Default || "";
    }
}

// Ejemplo de uso
// (async () => {
//     try {
//         const inputPath = 'ruta/de/tu/imagen.png'; // Cambia a la ruta de tu imagen
//         const webpBuffer = await convertToWebPAndResizeBuffer(inputPath);
        
//         // Aquí puedes usar el buffer, enviarlo en una respuesta de API, etc.
//         console.log('Buffer de imagen WebP listo para usar.');
//     } catch (error) {
//         console.error(error);
//     }
// })();
