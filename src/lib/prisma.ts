import { PrismaClient } from "@prisma/client"
import { eventExtension } from "../middlewares/@prisma/event.prisma.mw";

const prismaClientSingleton = () => {
    // Aplica la extensión al Prisma Client
    const prisma = new PrismaClient().$extends(eventExtension);
    return prisma;
};

// const prismaClientSingleton = () => {
//     return prismaExtension;
// }


type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined
}

const prisma = globalForPrisma.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// import { PrismaClient } from "@prisma/client"

// const prismaClientSingleton = () => {
//     const prisma = new PrismaClient({
//         log: [
//             { level: 'query', emit: 'event' },
//             { level: 'error', emit: 'event' },
//             { level: 'info', emit: 'event' },
//             { level: 'warn', emit: 'event' },
//         ],
//     });

//     prisma.$on('query', (e) => {

//         console.log(JSON.stringify(e, null, 2));

//         console.log('Query: ' + e.query);
//         console.log('Duration: ' + e.duration + 'ms');
//     });

//     return prisma;
// }

// type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

// const globalForPrisma = globalThis as unknown as {
//     prisma: PrismaClientSingleton | undefined
// }

// const prisma = globalForPrisma.prisma ?? prismaClientSingleton()

// export default prisma

// if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
