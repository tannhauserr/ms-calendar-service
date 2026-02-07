import prisma from "../../../../../lib/prisma";
import { getWorkspacesByIds, getUsersByIds } from "../../../../../services/@service-token-client/api-ms/auth.ms";
import { getClientWorkspacesByIds } from "../../../../../services/@service-token-client/api-ms/client.ms";
import { ActionKey } from "../../action-to-senctions";
import { BookingSnap } from "../../simple-build";
import { _publishForAction } from "../for-action";

type GroupData = {
    id: string;
    idWorkspaceFk: string;
    idCompanyFk: string;
    createdDate: Date;
    updatedDate: Date;
    startDate: Date;
    endDate: Date;
    deletedDate: Date | null;
    eventParticipant: Array<{ idClientWorkspaceFk: string | null }>;
    events: Array<{ idUserPlatformFk: string | null; idServiceFk: string | null }>;
};

const _uniqNonEmptyStrings = (values: Array<string | null | undefined>) =>
    Array.from(new Set(values.filter((v): v is string => typeof v === "string" && v.trim().length > 0)));

const _toPhoneE164 = (obj: any): string | undefined => {
    const phoneNumber = obj?.phoneNumber;
    const phoneCode = obj?.phoneCode;
    if (!phoneNumber || !phoneCode) return undefined;
    return `${phoneCode.toString()}${phoneNumber}`;
};

const _loadGroup = async (idGroup: string): Promise<GroupData | null> =>
    prisma.groupEvents.findUnique({
        where: { id: idGroup },
        include: {
            eventParticipant: {
                where: { deletedDate: null },
                select: { idClientWorkspaceFk: true },
            },
            events: {
                where: { deletedDate: null },
                select: {
                    idUserPlatformFk: true,
                    idServiceFk: true,
                },
            },
        },
    }) as any;

const _buildBookingBase = (group: GroupData): BookingSnap => {
    const firstServiceId = group.events
        .map((e) => e?.idServiceFk)
        .find((v): v is string => typeof v === "string") ?? "";

    return {
        id: group.id,
        createdAt: group.createdDate.toISOString(),
        updatedAt: group.updatedDate ? group.updatedDate.toISOString() : undefined,
        startAtLocal: group.startDate ? group.startDate.toISOString() : undefined,
        endAtLocal: group.endDate ? group.endDate.toISOString() : undefined,
        idService: firstServiceId,
        idGroup: group.id,
    };
};

const _publishToStaff = async (params: {
    staffIds: string[];
    userById: Map<string, any>;
    bookingBase: BookingSnap;
    workspace: any;
    notificationConfig: any;
    actionSectionType: ActionKey;
}) => {
    const { staffIds, userById, bookingBase, workspace, notificationConfig, actionSectionType } = params;

    await Promise.all(
        staffIds.map(async (staffId) => {
            const user = userById.get(staffId);
            const timeZoneStaff = user?.timeZone ?? workspace?.timeZone ?? "UTC";

            try {
                const bookingForUser = {
                    ...bookingBase,
                    business: {
                        id: staffId,
                        email: user?.email ?? undefined,
                        phoneE164: _toPhoneE164(user),
                    },
                };

                await _publishForAction({
                    action: actionSectionType,
                    workspaceId: workspace?.id,
                    timeZoneStaff,
                    timeZoneParticipant: timeZoneStaff,
                    companyId: workspace.idCompanyFk,
                    booking: bookingForUser,
                    notificationConfig,
                });
            } catch (err: any) {
                console.error("[createNotification] notify staff error:", { staffId }, err?.message || err);
            }
        })
    );
};

const _publishToClients = async (params: {
    clientList: any[];
    firstStaffId?: string;
    firstStaff?: any;
    bookingBase: BookingSnap;
    workspace: any;
    notificationConfig: any;
    actionSectionType: ActionKey;
}) => {
    const { clientList, firstStaffId, firstStaff, bookingBase, workspace, notificationConfig, actionSectionType } = params;
    const timeZoneStaffDefault = firstStaff?.timeZone ?? workspace?.timeZone ?? "UTC";

    await Promise.all(
        (clientList || []).map(async (client) => {
            const email = (client as any)?.email;
            const phoneE164 = _toPhoneE164(client);
            if (!email && !phoneE164) return;

            const timeZoneParticipant = client?.timeZone ?? workspace?.timeZone ?? "UTC";

            try {
                const bookingForClient = {
                    ...bookingBase,
                    client: { id: client.id, email, phoneE164 },
                    ...(firstStaffId ? { business: { id: firstStaffId } } : {}),
                };

                await _publishForAction({
                    action: actionSectionType,
                    workspaceId: workspace.id,
                    timeZoneStaff: timeZoneStaffDefault,
                    timeZoneParticipant,
                    companyId: workspace.idCompanyFk,
                    booking: bookingForClient,
                    notificationConfig,
                });
            } catch (err: any) {
                console.error(
                    "[createNotification] notify client error:",
                    { id: (client as any)?.id },
                    err?.message || err
                );
            }
        })
    );
};

/**
 * Crea y envía notificaciones a partir de un booking (idGroup).
 *
 * - Carga GroupEvents (booking) + eventos asociados para saber si hay varios staff.
 * - Obtiene configuración de notificaciones del workspace.
 * - Publica notificación para cada staff involucrado.
 * - Publica notificación para cada cliente participante (si hay contacto).
 */
export const createNotification = async (
    idGroup: string,
    plan: { actionSectionType: ActionKey }
) => {
    if (typeof idGroup !== "string" || idGroup.trim().length === 0) return;

    const group = await _loadGroup(idGroup);
    if (!group || group.deletedDate) return;

    const { idWorkspaceFk: idWorkspace, idCompanyFk: idCompany } = group;
    if (!idWorkspace || !idCompany) return;

    const clientParticipantIds = _uniqNonEmptyStrings(group.eventParticipant.map((p) => p?.idClientWorkspaceFk));
    const staffIds = _uniqNonEmptyStrings(group.events.map((e) => e?.idUserPlatformFk));

    const [workspaces, clientList, userList] = await Promise.all([
        getWorkspacesByIds([idWorkspace]),
        clientParticipantIds.length
            ? getClientWorkspacesByIds(clientParticipantIds, idCompany)
            : Promise.resolve([]),
        staffIds.length ? getUsersByIds(staffIds) : Promise.resolve([]),
    ]);

    const workspace = workspaces?.[0];
    if (!workspace) return;

    const notificationConfig = workspace?.generalNotificationConfigJson;
    if (!notificationConfig) return;

    const userById = new Map<string, any>((userList || []).filter((u) => u?.id).map((u) => [u.id, u]));
    const bookingBase = _buildBookingBase(group);

    await _publishToStaff({
        staffIds,
        userById,
        bookingBase,
        workspace,
        notificationConfig,
        actionSectionType: plan.actionSectionType,
    });

    await _publishToClients({
        clientList,
        firstStaffId: staffIds[0],
        firstStaff: staffIds[0] ? userById.get(staffIds[0]) : undefined,
        bookingBase,
        workspace,
        notificationConfig,
        actionSectionType: plan.actionSectionType,
    });
};
