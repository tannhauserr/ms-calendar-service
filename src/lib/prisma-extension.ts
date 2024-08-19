import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const adjustDatesToUTC = (data: any) => {
    for (const key in data) {
        if (key.endsWith('Date') && data[key]) {
            data[key] = new Date(new Date(data[key]).getTime() - new Date(data[key]).getTimezoneOffset() * 60000);
        }
    }
};

const prismaExtension = prisma.$extends({
    query: {
        $allModels: {
            $allOperations: async ({ model, operation, args, query }) => {
                // Operations that include a data property
                const operationsWithData = ['create', 'update', 'createMany', 'updateMany'];

                if (operationsWithData.includes(operation)) {
                    if (args && 'data' in args) {
                        if (Array.isArray(args.data)) {
                            args.data.forEach(adjustDatesToUTC);
                        } else {
                            adjustDatesToUTC(args.data);
                        }
                    }
                }
                return query(args);
            }
        }
    }
});

export default prismaExtension;
