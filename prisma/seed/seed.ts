import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Limpia la tabla y reinicia la secuencia de IDs
    await prisma.$executeRaw`TRUNCATE TABLE "eventColorGoogle" RESTART IDENTITY CASCADE`;

    // Inserta los colores predeterminados de Google Calendar
    const colors = [
        { idColorGoogle: '1', colorHex: '#7986CB' }, // Lavender
        { idColorGoogle: '2', colorHex: '#33B679' }, // Sage
        { idColorGoogle: '3', colorHex: '#8E24AA' }, // Grape
        { idColorGoogle: '4', colorHex: '#E67C73' }, // Flamingo
        { idColorGoogle: '5', colorHex: '#F6BF26' }, // Banana
        { idColorGoogle: '6', colorHex: '#F4511E' }, // Tangerine
        { idColorGoogle: '7', colorHex: '#039BE5' }, // Peacock
        { idColorGoogle: '8', colorHex: '#616161' }, // Graphite
        { idColorGoogle: '9', colorHex: '#3F51B5' }, // Blueberry
        { idColorGoogle: '10', colorHex: '#0B8043' }, // Basil
        { idColorGoogle: '11', colorHex: '#D50000' }, // Tomato
    ];

    for (const color of colors) {
        await prisma.eventColorGoogle.create({
            data: color,
        });
    }

    console.log('Seed ejecutado: Colores de Google Calendar añadidos');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
