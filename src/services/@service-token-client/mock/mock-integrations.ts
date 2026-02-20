import { BookingPageBrief } from "../../@redis/cache/interfaces/models/booking-brief";
import { ClientBrief, ClientWorkspaceBrief } from "../../@redis/cache/interfaces/models/client-brief";
import { ServiceBrief } from "../../@redis/cache/interfaces/models/service-brief";
import { UserBrief } from "../../@redis/cache/interfaces/models/user-brief";
import { WorkspaceBrief } from "../../@redis/cache/interfaces/models/workspace-brief";

const DEFAULT_IDS = {
    company: "2fd3e7b0-10d1-45bf-80d4-00f92ff97a31",
    workspace: "29f8a525-d3f2-4bc2-89bb-f0f1f1958de9",
    category: "17d5df2e-9403-4f6f-9f5e-4c59ce8c8a2f",
    service: "dc3f6ee6-7ac3-4d56-9f23-cdbaf936f8bb",
    client: "a2a81aad-d012-41b8-8c4e-aa5c2e6aa356",
    clientWorkspace: "33f6cd95-1524-4167-b882-f3118ea2ccf6",
    workerDavid: "2917f4e1-3e9e-4868-a1f0-fc4f26fbf531",
    workerGrabiella: "5a7a6d26-3e8d-4f58-b851-2f83a2f7fbb4",
    workerScott: "b8f8f539-52b7-4c8a-98b0-92190ca9676e",
} as const;

const now = () => new Date();

const workerIds = (): string[] => {
    const configured = process.env.DEMO_ID_WORKER;
    return Array.from(
        new Set(
            [
                configured,
                DEFAULT_IDS.workerDavid,
                DEFAULT_IDS.workerGrabiella,
                DEFAULT_IDS.workerScott,
            ].filter((value): value is string => !!value)
        )
    );
};

const demoCompanyId = () => process.env.DEMO_ID_COMPANY ?? DEFAULT_IDS.company;
const demoWorkspaceId = () => process.env.DEMO_ID_WORKSPACE ?? DEFAULT_IDS.workspace;
const demoCategoryId = () => process.env.DEMO_ID_CATEGORY ?? DEFAULT_IDS.category;
const demoServiceId = () => process.env.DEMO_ID_SERVICE ?? DEFAULT_IDS.service;
const demoClientId = () => process.env.DEMO_ID_CLIENT ?? DEFAULT_IDS.client;
const demoClientWorkspaceId = () =>
    process.env.DEMO_ID_CLIENT_WORKSPACE ?? DEFAULT_IDS.clientWorkspace;

export const isMockIntegrationsMode = (): boolean =>
    String(process.env.INTEGRATIONS_MODE ?? "http").trim().toLowerCase() === "mock";

const buildMockWorkspace = (
    idWorkspace: string,
    idCompany: string
): WorkspaceBrief => ({
    id: idWorkspace,
    idCompanyFk: idCompany,
    name: "Demo Workspace",
    slug: "demo-workspace",
    code: "DEMO",
    email: "demo@workspace.local",
    phoneCode: "+34",
    phoneNumber: "600000000",
    address: "Demo Street",
    addressComplement: null,
    addressNumber: "1",
    postalCode: "28001",
    province: "Madrid",
    city: "Madrid",
    country: "ES",
    latitude: 40.4168,
    longitude: -3.7038,
    timeZone: "Europe/Madrid",
    image: null,
    description: "Workspace mock para portfolio",
    generalConfigJson: {
        schemaVersion: 2,
        idCompany: idCompany,
        idWorkspace: idWorkspace,
        codeWorkspace: "DEMO",
        page: {
            id: "page-default",
            name: "Reservas",
            enabled: true,
        },
        template: {
            type: "catalog",
        },
        seo: {
            title: "",
            slug: "",
            description: "",
            imageUrl: "",
            noindex: false,
        },
        brand: {
            name: "Mi Negocio",
            shortName: "MiNegocio",
            description: "",
            logoUrl: "",
            coverUrl: "",
            gallery: [],
            social: {
                linkedin: "",
                facebook: "",
                x: "",
                instagram: "",
                tiktok: "",
                website: "",
                blueSky: "",
            },
            icons: [],
        },
        services: {
            mode: "all",
            selectionsByCategory: {},
        },
        slot: {
            stepMinutes: 30,
            alignToClock: true,
            bufferBeforeMin: 0,
            bufferAfterMin: 0,
            alignMode: "service",
        },
        bookingWindow: {
            minLeadTimeMin: 60,
            maxAdvanceDays: 45,
            sameDayCutoffHourLocal: 0,
        },
        limits: {
            perUserPerDay: 5,
            perUserConcurrent: 5,
            maxServicesPerBooking: 1,
        },
        ui: {
            showAddress: true,
            showPhone: false,
            labels: {
                event: "Cita",
                service: "Servicio",
                staff: "Profesional",
            },
            showStaffPicker: false,
            colorUI: "light",
            colors: {
                mode: "classic",
                color: "#0ea5e9",
                background: {
                    type: "gradient",
                    intensity: "low",
                    direction: "top",
                },
            },
        },
        i18n: {
            locale: "es",
            labels: {},
        },
        policies: {
            allowCancel: true,
            cancelMinHours: 24,
            allowReschedule: true,
            rescheduleMinHours: 12,
            noShowPenalty: false,
            cancellationPolicyText: "",
            cancellationPolicyUrl: "",
        },
        legal: {
            extraTitle: "",
            extraText: "",
        },
        resources: {
            mode: "allowlist",
            ids: workerIds().map((id) => [id, 100]),
            groupIds: [],
        },
    },
    generalNotificationConfigJson: null,
    generalMarketingConfigJson: null,
});

