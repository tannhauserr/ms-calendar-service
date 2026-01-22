import { SidebarBackendBookingPayload, SidebarBackendService } from "../dto/SidebarBackendBookingPayload";
import prisma from "../../../../lib/prisma";
import { Event, EventSourceType, EventStatusType, GroupEvents } from "@prisma/client";

/**
 * Upsert de eventos desde la plataforma (sidebar).
 * 
 * Lógica:
 * 1. Si hay idGroup, buscar todos los eventos existentes
 * 2. Comparar servicios actuales vs existentes
 * 3. Eliminar eventos que ya no existen
 * 4. Crear/actualizar eventos según servicios recibidos
 * 5. Calcular tiempos secuencialmente (cada evento comienza cuando termina el anterior)
 * 
 * @param payload - Datos del booking desde el sidebar
 */
export const upsertEvent = async (payload: SidebarBackendBookingPayload): Promise<Event[]> => {
    // Solo procesamos eventos de tipo "event" por ahora
    if (payload.type !== "event") {
        throw new Error(`Tipo ${payload.type} no soportado en esta versión`);
    }

    const normalizedGroupId = _normalizeGroupId(payload.idGroup);

    // Si no hay servicios, eliminar todos los eventos del grupo (si existe)
    if (payload.services.length === 0) {
        if (normalizedGroupId) {
            await prisma.$transaction(async (tx) => {
                await _softDeleteGroupCascade(normalizedGroupId, tx);
            }, {
                maxWait: 10_000,
                timeout: 30_000,
            });
        }
        return [];
    }

    // Usar transacción para mantener consistencia
    // Nota: aumentamos maxWait/timeout para evitar errores cuando el pool está saturado.
    return await prisma.$transaction(async (tx) => {
        // 0. Garantizar que existe el grupo (GroupEvents)
        // - En create: se crea y su id se usa como FK en Event.idGroup
        // - En edit: se actualiza el registro del grupo
        const group = await _ensureGroupEvents(payload, tx, normalizedGroupId);

        // 1. Obtener eventos existentes del grupo
        const existingEvents = normalizedGroupId
            ? await _getEventsByGroup(group.id, tx)
            : [];

        // 2. Determinar qué eventos eliminar (los que tienen idEvent que ya no están en services)
        const currentServiceEventIds = new Set(
            payload.services
                .filter(s => s.idEvent)
                .map(s => s.idEvent)
        );

        const eventsToDelete = existingEvents.filter(
            e => !currentServiceEventIds.has(e.id)
        );

        // 3. Eliminar eventos obsoletos
        if (eventsToDelete.length > 0) {
            await _deleteEvents(eventsToDelete.map(e => e.id), tx);
        }

        // 4. Crear o actualizar eventos según servicios
        // Fecha base para encadenar servicios:
        // - si el front manda startDate, se usa
        // - si viene vacío en edit, se re-ancla al primer evento existente (idealmente uno que siga en services)
        // - fallback: startDate del group
        const payloadStart = _parseOptionalDate(payload.startDate);
        const existingThatRemain = existingEvents.filter((e) => currentServiceEventIds.has(e.id));
        const anchorStartDate =
            payloadStart ??
            existingThatRemain?.[0]?.startDate ??
            existingEvents?.[0]?.startDate ??
            group.startDate;

        const upsertedEvents = await _upsertServices(payload, tx, group.id, anchorStartDate);

        // 5. Gestionar participantes (clientes) a nivel de grupo
        await _upsertParticipants(group.id, payload.clients, tx);

        // 6. Asegurar que el rango del booking sea el real (primer/último evento)
        await _syncGroupStartEndDates(group.id, tx);

        return upsertedEvents;
    }, {
        maxWait: 10_000,
        timeout: 30_000,
    });
};

