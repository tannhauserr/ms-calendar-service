// “none” - No proporciona acceso.
// “freeBusyReader” - Proporciona acceso de lectura a la información de disponible / ocupado.
// “reader” - Proporciona acceso de lectura al calendario.Los eventos privados se mostrarán a los usuarios con acceso de lectura, pero se ocultarán los detalles del evento.
// “writer” - Otorga acceso de lectura y escritura al calendario.Los eventos privados se mostrarán a los usuarios con acceso de escritor y los detalles del evento serán visibles.
// “owner” - Proporciona la propiedad del calendario.Este rol tiene todos los permisos del rol de escritor con la capacidad adicional de ver y manipular las LCA.

// fuente: https://developers.google.com/calendar/api/v3/reference/acl?hl=es-419

export type CalendarGoogleRoleType = 'owner' | 'writer' | 'reader' | 'freeBusyReader' | 'none';