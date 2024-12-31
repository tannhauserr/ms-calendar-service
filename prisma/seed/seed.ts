import { PrismaClient, WeekDayType } from '@prisma/client';
import { generateDecemberEvents } from './util';

const prisma = new PrismaClient();

async function main() {
    // Limpia las tablas y reinicia las secuencias de IDs
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "userServices" RESTART IDENTITY CASCADE'); // Depende de servicios
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "workerBusinessHours" RESTART IDENTITY CASCADE'); // Depende de trabajadores
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "temporaryBusinessHours" RESTART IDENTITY CASCADE'); // Dependiente
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "workerAbsences" RESTART IDENTITY CASCADE'); // Dependiente
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "businessHours" RESTART IDENTITY CASCADE'); // Dependiente
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "services" RESTART IDENTITY CASCADE'); // Depende de categorías
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "categoryEstablishments" RESTART IDENTITY CASCADE'); // Relación intermedia
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "categories" RESTART IDENTITY CASCADE'); // Independiente
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "events" RESTART IDENTITY CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "calendars" RESTART IDENTITY CASCADE');

    // IDs de la compañía y establecimientos
    const companyId = 'e56d5de9-1155-43ad-b1cc-b4d30d2f5407';
    const establishment1Id = '13fbe22z-1i14-453a-8e74-ac0f81515jo8';
    const establishment2Id = '86fbe24c-2f14-466a-8e74-ac0f81515ac9';
    const establishmetList = [establishment1Id, establishment2Id];



    // Datos de los usuarios provenientes de ms-login
    const usersData = [
        {
            id: '01afbe2a-1a14-453a-maria-ac0f81515a01',
            email: 'maria.garcia@example.com',
            name: 'María',
            lastName: 'García',
            idEstablishmentFk: establishment1Id,
            roleId: 3, // ROLE_USER
        },
        {
            id: '01bfbe2b-1b14-453a-carlos-ac0f81515a02',
            email: 'carlos.lopez@example.com',
            name: 'Carlos',
            lastName: 'López',
            idEstablishmentFk: establishment2Id,
            roleId: 3, // ROLE_USER
        },
        {
            id: '01cfbe2c-1c14-453a-ana-ac0f81515a03',
            email: 'ana.martinez@example.com',
            name: 'Ana',
            lastName: 'Martínez',
            idEstablishmentFk: establishment1Id,
            roleId: 3, // ROLE_USER
        },
        {
            id: '01dfbe2d-1d14-453a-luis-ac0f81515a04',
            email: 'luis.rodriguez@example.com',
            name: 'Luis',
            lastName: 'Rodríguez',
            idEstablishmentFk: establishment2Id,
            roleId: 3, // ROLE_USER
        },
        {
            id: '01efbe2e-1e14-453a-elena-ac0f81515a05',
            email: 'elena.sanchez@example.com',
            name: 'Elena',
            lastName: 'Sánchez',
            idEstablishmentFk: establishment1Id,
            roleId: 3, // ROLE_USER
        },
        {
            id: '01ffbe2f-1f14-453a-admin-ac0f81515a06',
            email: 'admin.user@example.com',
            name: 'Admin',
            lastName: 'User',
            idEstablishmentFk: establishment2Id,
            roleId: 2, // ROLE_ADMIN
        },
    ];

    // No creamos usuarios en ms-calendar; utilizamos los IDs existentes

    // Crear categorías
    const categoriesData = [
        {
            idCompanyFk: companyId,
            name: 'Cortes de Pelo',
            description: 'Servicios de cortes de pelo para hombres y mujeres',
        },
        {
            idCompanyFk: companyId,
            name: 'Coloración',
            description: 'Tintes y mechas para el cabello',
        },
        {
            idCompanyFk: companyId,
            name: 'Tratamientos',
            description: 'Tratamientos capilares y de belleza',
        },
    ];

    const categories: any[] = [];
    for (const categoryData of categoriesData) {
        const category = await prisma.category.create({
            data: {
                idCompanyFk: categoryData.idCompanyFk,
                name: categoryData.name,
                description: categoryData.description,
            },
        });
        categories.push(category);
    }


    // Crear relaciones entre categorías y establecimientos
    const categoryEstablishmentsData = [
        {
            idCategoryFk: categories[0].id, // 'Cortes de Pelo'
            idEstablishmentFk: establishment1Id,
        },
        {
            idCategoryFk: categories[0].id, // 'Cortes de Pelo'
            idEstablishmentFk: establishment2Id,
        },
        {
            idCategoryFk: categories[1].id, // 'Coloración'
            idEstablishmentFk: establishment1Id,
        },
        {
            idCategoryFk: categories[1].id, // 'Coloración'
            idEstablishmentFk: establishment2Id,
        },
        {
            idCategoryFk: categories[2].id, // 'Tratamientos'
            idEstablishmentFk: establishment1Id,
        },
        {
            idCategoryFk: categories[2].id, // 'Tratamientos'
            idEstablishmentFk: establishment2Id,
        },
    ];

    for (const ceData of categoryEstablishmentsData) {
        await prisma.categoryEstablishment.create({
            data: ceData,
        });
    }


    // Crear servicios
    const servicesData = [
        {
            idCompanyFk: companyId,
            name: 'Corte de Caballero',
            description: 'Corte de pelo para hombres',
            duration: 30,
            price: 15.0,
            idCategoryFk: categories[0].id,
        },
        {
            idCompanyFk: companyId,
            name: 'Corte de Dama',
            description: 'Corte de pelo para mujeres',
            duration: 45,
            price: 25.0,
            idCategoryFk: categories[0].id,
        },
        {
            idCompanyFk: companyId,
            name: 'Tinte Completo',
            description: 'Coloración completa del cabello',
            duration: 90,
            price: 50.0,
            idCategoryFk: categories[1].id,
        },
        {
            idCompanyFk: companyId,
            name: 'Mechas',
            description: 'Aplicación de mechas y reflejos',
            duration: 60,
            price: 40.0,
            idCategoryFk: categories[1].id,
        },
        {
            idCompanyFk: companyId,
            name: 'Tratamiento de Keratina',
            description: 'Alisado y reparación del cabello',
            duration: 120,
            price: 80.0,
            idCategoryFk: categories[2].id,
        },
        {
            idCompanyFk: companyId,
            name: 'Mascarilla Capilar',
            description: 'Hidratación profunda del cabello',
            duration: 30,
            price: 20.0,
            idCategoryFk: categories[2].id,
        },
        {
            idCompanyFk: companyId,
            name: 'Manicura',
            description: 'Cuidado y esmaltado de uñas',
            duration: 45,
            price: 25.0,
            idCategoryFk: categories[2].id,
        },
    ];

    const services: any[] = [];
    for (const serviceData of servicesData) {
        const service = await prisma.service.create({
            data: {
                idCompanyFk: serviceData.idCompanyFk,
                name: serviceData.name,
                description: serviceData.description,
                duration: serviceData.duration,
                price: serviceData.price,
                idCategoryFk: serviceData.idCategoryFk,
            },
        });
        services.push(service);
    }

    // Obtener los usuarios por nombre utilizando usersData
    const usersByName = Object.fromEntries(usersData.map(user => [user.name, user]));

    const maria = usersByName['María'];
    const carlos = usersByName['Carlos'];
    const ana = usersByName['Ana'];
    const luis = usersByName['Luis'];
    const elena = usersByName['Elena'];
    const javier = usersByName['Admin']; // Admin user

    // Asignar servicios a los usuarios de acuerdo a sus especialidades

    // Definir las especialidades de cada usuario
    const userSpecialties = [
        {
            user: maria,
            services: [
                services.find(s => s.name === 'Corte de Caballero'),
                services.find(s => s.name === 'Corte de Dama'),
                services.find(s => s.name === 'Tratamiento de Keratina'),
                services.find(s => s.name === 'Mascarilla Capilar'),
            ],
        },
        {
            user: carlos,
            services: [
                services.find(s => s.name === 'Tinte Completo'),
                services.find(s => s.name === 'Mechas'),
            ],
        },
        {
            user: ana,
            services: [
                services.find(s => s.name === 'Manicura'),
                services.find(s => s.name === 'Mascarilla Capilar'),
                services.find(s => s.name === 'Tratamiento de Keratina'),
            ],
        },
        {
            user: luis,
            services: [
                services.find(s => s.name === 'Corte de Caballero'),
                services.find(s => s.name === 'Tratamiento de Keratina'),
            ],
        },
        {
            user: elena,
            services: [
                services.find(s => s.name === 'Corte de Dama'),
                services.find(s => s.name === 'Mascarilla Capilar'),
            ],
        },
        {
            user: javier,
            services: [
                services.find(s => s.name === 'Tinte Completo'),
                services.find(s => s.name === 'Mechas'),
                services.find(s => s.name === 'Tratamiento de Keratina'),
            ],
        },
    ];

    // Asignar los servicios a cada usuario según sus especialidades
    for (const specialty of userSpecialties) {
        for (const service of specialty.services) {
            await prisma.userService.create({
                data: {
                    idCompanyFk: companyId,
                    idUserFk: specialty.user.id,
                    idServiceFk: service.id,
                },
            });
        }
    }

    // Crear horarios de negocio (BusinessHour) con múltiples intervalos
    const businessHoursData: any[] = [];

    const daysOfWeek = [
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
    ];

    for (const day of daysOfWeek) {
        // Primer intervalo: 9:00 - 13:00
        businessHoursData.push({
            idCompanyFk: companyId,
            weekDayType: day as WeekDayType,
            startTime: new Date('1970-01-01T09:00:00Z'),
            endTime: new Date('1970-01-01T13:00:00Z'),
            closed: false,
        });
        // Segundo intervalo: 15:00 - 20:00
        businessHoursData.push({
            idCompanyFk: companyId,
            weekDayType: day as WeekDayType,
            startTime: new Date('1970-01-01T15:00:00Z'),
            endTime: new Date('1970-01-01T20:00:00Z'),
            closed: false,
        });
    }

    // Sábado con un solo intervalo
    businessHoursData.push({
        idCompanyFk: companyId,
        weekDayType: 'SATURDAY',
        startTime: new Date('1970-01-01T10:00:00Z'),
        endTime: new Date('1970-01-01T14:00:00Z'),
        closed: false,
    });

    // Domingo cerrado
    businessHoursData.push({
        idCompanyFk: companyId,
        weekDayType: 'SUNDAY',
        startTime: null,
        endTime: null,
        closed: true,
    });


    for (const establishmentId of establishmetList) {
        for (const bhData of businessHoursData) {
            await prisma.businessHour.create({
                data: {
                    ...bhData,
                    idEstablishmentFk: establishmentId,
                },
            });
        }
    }
    // for (const bhData of businessHoursData) {
    //     await prisma.businessHour.create({
    //         data: bhData,
    //     });
    // }

    // Crear horarios de trabajadores (WorkerBusinessHour) con múltiples intervalos

    // María trabaja los lunes, miércoles y viernes con intervalos
    const mariaWorkHours: any[] = [];

    ['MONDAY', 'WEDNESDAY', 'FRIDAY'].forEach((day) => {
        // Primer intervalo: 10:00 - 13:00
        mariaWorkHours.push({
            idUserFk: maria.id,
            idCompanyFk: companyId,
            weekDayType: day as WeekDayType,
            startTime: new Date('1970-01-01T10:00:00Z'),
            endTime: new Date('1970-01-01T13:00:00Z'),
            closed: false,
        });
        // Segundo intervalo: 14:00 - 16:00
        mariaWorkHours.push({
            idUserFk: maria.id,
            idCompanyFk: companyId,
            weekDayType: day as WeekDayType,
            startTime: new Date('1970-01-01T14:00:00Z'),
            endTime: new Date('1970-01-01T16:00:00Z'),
            closed: false,
        });
    });

    // Carlos trabaja los martes y jueves con intervalos
    const carlosWorkHours: any[] = [];

    ['TUESDAY', 'THURSDAY'].forEach((day) => {
        // Primer intervalo: 12:00 - 15:00
        carlosWorkHours.push({
            idUserFk: carlos.id,
            idCompanyFk: companyId,
            weekDayType: day as WeekDayType,
            startTime: new Date('1970-01-01T12:00:00Z'),
            endTime: new Date('1970-01-01T15:00:00Z'),
            closed: false,
        });
        // Segundo intervalo: 16:00 - 20:00
        carlosWorkHours.push({
            idUserFk: carlos.id,
            idCompanyFk: companyId,
            weekDayType: day as WeekDayType,
            startTime: new Date('1970-01-01T16:00:00Z'),
            endTime: new Date('1970-01-01T20:00:00Z'),
            closed: false,
        });
    });

    const workerBusinessHoursData = [...mariaWorkHours, ...carlosWorkHours];

    for (const wbhData of workerBusinessHoursData) {
        await prisma.workerBusinessHour.create({
            data: wbhData,
        });
    }

    // Crear horarios temporales
    // La empresa cierra el día de Navidad
    const companyClosedDate = new Date('2024-12-25');

    await prisma.temporaryBusinessHour.create({
        data: {
            idCompanyFk: companyId,
            date: companyClosedDate,
            startTime: null,
            endTime: null,
            closed: true,
        },
    });

    // María tiene cita médica el 15 de noviembre, no trabaja ese día
    const mariaOffDate = new Date('2024-11-15');

    await prisma.temporaryBusinessHour.create({
        data: {
            idCompanyFk: companyId,
            idUserFk: maria.id,
            date: mariaOffDate,
            startTime: null,
            endTime: null,
            closed: true,
        },
    });

    // La empresa abre excepcionalmente el domingo 20 de noviembre
    const specialOpeningDate = new Date('2024-11-20');

    await prisma.temporaryBusinessHour.create({
        data: {
            idCompanyFk: companyId,
            date: specialOpeningDate,
            startTime: new Date('1970-01-01T10:00:00Z'),
            endTime: new Date('1970-01-01T14:00:00Z'),
            closed: false,
        },
    });

    const calendarsData = [
        {
            id: 'calendar-1-uuid', // UUID o ID personalizado para el calendario
            idCompanyFk: companyId,
            idEstablishmentFk: establishment1Id,
            createdDate: new Date(),
            updatedDate: new Date(),
        },
        {
            id: 'calendar-2-uuid',
            idCompanyFk: companyId,
            idEstablishmentFk: establishment2Id,
            createdDate: new Date(),
            updatedDate: new Date(),
        },
    ];

    const calendars: { id: string; idCompanyFk: string; idEstablishmentFk: string; createdDate: Date; updatedDate: Date; }[] = [];
    for (const calendarData of calendarsData) {
        const calendar = await prisma.calendar.create({
            data: calendarData,
        });
        calendars.push(calendar);
    }


    await generateDecemberEvents();

    // // Crear eventos para diciembre de 2024 vinculados a los calendarios
    // const eventsData = [
    //     {
    //         title: 'Reunión de Equipo',
    //         description: 'Reunión semanal del equipo para discutir avances y planificación',
    //         startDate: new Date('2024-12-02T10:00:00Z'),
    //         endDate: new Date('2024-12-02T11:00:00Z'),
    //         idCalendarFk: calendars[0].id, // Vinculado al primer calendario
    //         idUserPlatformFk: '01afbe2a-1a14-453a-maria-ac0f81515a01', // ID de María
    //         eventPurposeType: "APPOINTMENT",
    //         eventSourceType: 'PLATFORM',
    //         eventStatusType: 'CONFIRMED',
    //     },
    //     {
    //         title: 'Taller de Capacitación',
    //         description: 'Capacitación para el uso de nuevas herramientas',
    //         startDate: new Date('2024-12-05T09:00:00Z'),
    //         endDate: new Date('2024-12-05T12:00:00Z'),
    //         idCalendarFk: calendars[1].id, // Vinculado al segundo calendario
    //         idUserPlatformFk: '01bfbe2b-1b14-453a-carlos-ac0f81515a02', // ID de Carlos
    //         eventPurposeType: "APPOINTMENT",
    //         eventSourceType: 'PLATFORM',
    //         eventStatusType: 'CONFIRMED',
    //     },
    //     {
    //         title: 'Revisión Anual de Desempeño',
    //         description: 'Evaluación de desempeño individual',
    //         startDate: new Date('2024-12-10T14:00:00Z'),
    //         endDate: new Date('2024-12-10T16:00:00Z'),
    //         idCalendarFk: calendars[0].id, // Vinculado al primer calendario
    //         idUserPlatformFk: '01cfbe2c-1c14-453a-ana-ac0f81515a03', // ID de Ana
    //         eventPurposeType: "APPOINTMENT",
    //         eventSourceType: 'PLATFORM',
    //         eventStatusType: 'PENDING',
    //     },
    //     {
    //         title: 'Fiesta de Fin de Año',
    //         description: 'Celebración de fin de año con todo el equipo',
    //         startDate: new Date('2024-12-20T18:00:00Z'),
    //         endDate: new Date('2024-12-20T23:00:00Z'),
    //         idCalendarFk: calendars[1].id, // Vinculado al segundo calendario
    //         idUserPlatformFk: '01dfbe2d-1d14-453a-luis-ac0f81515a04', // ID de Luis
    //         eventPurposeType: "APPOINTMENT",
    //         eventSourceType: 'PLATFORM',
    //         eventStatusType: 'CONFIRMED',
    //     },
    //     {
    //         title: 'Cierre por Navidad',
    //         description: 'La empresa estará cerrada por Navidad',
    //         startDate: new Date('2024-12-25T00:00:00Z'),
    //         endDate: new Date('2024-12-25T23:59:59Z'),
    //         idCalendarFk: calendars[0].id, // Vinculado al primer calendario
    //         idUserPlatformFk: null,
    //         eventPurposeType: "APPOINTMENT",
    //         eventSourceType: 'PLATFORM',
    //         eventStatusType: 'CANCELLED',
    //     },
    //     {
    //         title: 'Cierre por Fin de Año',
    //         description: 'La empresa estará cerrada para celebrar el Año Nuevo',
    //         startDate: new Date('2024-12-31T00:00:00Z'),
    //         endDate: new Date('2024-12-31T23:59:59Z'),
    //         idCalendarFk: calendars[1].id, // Vinculado al segundo calendario
    //         idUserPlatformFk: null,
    //         eventPurposeType: "APPOINTMENT",
    //         eventSourceType: 'PLATFORM',
    //         eventStatusType: 'CANCELLED',
    //     },
    // ];

    // for (const eventData of eventsData) {
    //     await prisma.event.create({
    //         data: eventData as any,
    //     });
    // }

    console.log('Seed data created successfully with updated user references!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });