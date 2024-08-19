const crypto = require('crypto');

/**
 * Generate a random string of 32 characters
 * @returns {string} secretKey
 */
export const generatePrivateKey = () => {
    const secretKey = crypto.randomBytes(32).toString('hex');
    return secretKey;
}
