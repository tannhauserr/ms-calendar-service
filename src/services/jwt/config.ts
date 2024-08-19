// jwtPrivateKeyConfig.js
import prisma from "../../lib/prisma";
import { generatePrivateKey } from "../../utils/jwt/generatePrivateKey";

let privateKey: string | undefined;

async function init() {
    let row = await prisma.jWTPrivateKey.findFirst({
        where: {
            available: true,
            deletedDate: null,
        },
        orderBy: {
            createdDate: 'desc',
        },
    });

    // Si no existe un registro creamos uno
    if (!row) {
        const key = generatePrivateKey();
        // Si ha habido algún fallo de seguridad, se invalidan todos los tokens
        await prisma.jWTPrivateKey.updateMany({
            where: {
                OR: [
                    { available: true },
                    { deletedDate: null },
                ],
            },
            data: {
                available: false,
                deletedDate: new Date(),
            },
        });

        // Creamos el nuevo token
        row = await prisma.jWTPrivateKey.create({
            data: {
                key: `${key}.default`,
                available: true,
            },
        });
    }

    privateKey = row.key;
}

function getPrivateKey() {
    return privateKey;
}

export default {
    init,
    getPrivateKey
};
