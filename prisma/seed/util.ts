import { PrismaClient, eventPurposeType, EventStatusType, EventSourceType } from '@prisma/client';

const prisma = new PrismaClient();

const HOURS_RANGE = { start: 8, end: 20 };
const EVENT_TYPES: eventPurposeType[] = ['APPOINTMENT', 'VACATION', 'SICK_LEAVE', 'PERSONAL_DAY'];
const EVENT_STATUSES: EventStatusType[] = ['CONFIRMED', 'PENDING'];
const MAX_EVENTS_PER_DAY = 10; // Incrementa eventos por día para lograr 1000

export async function generateDecemberEvents() {
    const calendars = [
        { id: 'calendar-1-uuid', establishmentId: '13fbe22z-1i14-453a-8e74-ac0f81515jo8' },
        { id: 'calendar-2-uuid', establishmentId: '86fbe24c-2f14-466a-8e74-ac0f81515ac9' },
    ];

    const users = [
        { id: '01afbe2a-1a14-453a-maria-ac0f81515a01', establishmentId: calendars[0].establishmentId },
        { id: '01bfbe2b-1b14-453a-carlos-ac0f81515a02', establishmentId: calendars[1].establishmentId },
        { id: '01cfbe2c-1c14-453a-ana-ac0f81515a03', establishmentId: calendars[0].establishmentId },
        { id: '01dfbe2d-1d14-453a-luis-ac0f81515a04', establishmentId: calendars[1].establishmentId },
        { id: '01efbe2e-1e14-453a-elena-ac0f81515a05', establishmentId: calendars[0].establishmentId },
    ];

    const servicesByEstablishment = {
        '13fbe22z-1i14-453a-8e74-ac0f81515jo8': [ // Establecimiento 1
            { id: 1, name: 'Corte de Caballero' },
            { id: 2, name: 'Corte de Dama' },
            { id: 3, name: 'Mascarilla Capilar' },
        ],
        '86fbe24c-2f14-466a-8e74-ac0f81515ac9': [ // Establecimiento 2
            { id: 4, name: 'Tinte Completo' },
            { id: 5, name: 'Mechas' },
            { id: 6, name: 'Tratamiento de Keratina' },
        ],
    };

    const daysInDecember = Array.from({ length: 31 }, (_, i) => new Date(2024, 11, i + 1));

    const events: {
        title: string;
        description: string;
        startDate: Date;
        endDate: Date;
        idCalendarFk: string;
        idUserPlatformFk: string;
        idServiceFk: number;
        eventPurposeType: eventPurposeType;
        eventSourceType: EventSourceType;
        eventStatusType: EventStatusType;
    }[] = [];

    for (const user of users) {
        const userCalendar = calendars.find(c => c.establishmentId === user.establishmentId)?.id;

        if (!userCalendar) {
            throw new Error(`No calendar found for user ${user.id}`);
        }

        const validServices = servicesByEstablishment[user.establishmentId];

        for (const day of daysInDecember) {
            let currentTime = HOURS_RANGE.start * 60; // Minutos desde las 8:00 AM
            let eventsToday = 0;

            while (eventsToday < MAX_EVENTS_PER_DAY && currentTime < HOURS_RANGE.end * 60) {
                const duration = getRandomDuration(30, 120);
                const startMinutes = currentTime;
                const endMinutes = currentTime + duration;

                if (endMinutes > HOURS_RANGE.end * 60) break;

                const startDate = new Date(day);
                startDate.setHours(Math.floor(startMinutes / 60), startMinutes % 60);

                const endDate = new Date(day);
                endDate.setHours(Math.floor(endMinutes / 60), endMinutes % 60);

                const eventPurposeType: any = Math.random() < 0.85 ? 'APPOINTMENT' : getRandomElement(EVENT_TYPES);
                const eventStatusType: any = getRandomElement(EVENT_STATUSES);
                const service: any = getRandomElement(validServices);

                events.push({
                    title: `${eventPurposeType} - ${service.name}`,
                    description: `Evento ${eventPurposeType} usando ${service.name}`,
                    startDate,
                    endDate,
                    idCalendarFk: userCalendar,
                    idUserPlatformFk: user.id,
                    idServiceFk: service.id,
                    eventPurposeType,
                    eventSourceType: 'PLATFORM',
                    eventStatusType,
                });

                currentTime = endMinutes + getRandomGap(15, 30);
                eventsToday++;
            }
        }
    }

    // Insertar eventos en la base de datos
    for (const event of events) {
        await prisma.event.create({ data: event });
    }

    console.log(`Se generaron ${events.length} eventos correctamente.`);
}

// Funciones auxiliares
function getRandomDuration(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomGap(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement<T>(array: T[]): T {
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}