function _normalizeGroupId(idGroup: unknown): string | undefined {
    if (typeof idGroup !== "string") return undefined;
    const trimmed = idGroup.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Obtiene todos los eventos de un grupo
 */
async function _getEventsByGroup(idGroup: string, tx: any): Promise<Event[]> {
    return await tx.event.findMany({
        where: {
            idGroup,
            deletedDate: null,
        },
        orderBy: {
            startDate: 'asc',
        },
    });
}

/**
 * Elimina eventos por IDs
 */
async function _deleteEvents(eventIds: string[], tx: any): Promise<void> {
    await tx.event.updateMany({
        where: {
            id: { in: eventIds },
        },
        data: {
            deletedDate: new Date(),
        },
    });
}

async function _softDeleteGroupCascade(idGroup: string, tx: any): Promise<void> {
    const now = new Date();

    await tx.event.updateMany({
        where: {
            idGroup,
            deletedDate: null,
        },
        data: {
            deletedDate: now,
        },
    });

    await tx.eventParticipant.updateMany({
        where: {
            idGroup,
            deletedDate: null,
        },
        data: {
            deletedDate: now,
        },
    });

    await tx.groupEvents.updateMany({
        where: {
            id: idGroup,
            deletedDate: null,
        },
        data: {
            deletedDate: now,
        },
    });
}

async function _ensureGroupEvents(
    payload: SidebarBackendBookingPayload,
    tx: any,
    normalizedGroupId: string | undefined
): Promise<GroupEvents> {
    const groupTitle = _deriveGroupTitle(payload);
    const normalizedStatus = _normalizeEventStatusType(payload.eventStatusType);

    const payloadStart = _parseOptionalDate(payload.startDate);
    let payloadEnd = _parseOptionalDate(payload.endDate);
    if (payloadStart && !payloadEnd) {
        payloadEnd = _addEndFromServices(payloadStart, payload.services);
    }

    // start/end son obligatorios en GroupEvents. Si el front los manda vacíos,
    // en edit usamos el valor existente; en create exigimos startDate.
    const baseData: any = {
        title: groupTitle,
        idCompanyFk: payload.idCompany,
        idWorkspaceFk: payload.idWorkspace,
        commentClient: payload.commentClient ?? null,
        description: payload.description ?? null,
        eventSourceType: EventSourceType.PLATFORM,
        isEditableByClient: true,
    };

    if (normalizedStatus) {
        baseData.eventStatusType = normalizedStatus;
    }

    if (normalizedGroupId) {
        const existing = await tx.groupEvents.findUnique({
            where: { id: normalizedGroupId },
        });

        if (existing) {
            const startDate = payloadStart ?? existing.startDate;
            const endDate = payloadEnd ?? existing.endDate;

            return await tx.groupEvents.update({
                where: { id: normalizedGroupId },
                data: {
                    ...baseData,
                    startDate,
                    endDate,
                    deletedDate: null,
                },
            });
        }

        if (!payloadStart) {
            throw new Error("startDate es requerido para crear un booking nuevo (idGroup no existe)");
        }

        const startDate = payloadStart;
        const endDate = payloadEnd ?? _addEndFromServices(startDate, payload.services);

        return await tx.groupEvents.create({
            data: {
                ...baseData,
                startDate,
                endDate,
                id: normalizedGroupId,
            },
        });
    }

    if (!payloadStart) {
        throw new Error("startDate es requerido para crear un booking nuevo");
    }

    const startDate = payloadStart;
    const endDate = payloadEnd ?? _addEndFromServices(startDate, payload.services);

    return await tx.groupEvents.create({
        data: {
            ...baseData,
            startDate,
            endDate,
        },
    });
}

/**
 * Valida y parsea una fecha opcional
 * @param value 
 * @returns 
 */
function _parseOptionalDate(value: unknown): Date | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Adaptar la fecha de fin basada en la suma de duraciones de los servicios
 * @param startDate 
 * @param services 
 * @returns 
 */
function _addEndFromServices(startDate: Date, services: SidebarBackendService[]): Date {
    const totalMinutes = (services || []).reduce((acc, s) => acc + (Number(s?.duration) || 0), 0);
    const end = new Date(startDate);
    end.setMinutes(end.getMinutes() + totalMinutes);
    return end;
}

/**
 * Sincroniza las fechas de inicio y fin del GroupEvents basado en sus eventos asociados
 * @param idGroup 
 * @param tx 
 * @returns 
 */
async function _syncGroupStartEndDates(idGroup: string, tx: any): Promise<void> {
    const agg = await tx.event.aggregate({
        where: {
            idGroup,
            deletedDate: null,
        },
        _min: { startDate: true },
        _max: { endDate: true },
    });

    const startDate = agg?._min?.startDate;
    const endDate = agg?._max?.endDate;
    if (!startDate || !endDate) return;

    await tx.groupEvents.update({
        where: { id: idGroup },
        data: { startDate, endDate },
    });
}

function _deriveGroupTitle(payload: SidebarBackendBookingPayload): string {
    const firstServiceName = payload.services?.[0]?.name?.trim();
    const title = firstServiceName && firstServiceName.length > 0 ? firstServiceName : "Booking";
    return title.length > 100 ? title.slice(0, 100) : title;
}

function _normalizeEventStatusType(value?: string): EventStatusType | undefined {
    if (!value) return undefined;
    const values = Object.values(EventStatusType) as unknown as string[];
    return values.includes(value) ? (value as EventStatusType) : undefined;
}

/**
 * Crea o actualiza eventos basados en los servicios recibidos
 */
async function _upsertServices(
    payload: SidebarBackendBookingPayload,
    tx: any,
    effectiveGroupId: string,
    groupStartDate: Date
): Promise<Event[]> {
    const results: Event[] = [];

    // Fecha de inicio del primer servicio:
    // - preferimos payload.startDate si viene
    // - si viene vacío, usamos el startDate del GroupEvents existente
    let currentStartDate = _parseOptionalDate(payload.startDate) ?? groupStartDate;

    for (const service of payload.services) {
        // Calcular fecha de fin basada en duración
        const currentEndDate = new Date(currentStartDate);
        currentEndDate.setMinutes(currentEndDate.getMinutes() + service.duration);

        // Preparar datos del evento
        const eventData = _buildEventData(payload, service, currentStartDate, currentEndDate);

        // Si tiene idEvent, es una actualización; si no, es creación
        let event: Event;
        if (service?.idEvent && !service?.idEvent.startsWith('new-')) {
            event = await tx.event.update({
                where: { id: service.idEvent },
                data: {
                    ...eventData,
                    idGroup: effectiveGroupId,
                },
            });
        } else {
            event = await tx.event.create({
                data: {
                    ...eventData,
                    idGroup: effectiveGroupId,
                },
            });
        }

        results.push(event);

        // El siguiente evento comienza cuando termina el actual
        currentStartDate = currentEndDate;
    }

    return results;
}

/**
 * Construye el objeto de datos para crear/actualizar un evento
 */
function _buildEventData(
    payload: SidebarBackendBookingPayload,
    service: SidebarBackendService,
    startDate: Date,
    endDate: Date
): any {
    return {
        title: service.name,
        description: payload?.description || null,
        startDate,
        endDate,
        idServiceFk: service.idService,
        idUserPlatformFk: service.idWorker || null,
        serviceNameSnapshot: service.name,
        servicePriceSnapshot: service.price,
        serviceDiscountSnapshot: service.discount,
        serviceDurationSnapshot: service.duration,
    };
}

/**
 * Crea o actualiza los participantes (clientes) de un evento
 */
async function _upsertParticipants(
    idGroup: string,
    clients: Array<{ idClient: string; idClientWorkspace: string }>,
    tx: any
): Promise<void> {
    // Primero, eliminar participantes existentes (soft delete)
    await tx.eventParticipant.updateMany({
        where: {
            idGroup,
            deletedDate: null,
        },
        data: {
            deletedDate: new Date(),
        },
    });

    // Crear nuevos participantes (batch) para reducir número de queries
    if (clients.length > 0) {
        await tx.eventParticipant.createMany({
            data: clients.map((client) => ({
                idGroup,
                idClientFk: client.idClient,
                idClientWorkspaceFk: client.idClientWorkspace,
                eventStatusType: 'PENDING',
            })),
        });
    }
}