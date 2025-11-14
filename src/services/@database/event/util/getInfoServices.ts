import { getServiceByIds } from "../../../@service-token-client/api-ms/bookingPage.ms";

type MinimalServiceSnapshot = {
    id: string;
    name: string;
    price: number;
    discount: number;
    /** Duración en minutos (tal cual del modelo) */
    duration: number;
    /** Alias cómodo para tus helpers */
    durationMin: number;
    /** Participantes máximos por servicio (1 = individual, >1 = grupal) */
    maxParticipants: number;
};


export const _getServicesSnapshotById = async (params: {
    idCompany: string;
    idWorkspace: string;
    attendees?: Array<{ serviceId: string | undefined | null }>;
    ids?: string[];                  // opcional: puedes pasar IDs directamente
    includeInvisible?: boolean;      // por defecto false
    requireAll?: boolean;            // por defecto true (lanza si falta alguno)
}): Promise<Record<string, MinimalServiceSnapshot>> => {
    const {
        idCompany,
        idWorkspace,
        attendees,
        ids,
        includeInvisible = false,
        requireAll = true,
    } = params;

    // 1) Resolver IDs de servicio desde attendees o ids
    const wantedIds = Array.from(
        new Set(
            (ids && ids.length ? ids : (attendees ?? []).map(a => a?.serviceId))
                .filter((v): v is string => typeof v === "string" && v.length > 0)
        )
    );

    if (wantedIds.length === 0) return {};

    try {
        // 2) Obtener servicios del microservicio
        const services = await getServiceByIds(wantedIds, idWorkspace);

        // 3) Map resultado - adaptando del formato ServiceBrief al MinimalServiceSnapshot
        const map: Record<string, MinimalServiceSnapshot> = {};
        for (const s of services) {
            // Filtrar por visibilidad si es necesario
            if (!includeInvisible && s.isVisible === false) {
                continue;
            }

            const duration = typeof s.duration === "number" ? s.duration : 60;
            const maxP = typeof s.maxParticipants === "number" ? s.maxParticipants : 1;

            map[s.id] = {
                id: s.id,
                name: s.name,
                price: s.price ?? 0,
                discount: s.discount ?? 0,
                duration,            // para tu creación de eventos
                durationMin: duration, // alias para helpers de disponibilidad
                maxParticipants: maxP,
            };
        }

        // 4) Validación opcional (útil en booking público)
        if (requireAll) {
            const missing = wantedIds.filter(id => !map[id]);
            if (missing.length > 0) {
                throw new Error(`Servicios no encontrados: ${missing.join(', ')}`);
            }
        }

        return map;
    } catch (error: any) {
        console.error("[_getServicesSnapshotById] Error al obtener servicios:", error);
        
        // Si es un error de validación (servicios faltantes) y requireAll=true, siempre relanzar
        if (error.message?.includes("Servicios no encontrados")) {
            throw error;
        }
        
        // Si requireAll es true para otros errores (red, etc), también relanzar
        if (requireAll) {
            throw error;
        }
        
        // Si no requireAll, devolver objeto vacío (solo para errores de red/microservicio)
        return {};
    }
}

// export const _getServicesSnapshotById = async (params: {
//     idCompany: string;
//     idWorkspace: string;
//     attendees?: Array<{ serviceId: string | undefined | null }>;
//     ids?: string[];                  // opcional: puedes pasar IDs directamente
//     includeInvisible?: boolean;      // por defecto false
//     requireAll?: boolean;            // por defecto true (lanza si falta alguno)
// }): Promise<Record<string, MinimalServiceSnapshot>> => {
//     const {
//         idCompany,
//         idWorkspace,
//         attendees,
//         ids,
//         includeInvisible = false,
//         requireAll = true,
//     } = params;

//     // 1) Resolver IDs de servicio desde attendees o ids
//     const wantedIds = Array.from(
//         new Set(
//             (ids && ids.length ? ids : (attendees ?? []).map(a => a?.serviceId))
//                 .filter((v): v is string => typeof v === "string" && v.length > 0)
//         )
//     );

//     if (wantedIds.length === 0) return {};

//     // 2) Query único con el superset de campos que necesitas en todas las rutas
//     const services = await prisma.service.findMany({
//         where: {
//             id: { in: wantedIds },
//             idCompanyFk: idCompany,
//             idWorkspaceFk: idWorkspace,
//             deletedDate: null,
//             ...(includeInvisible ? {} : { isVisible: true }),
//         },
//         select: {
//             id: true,
//             name: true,
//             price: true,
//             discount: true,
//             duration: true,
//             maxParticipants: true,
//         },
//     });

//     // 3) Map resultado
//     const map: Record<string, MinimalServiceSnapshot> = {};
//     for (const s of services) {
//         const duration = typeof s.duration === "number" ? s.duration : 60;
//         const maxP = typeof s.maxParticipants === "number" ? s.maxParticipants : 1;

//         map[s.id] = {
//             id: s.id,
//             name: s.name,
//             price: s.price ?? 0,
//             discount: s.discount ?? 0,
//             duration,            // para tu creación de eventos
//             durationMin: duration, // alias para helpers de disponibilidad
//             maxParticipants: maxP,
//         };
//     }

//     // 4) Validación opcional (útil en booking público)
//     if (requireAll) {
//         const missing = wantedIds.filter(id => !map[id]);
//         if (missing.length > 0) {
//             throw new Error("Alguno de los servicios no existe o no está disponible.");
//         }
//     }

//     return map;
// }