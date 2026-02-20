import jwt from "jsonwebtoken";
import { MANAGE_EVENT_WORKERS } from "../features/event-platform/utils/manage-event-options.util";

const port = process.env.PORT || "3201";
const baseUrl = `http://localhost:${port}`;

if (!process.env.JWT_PRIVATE_KEY) {
    throw new Error("JWT_PRIVATE_KEY is required to generate a demo token");
}

const claims = {
    idUser: process.env.DEMO_ID_USER ?? MANAGE_EVENT_WORKERS.David,
    idCompanySelected:
        process.env.DEMO_ID_COMPANY_SELECTED ?? "2fd3e7b0-10d1-45bf-80d4-00f92ff97a31",
    role: process.env.DEMO_ROLE ?? "ROLE_OWNER",
};
const token = jwt.sign(claims, process.env.JWT_PRIVATE_KEY, { expiresIn: "2h" });
const payload = {
    type: "event",
    mode: "create",
    idCompany: process.env.DEMO_ID_COMPANY ?? "2fd3e7b0-10d1-45bf-80d4-00f92ff97a31",
    idWorkspace: process.env.DEMO_ID_WORKSPACE ?? "29f8a525-d3f2-4bc2-89bb-f0f1f1958de9",
    startDate: "2026-02-20T10:00:00.000Z",
    endDate: "2026-02-20T11:30:00.000Z",
    sendNotification: false,
    commentClient: "Portfolio demo booking",
    services: [
        {
            idService: process.env.DEMO_ID_SERVICE ?? "dc3f6ee6-7ac3-4d56-9f23-cdbaf936f8bb",
            duration: 60,
            name: "Haircut",
            price: 25,
            discount: 0,
            idWorker: process.env.DEMO_ID_WORKER ?? MANAGE_EVENT_WORKERS.David,
        },
    ],
    clients: [
        {
            idClient: process.env.DEMO_ID_CLIENT ?? "a2a81aad-d012-41b8-8c4e-aa5c2e6aa356",
            idClientWorkspace:
                process.env.DEMO_ID_CLIENT_WORKSPACE ?? "33f6cd95-1524-4167-b882-f3118ea2ccf6",
        },
    ],
};

console.log("");
console.log("=== Portfolio Demo Quickstart ===");
console.log(`Base URL: ${baseUrl}`);
console.log(`Integrations mode: ${process.env.INTEGRATIONS_MODE ?? "http"}`);
console.log("");
console.log("1) Health");
console.log(`curl -s ${baseUrl}/health`);
console.log("");
console.log("2) JWT for protected endpoint");
console.log(token);
console.log("");
console.log("3) Protected endpoint curl");
console.log(
    `curl -i -X POST '${baseUrl}/api/events/v2/platform/manage-event' -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '${JSON.stringify(payload)}'`
);
console.log("");
console.log("4) Optional query selectors in the original endpoint");
console.log(
    `curl -i -X POST '${baseUrl}/api/events/v2/platform/manage-event?worker=David&startSlot=10:15&date=2026-02-20&eventStatusType=PENDING' -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '${JSON.stringify(payload)}'`
);
console.log("");
