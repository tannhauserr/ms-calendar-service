# Inicialización de la Base de Datos con Docker Compose

Este documento proporciona instrucciones para configurar e inicializar la base de datos PostgreSQL utilizando Docker Compose para los miembros del equipo de desarrollo.

## Pre-requisitos

- Tener Docker y Docker Compose instalados.
- Configurar las variables de entorno necesarias en archivos `.env`.

## Instrucciones de Configuración

### 1. Configuración de los Archivos `.env`

Asegúrate de que el archivo `.env` correspondiente contiene las variables `DB_USER`, `DB_PASSWORD`, y `DB_NAME` con valores que coincidan con los definidos en `docker-compose.yml`.

### 2. Iniciar la Base de Datos con Docker Compose

Ejecuta el siguiente comando en la raíz del proyecto para iniciar el contenedor de PostgreSQL:

```
docker-compose up -d
```

El flag -d significa que Docker Compose ejecutará los contenedores en modo "detached", permitiéndote continuar utilizando la terminal.

### 3. Verificar que los Contenedores Están Corriendo
```
docker ps
```
Deberías ver un contenedor en ejecución para PostgreSQL.

### 4. Crear y Migrar la Base de Datos
Si estás utilizando Prisma, asegúrate de que tu archivo schema.prisma está correctamente configurado y luego ejecuta las migraciones con:

```
npx prisma migrate deploy
```

Esto creará el esquema en tu base de datos según lo definido en tu modelo Prisma.

### 5. Conexión desde la Aplicación
Asegúrate de que tu aplicación Node.js esté configurada para conectarse a la base de datos utilizando la cadena de conexión adecuada, la cual debe coincidir con las variables de entorno establecidas en el servicio de la base de datos en docker-compose.yml.

### 6. Prisma Studio
```
npx prisma studio
```

### 7. Desarrollo continuo
Ahora que tu base de datos está corriendo y está configurada correctamente, puedes continuar con el desarrollo de tu aplicación como lo harías normalmente.

Recuerda que cada vez que realices cambios en tu esquema de base de datos con Prisma, deberás generar una nueva migración y aplicarla para que los cambios se reflejen en la base de datos:

```
npx prisma migrate dev
```
