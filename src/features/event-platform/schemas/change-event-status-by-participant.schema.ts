import { z } from "zod";
import { idSchema } from "./common.schema";

export const changeEventStatusByParticipantBodySchema = z.looseObject({
        id: idSchema,
        idClient: idSchema.nullable().optional(),
        idClientWorkspace: idSchema.nullable().optional(),
        action: z.enum(["accept", "cancel"]),
    })
    .refine(
        (data) => Boolean(data.idClient || data.idClientWorkspace),
        {
            message: "idClient o idClientWorkspace es requerido",
            path: ["idClient"],
        }
    );