const buildMockClient = (idClient: string): ClientBrief => ({
    id: idClient,
    username: "demo-client",
    name: "Demo",
    surname1: "Client",
    email: "demo.client@example.com",
    languageType: "es",
    clientStatusType: "VERIFIED",
    phoneCode: "+34",
    phoneNumber: "600000000",
    image: undefined,
    allowNotifications: true,
    allowEmailNotifications: true,
    allowWhatsappNotifications: true,
    allowSmsNotifications: true,
    allowPushNotifications: true,
    allowMarketingNotifications: false,
    allowMarketingEmailNotifications: false,
    allowMarketingWhatsappNotifications: false,
    allowMarketingSmsNotifications: false,
    allowMarketingPushNotifications: false,
    timeZone: "Europe/Madrid",
    isBanned: false,
    clientWorkspaces: [],
});

const buildMockClientWorkspace = (
    idClientWorkspace: string,
    idClient: string,
    idWorkspace: string,
    idCompany: string
): ClientWorkspaceBrief => {
    const client = buildMockClient(idClient);
    const clientWorkspace: ClientWorkspaceBrief = {
        id: idClientWorkspace,
        name: "Demo Cliente",
        surname1: "Portfolio",
        surname2: undefined,
        email: "demo.client@example.com",
        image: undefined,
        phoneCode: "+34",
        phoneNumber: "600000000",
        comments: "Mock profile",
        idClientFk: idClient,
        idWorkspaceFk: idWorkspace,
        idCompanyFk: idCompany,
        isBanned: false,
        client,
        allowNotificationsFromAdmin: true,
        allowEmailNotificationsFromAdmin: true,
        allowWhatsappNotificationsFromAdmin: true,
        allowSmsNotificationsFromAdmin: true,
        allowPushNotificationsFromAdmin: true,
        allowMarketingNotificationsFromAdmin: false,
        allowMarketingEmailNotificationsFromAdmin: false,
        allowMarketingWhatsappNotificationsFromAdmin: false,
        allowMarketingSmsNotificationsFromAdmin: false,
        allowMarketingPushNotificationsFromAdmin: false,
    };

    client.clientWorkspaces = [clientWorkspace];

    return clientWorkspace;
};

const buildMockService = (
    idService: string,
    idWorkspace: string,
    idCompany: string
): ServiceBrief => ({
    id: idService,
    idCompanyFk: idCompany,
    idWorkspaceFk: idWorkspace,
    name: "Haircut",
    description: "Servicio mock para demo",
    duration: 60,
    price: 25,
    discount: 0,
    color: "#2f855a",
    image: null,
    isVisible: true,
    serviceType: "AT_BUSINESS",
    maxParticipants: 1,
    moderationStatusType: "APPROVED",
    createdDate: now(),
    updatedDate: now(),
    categoryServices: [
        {
            position: 0,
            category: {
                id: demoCategoryId(),
                name: "General",
                color: "#4d5fd6",
            },
        },
    ],
    userServices: workerIds().map((idUserFk) => ({ idUserFk })),
});

const buildMockCategory = (
    idWorkspace: string,
    idCompany: string
) => ({
    id: demoCategoryId(),
    idCompanyFk: idCompany,
    idWorkspaceFk: idWorkspace,
    name: "General",
    description: "Categoria mock para portfolio",
    color: "#4d5fd6",
    position: 0,
    moderationStatusType: "ACCEPTED",
});

const buildMockUser = (id: string): UserBrief => ({
    id,
    email: `${id.slice(0, 6)}@demo.local`,
    name: `Worker ${id.slice(0, 4)}`,
    surname1: "Demo",
    surname2: null,
    phoneCode: "+34",
    phoneNumber: null,
    image: null,
    timeZone: "Europe/Madrid",
    verified: true,
    verifiedAt: now().toISOString(),
    idCompanyFk: demoCompanyId(),
    idRoleFk: 3,
    roleType: "ROLE_WORKER",
    roleName: "Worker",
    v: 1,
});

export const getMockWorkspacesByIds = (
    ids: string[],
    companyId?: string
): WorkspaceBrief[] => {
    const idCompany = companyId ?? demoCompanyId();
    const allowedWorkspaceIds = new Set(
        [demoWorkspaceId(), process.env.DEMO_ID_WORKSPACE_ALT, "2e9c6bcf-5d06-4af4-b85f-df4f4f0297f9"].filter(
            (id): id is string => !!id
        )
    );
    return (ids ?? [])
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .filter((id) => allowedWorkspaceIds.has(id))
        .map((id) => buildMockWorkspace(id, idCompany));
};

