import prisma from "../../../lib/prisma";

export class RoleService {

    autocomplete() {
        return prisma.role.findMany({
            select: {
                id: true,
                roleType: true,
            }
        });
    }
}