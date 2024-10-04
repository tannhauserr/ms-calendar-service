import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Lee la clave privada desde la ruta actual
const privateKeyPath = path.resolve(__dirname, 'wh_private_local_0916.pem'); // Ruta correcta

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

/**
 * Desencripta un mensaje cifrado con RSA usando la clave privada
 * @param {string} encryptedMessage - El mensaje cifrado en formato base64
 * @returns {string} - El mensaje desencriptado
 */
const decryptData = (encryptedMessage: string): string => {
    try {
        // Desencripta el mensaje utilizando la clave privada
        const decryptedData = crypto.privateDecrypt(
            {
                key: privateKey,
                passphrase: '', // Si tienes un passphrase para la clave privada, agrégalo aquí
            },
            Buffer.from(encryptedMessage, 'base64')
        );

        return decryptedData.toString();
    } catch (error) {
        console.error('Error al desencriptar los datos:', error);
        throw new Error('Falló la desencriptación');
    }
};

export { decryptData };