export const getMockUsersByIds = (ids: string[]): UserBrief[] =>
    (ids ?? [])
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => buildMockUser(id));

export const getMockClientWorkspacesByIds = (
    ids: string[],
    idCompany?: string
): ClientWorkspaceBrief[] => {
    const companyId = idCompany ?? demoCompanyId();
    const validClientWorkspaceId = demoClientWorkspaceId();
    const validClientId = demoClientId();
    const validWorkspaceId = demoWorkspaceId();
    return (ids ?? [])
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .filter((id) => id === validClientWorkspaceId)
        .map((id) =>
            buildMockClientWorkspace(id, validClientId, validWorkspaceId, companyId)
        );
};

export const getMockClientWorkspacesByClientIds = (
    clientIds: string[],
    idCompany?: string
): ClientWorkspaceBrief[] => {
    const companyId = idCompany ?? demoCompanyId();
    const validClientId = demoClientId();
    const workspaceId = demoWorkspaceId();
    const validClientWorkspaceId = demoClientWorkspaceId();
    return (clientIds ?? [])
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .filter((idClient) => idClient === validClientId)
        .map((idClient) => {
            return buildMockClientWorkspace(
                validClientWorkspaceId,
                idClient,
                workspaceId,
                companyId
            );
        });
};

export const createMockClientWorkspaceByClientAndWorkspace = (
    idClient: string,
    idWorkspace: string,
    idCompany?: string
): ClientWorkspaceBrief | null => {
    const companyId = idCompany ?? demoCompanyId();
    const validClientId = demoClientId();
    const validWorkspaceId = demoWorkspaceId();
    if (idClient !== validClientId || idWorkspace !== validWorkspaceId) {
        return null;
    }

    const defaultClientWorkspace = demoClientWorkspaceId();
    const idClientWorkspace =
        idClient === demoClientId() && idWorkspace === demoWorkspaceId()
            ? defaultClientWorkspace
            : `${defaultClientWorkspace}-${idClient.slice(0, 4)}-${idWorkspace.slice(0, 4)}`;
    return buildMockClientWorkspace(idClientWorkspace, idClient, idWorkspace, companyId);
};

export const getMockServicesByIds = (
    ids: string[],
    idWorkspace?: string,
    idCompany?: string
): ServiceBrief[] => {
    const workspaceId = idWorkspace ?? demoWorkspaceId();
    const companyId = idCompany ?? demoCompanyId();
    const fallbackServiceId = demoServiceId();
    const requestedIds = (ids ?? []).filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
    );
    if (requestedIds.length === 0) {
        return [buildMockService(fallbackServiceId, workspaceId, companyId)];
    }

    return requestedIds.map((idService) =>
        buildMockService(idService, workspaceId, companyId)
    );
};

export const getMockServicesByUserIds = (
    userIds: string[],
    idWorkspace?: string,
    idCompany?: string
): ServiceBrief[] => {
    const workspaceId = idWorkspace ?? demoWorkspaceId();
    const companyId = idCompany ?? demoCompanyId();
    const mockService = buildMockService(demoServiceId(), workspaceId, companyId);
    const resolvedUsers = (userIds ?? []).filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
    );
    if (resolvedUsers.length === 0) return [mockService];

    mockService.userServices = resolvedUsers.map((idUserFk) => ({ idUserFk }));
    return [mockService];
};

export const getMockCategoriesByWorkspace = (
    idWorkspace?: string,
    idCompany?: string
) => {
    const workspaceId = idWorkspace ?? demoWorkspaceId();
    const companyId = idCompany ?? demoCompanyId();
    const service = buildMockService(demoServiceId(), workspaceId, companyId);
    const category = buildMockCategory(workspaceId, companyId);

    return [
        {
            ...category,
            services: [
                {
                    ...service,
                    categoryServices: service.categoryServices,
                },
            ],
        },
    ];
};

export const getMockBookingPagesByIds = (
    ids: string[],
    idWorkspace?: string
): BookingPageBrief[] => {
    const workspaceId = idWorkspace ?? demoWorkspaceId();
    const nowIso = now().toISOString();
    return (ids ?? [])
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => ({
            id,
            idWorkspaceFk: workspaceId,
            code: `demo-${id.slice(0, 6)}`,
            name: "Demo Booking Page",
            slug: "demo-booking-page",
            bookingPageStatusType: "PUBLISHED",
            seoTitle: "Demo Booking Page",
            seoDescription: "Mock booking page for demo mode",
            seoImageUrl: null,
            seoIndexable: true,
            seoCanonicalUrl: null,
            seoLocale: "es",
            bookingPageConfJson: {
                updatedAt: nowIso,
            } as any,
            bookingPageNotificationsJson: null,
            bookingPageMarketingJson: null,
            idFormPreFk: null,
            idFormPostFk: null,
            idFlowNodeFk: null,
            slugs: [],
        }));
};
