

import { PrismaClient, WeekDayType, ModerationStatusType, Service, Category } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.eventParticipant.deleteMany({});
  await prisma.externalCalendarEvent.deleteMany({});
  await prisma.workerAbsence.deleteMany({});
  await prisma.event.deleteMany({});
  // **BORRAR REGLAS DE RECURRENCIA antes de los calendarios**
  await prisma.recurrenceRule.deleteMany({});
  await prisma.calendar.deleteMany({});

  await prisma.categoryService.deleteMany({});
  await prisma.userService.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.service.deleteMany({});

  await prisma.temporaryBusinessHour.deleteMany({});
  await prisma.workerBusinessHour.deleteMany({});
  await prisma.businessHour.deleteMany({});


  // 👉 IDs que vienen de otros microservicios (no cambian)
  const companyId = 'e56d5de9-1155-43ad-b1cc-b4d30d2f5407';
  const workspace1Id = '13fbe22z-1i14-453a-8e74-ac0f81515jo8';
  const workspace2Id = '86fbe24c-2f14-466a-8e74-ac0f81515ac9';
  const workspaceList = [workspace1Id, workspace2Id];

  // 👉 Usuarios (sólo referenciamos su ID para horas de trabajo)
  const usersData = [
    { id: '01afbe2a-1a14-453a-maria-ac0f81515a01', idWorkspaceFk: workspace1Id, roleId: 3 },
    { id: '01bfbe2b-1b14-453a-carlos-ac0f81515a02', idWorkspaceFk: workspace2Id, roleId: 3 },
    { id: '01cfbe2c-1c14-453a-ana-ac0f81515a03', idWorkspaceFk: workspace1Id, roleId: 3 },
    { id: '01dfbe2d-1d14-453a-luis-ac0f81515a04', idWorkspaceFk: workspace2Id, roleId: 3 },
    { id: '01efbe2e-1e14-453a-elena-ac0f81515a05', idWorkspaceFk: workspace1Id, roleId: 3 },
    { id: '01ffbe2f-1f14-453a-admin-ac0f81515a06', idWorkspaceFk: workspace2Id, roleId: 2 },
  ];

  // 1️⃣ Horarios de negocio (Lun–Vie 09:00–18:00) por establecimiento
  const bhIntervals: { weekDayType: WeekDayType; start: string | null; end: string | null }[] = [];

  // De lunes a viernes, dos turnos
  ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].forEach(d => {
    bhIntervals.push({ weekDayType: d as WeekDayType, start: '09:00', end: '13:00' });
    bhIntervals.push({ weekDayType: d as WeekDayType, start: '15:00', end: '20:00' });
  });
  // Sábado un turno
  bhIntervals.push({ weekDayType: 'SATURDAY' as WeekDayType, start: '10:00', end: '14:00' });
  // Domingo cerrado
  bhIntervals.push({ weekDayType: 'SUNDAY' as WeekDayType, start: null, end: null });

  for (const estId of workspaceList) {
    for (const { weekDayType, start, end } of bhIntervals) {
      await prisma.businessHour.create({
        data: {
          idCompanyFk: companyId,
          idWorkspaceFk: estId,
          weekDayType,
          startTime: start,
          endTime: end,
          closed: start === null && end === null,
        },
      });
    }
  }

  // 3️⃣ Creamos 6 categorías (3 en cada establecimiento)
  const categoriesData = [
    // Establecimiento 1
    {
      idCompanyFk: companyId,
      idWorkspaceFk: workspace1Id,
      name: 'Corte de pelo',
      description: 'Servicios de corte y estilismo',
      position: 1,
      moderationStatusType: ModerationStatusType.ACCEPTED,
      color: '#4D5FD6', // azul intenso
    },
    {
      idCompanyFk: companyId,
      idWorkspaceFk: workspace1Id,
      name: 'Coloración',
      description: 'Tintes y mechas',
      position: 2,
      moderationStatusType: ModerationStatusType.ACCEPTED,
      color: '#E24D4D', // rojo elegante
    },
    {
      idCompanyFk: companyId,
      idWorkspaceFk: workspace1Id,
      name: 'Manicura',
      description: 'Uñas y cuidado de manos',
      position: 3,
      moderationStatusType: ModerationStatusType.ACCEPTED,
      color: '#D69E2E', // dorado
    },
    // Establecimiento 2
    {
      idCompanyFk: companyId,
      idWorkspaceFk: workspace2Id,
      name: 'Masajes',
      description: 'Masajes relajantes y terapia',
      position: 1,
      moderationStatusType: ModerationStatusType.ACCEPTED,
      color: '#2B6CB0', // azul calmante
    },
    {
      idCompanyFk: companyId,
      idWorkspaceFk: workspace2Id,
      name: 'Tratamientos faciales',
      description: 'Limpieza y revitalización de piel',
      position: 2,
      moderationStatusType: ModerationStatusType.ACCEPTED,
      color: '#C05621', // naranja terroso
    },
    {
      idCompanyFk: companyId,
      idWorkspaceFk: workspace2Id,
      name: 'Yoga & Bienestar',
      description: 'Clases de yoga y meditación',
      position: 3,
      moderationStatusType: ModerationStatusType.ACCEPTED,
      color: '#38B2AC', // turquesa suave
    },
  ] as const;

  const categories: Category[] = [];
  for (const cat of categoriesData) {
    const created = await prisma.category.upsert({
      where: {
        // índice único por establecimiento+nombre
        idWorkspaceFk_name: {
          idWorkspaceFk: cat.idWorkspaceFk,
          name: cat.name,
        },
      },
      update: {},
      create: cat,
    });
    categories.push(created);
  }

  // 4️⃣ Creamos 15 servicios (8 en Centro 1, 7 en Centro 2)
  const servicesData = [
    // — Centro 1 (8)
    {
      name: 'Corte básico',
      description: 'Corte sencillo',
      duration: 30,
      price: 20,
      idEst: workspace1Id,
      color: '#4D5FD6', // azul intenso
    },
    {
      name: 'Corte premium',
      description: 'Corte VIP',
      duration: 45,
      price: 35,
      idEst: workspace1Id,
      color: '#E24D4D', // rojo elegante
    },
    {
      name: 'Tinte raíz',
      description: 'Tinte profesional',
      duration: 60,
      price: 50,
      idEst: workspace1Id,
      color: '#D69E2E', // dorado
    },
    {
      name: 'Peinado express',
      description: 'Peinado rápido',
      duration: 30,
      price: 18,
      idEst: workspace1Id,
      color: '#38A169', // verde fresco
    },
    {
      name: 'Barba & Bigote',
      description: 'Perfilado y afeitado',
      duration: 20,
      price: 15,
      idEst: workspace1Id,
      color: '#718096', // gris
    },
    {
      name: 'Manicura express',
      description: 'Uñas rápidas',
      duration: 40,
      price: 25,
      idEst: workspace1Id,
      color: '#D53F8C', // rosa
    },
    {
      name: 'Uñas en gel',
      description: 'Uñas gel duraderas',
      duration: 50,
      price: 30,
      idEst: workspace1Id,
      color: '#805AD5', // púrpura
    },
    {
      name: 'Tratamiento capilar',
      description: 'Nutrición profunda para pelo',
      duration: 60,
      price: 40,
      idEst: workspace1Id,
      color: '#319795', // teal
    },

    // — Centro 2 (7)
    {
      name: 'Masaje sueco',
      description: 'Relajante clásico',
      duration: 60,
      price: 60,
      idEst: workspace2Id,
      color: '#2B6CB0', // azul calmante
    },
    {
      name: 'Masaje tejido profundo',
      description: 'Alivio muscular intenso',
      duration: 70,
      price: 75,
      idEst: workspace2Id,
      color: '#C05621', // naranja terroso
    },
    {
      name: 'Piedras calientes',
      description: 'Masaje con piedras',
      duration: 75,
      price: 80,
      idEst: workspace2Id,
      color: '#9B2C2C', // vino tinto
    },
    {
      name: 'Facial limpieza',
      description: 'Limpieza profunda facial',
      duration: 50,
      price: 55,
      idEst: workspace2Id,
      color: '#38B2AC', // turquesa suave
    },
    {
      name: 'Facial anti-edad',
      description: 'Tratamiento rejuvenecedor',
      duration: 60,
      price: 65,
      idEst: workspace2Id,
      color: '#DD6B20', // naranja vibrante
    },
    {
      name: 'Clase Vinyasa Yoga',
      description: 'Nivel intermedio',
      duration: 60,
      price: 15,
      idEst: workspace2Id,
      color: '#276749', // verde profundo
    },
    {
      name: 'Clase Hatha Yoga',
      description: 'Nivel iniciación',
      duration: 60,
      price: 15,
      idEst: workspace2Id,
      color: '#805AD5', // púrpura relajante
    },
  ] as const;


  const services: { record: Service; est: string }[] = [];
  for (const svc of servicesData) {
    const created = await prisma.service.create({
      data: {
        idCompanyFk: companyId,
        idWorkspaceFk: svc.idEst,
        name: svc.name,
        description: svc.description,
        duration: svc.duration,
        price: svc.price,
        color: svc.color,
      },
    });
    services.push({ record: created, est: svc.idEst });
  }

  // 5️⃣ Asignamos cada servicio a UNA de las categorías de su mismo establecimiento
  for (let i = 0; i < services.length; i++) {
    const { record, est } = services[i];
    const catsOfEst = categories.filter(c => c.idWorkspaceFk === est);
    const cat = catsOfEst[i % catsOfEst.length];
    await prisma.categoryService.create({
      data: {
        idCategoryFk: cat.id,
        idServiceFk: record.id,
        position: (i % catsOfEst.length) + 1,
      },
    });
  }


  // alternativa con createMany
  for (const user of usersData) {
    const data = services
      .filter(s => s.est === user.idWorkspaceFk)
      .map(s => ({
        idCompanyFk: companyId,
        idUserFk: user.id,
        idServiceFk: s.record.id,
      }));
    await prisma.userService.createMany({
      data,
      skipDuplicates: true, // por si acaso
    });
  }

  // 7️⃣ Calendarios (uno por cada establecimiento)
  const calendars = await Promise.all(
    workspaceList.map((estId) =>
      prisma.calendar.create({
        data: {
          idCompanyFk: companyId,
          idWorkspaceFk: estId,
        },
      })
    )
  );

  // 8️⃣ Reglas de recurrencia (5 para cada calendar)
  const recurrenceRulesData = [
    // Calendario 1: ejemplos variados
    {
      idCalendarFk: calendars[0].id,
      dtstart: new Date('2025-06-01T10:00:00Z'),
      // Repite cada día, 30 ocurrencias
      rrule: 'FREQ=DAILY;COUNT=30',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[0].id,
    },
    {
      idCalendarFk: calendars[0].id,
      dtstart: new Date('2025-07-01T14:00:00Z'),
      // Repite semanalmente los Lunes, Miércoles y Viernes hasta fin de mes
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20250731',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[0].id,
    },
    {
      idCalendarFk: calendars[0].id,
      dtstart: new Date('2025-08-15T16:00:00Z'),
      // Cada dos semanas, martes y jueves, 6 veces
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=6',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[0].id,
    },
    {
      idCalendarFk: calendars[0].id,
      dtstart: new Date('2025-09-30T12:00:00Z'),
      // Mensual, tercer miércoles del mes, 4 ocurrencias
      rrule: 'FREQ=MONTHLY;BYDAY=3WE;COUNT=4',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[0].id,
    },
    {
      idCalendarFk: calendars[0].id,
      dtstart: new Date('2025-10-05T09:00:00Z'),
      // Anual, cada 5 de octubre, 3 años
      rrule: 'FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=5;COUNT=3',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[0].id,
    },

    // Calendario 2: más casos
    {
      idCalendarFk: calendars[1].id,
      dtstart: new Date('2025-06-01T08:00:00Z'),
      // Semanal cada 3 semanas (sin especificar día se toma el día de dtstart)
      rrule: 'FREQ=WEEKLY;INTERVAL=3;COUNT=10',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[1].id,
    },
    {
      idCalendarFk: calendars[1].id,
      dtstart: new Date('2025-07-01T08:00:00Z'),
      // Mensual, primer lunes y primer viernes, 5 veces
      rrule: 'FREQ=MONTHLY;BYDAY=1MO,1FR;COUNT=5',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[1].id,
    },
    {
      idCalendarFk: calendars[1].id,
      dtstart: new Date('2025-08-01T09:00:00Z'),
      // Diario hasta fin de año
      rrule: 'FREQ=DAILY;UNTIL=20251231',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[1].id,
    },
    {
      idCalendarFk: calendars[1].id,
      dtstart: new Date('2025-09-01T10:00:00Z'),
      // Días sueltos: RDATE
      rrule: 'RDATE:20250901,20250915,20250929,20251010',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[1].id,
    },
    {
      idCalendarFk: calendars[1].id,
      dtstart: new Date('2025-12-25T09:00:00Z'),
      // Anual, Navidad, 2 ocurrencias
      rrule: 'FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25;COUNT=2',
      tzid: 'Europe/Madrid',
      idUserFk: usersData[1].id,
    },
  ];


  // const createdRules: any[] = [];
  // for (const rd of recurrenceRulesData) {
  //   const r = await prisma.recurrenceRule.create({ data: rd });
  //   createdRules.push(r);
  // }



  // ─── 7️⃣ Eventos + EventParticipant ───────────────────────────────────────────────
  const oneHour = 60 * 60 * 1000;

  // Mapa de clientWorkspace → client
  const clientEstToClient: Record<string, string> = {
    "clientEst-01-uuid": "client-01-uuid",
    "clientEst-02-uuid": "client-02-uuid",
    "clientEst-06-uuid": "client-06-uuid",
    "clientEst-07-uuid": "client-07-uuid",
  };

  // for (const rule of createdRules) {
  //   const start = rule.dtstart;
  //   const end = new Date(start.getTime() + oneHour);

  //   const cal = calendars.find(c => c.id === rule.idCalendarFk)!;
  //   const member = usersData.find(u => u.idWorkspaceFk === cal.idWorkspaceFk)!;

  //   // creamos el evento
  //   const ev = await prisma.event.create({
  //     data: {
  //       idCalendarFk: rule.idCalendarFk,
  //       idRecurrenceRuleFk: rule.id,
  //       startDate: start,
  //       endDate: end,
  //       idUserPlatformFk: member.id,
  //       title: "Evento seed",
  //       description: "",
  //     },
  //   });

  //   // enlazamos dos clientes de ejemplo
  //   const clientList = cal.idWorkspaceFk === workspace1Id
  //     ? ["clientEst-01-uuid", "clientEst-02-uuid"]
  //     : ["clientEst-06-uuid", "clientEst-07-uuid"];

  //   for (const ce of clientList) {
  //     await prisma.eventParticipant.create({
  //       data: {
  //         idEventFk: ev.id,
  //         idClientWorkspaceFk: ce,
  //         idClientFk: clientEstToClient[ce],  // ahora también el ID de cliente
  //       },
  //     });
  //   }
  // }



  console.log('✅ Seed completado');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
