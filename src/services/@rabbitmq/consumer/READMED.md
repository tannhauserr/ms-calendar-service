### Uso de Consumers en los Microservicios de Booking

En nuestra arquitectura de microservicios, algunos servicios implementan uno o más **consumers** para gestionar la obtención de datos a través de RabbitMQ, mientras que otros servicios no requieren de este mecanismo. Es importante señalar que, aunque varios microservicios puedan compartir un mismo **consumer**, esto no implica que su funcionamiento sea idéntico o que respondan a las mismas necesidades.

Cada microservicio utiliza sus **consumers** de manera específica, conforme a sus propios intereses y necesidades de procesamiento. Por lo tanto, un **consumer** que está presente en múltiples microservicios puede comportarse de manera distinta según el contexto en el que se utilice. Este diseño garantiza flexibilidad y permite que cada servicio maneje la información de manera óptima, de acuerdo con sus propios requerimientos.

En resumen:
- **Algunos microservicios tienen consumers**, mientras que otros no.
- **Varios microservicios pueden compartir un mismo consumer**, pero esto no significa que se utilice o funcione de la misma forma en cada uno de ellos.
- Cada **consumer** está diseñado y adaptado para satisfacer las necesidades específicas de cada microservicio.

Es fundamental tener en cuenta estas diferencias al interactuar con los distintos microservicios que hacen uso de RabbitMQ.

---

### Consumers en el microservicio de **Booking**

#### `calendarConsumer`
Este consumer se utiliza para recibir solicitudes relacionadas con la disponibilidad de citas en el calendario. Recibe un mensaje con una acción específica y luego devuelve la respuesta con las citas disponibles, publicando los resultados en la cola de respuesta. Aunque devolver datos directamente puede no ser ideal en algunos casos, en este escenario es necesario porque otro microservicio (chatbot) está esperando estos datos para continuar su flujo.

Algunas recomendaciones para mejorar el diseño:
- Implementar un **timeout controlado** para que el chatbot no quede esperando indefinidamente.
- Asegurarse de que el procesamiento sea lo más eficiente posible, y considerar el **uso de caching** para resultados frecuentes.
- El uso de **correlationId** ya implementado es una buena práctica, ya que permite vincular la solicitud con su respuesta.
- Escalar el número de consumidores si se espera una alta carga de solicitudes.

---

### Consumers en el microservicio de **Booking**

#### `handleUserConsumer`
Este consumer gestiona las operaciones relacionadas con los usuarios, como agregar, actualizar o eliminar registros de la tabla `user` en el microservicio. También se encarga de eliminar o actualizar los datos relacionados del usuario en otras tablas conectadas, como `userCalendar`, `userColor`, `workerBusinessHour`, `userService`, entre otras.

Además, el mensaje que se recibe en la cola también puede contener un objeto `company` que incluye información sobre la compañía con la cual está relacionado el usuario. Este objeto puede ser útil para ejecutar acciones adicionales dependiendo del rol del usuario en la compañía.

- **Estructura del mensaje recibido**:
    ```json
    {
      "user": {
        "id": "user-id",
        "email": "user-email",
        "name": "user-name",
        "lastName": "user-lastname",
        "image": "user-image",
        "action": "add/update/delete"
      },
      "company": {
        "id": "company-id",
        "name": "company-name",
        "role": "user-role-in-company",
        "action": "add/update/delete"
      }
    }
    ```

- **Comportamiento según la acción**:
    1. **Agregar (`add`)**:
       - Si la acción es `add`, se crea un nuevo registro en la tabla `user` y se asocia con la compañía indicada en el objeto `company` mediante la tabla `RoleCompanyUser`. Dependiendo del rol del usuario (`role`), se aplican configuraciones específicas (por ejemplo, permisos o accesos).

    2. **Actualizar (`update`)**:
       - Si la acción es `update`, se actualizan los campos del usuario según los datos proporcionados en el mensaje. Si se incluye información de la compañía en el objeto `company`, también se actualiza la relación del usuario con la compañía en la tabla `RoleCompanyUser`.

    3. **Eliminar (`delete`)** (Borrado lógico):
       - Si la acción es `delete`, no se eliminan físicamente los registros del usuario, sino que se actualiza el campo `deletedDate` con la fecha actual, indicando que el usuario ha sido "borrado" de manera lógica. Esto se aplica tanto a la tabla `user` como a las tablas relacionadas (`userCalendar`, `userColor`, `workerBusinessHour`, `userService`, etc.).
       - En caso de que se "eliminen" también compañías, el proceso de borrado lógico se extiende a todas las tablas que dependen de la compañía (`roleCompanyUser`, `calendar`, `businessHour`, `service`, etc.), marcando los registros relacionados con una fecha en el campo `deletedDate`.

---

#### `handleCompanyDeleteConsumer`
Este consumer se encarga de realizar el borrado lógico (soft delete) de todos los registros relacionados con una empresa (`idCompany`). El proceso abarca desde los calendarios y horarios comerciales hasta las relaciones entre usuarios y la compañía. Si un usuario solo tiene una empresa y es la que se va a eliminar, el usuario también será marcado como eliminado.

- **Comportamiento según el mensaje recibido**:
    1. **Borrado lógico en las tablas relacionadas**:
       - El consumer recibe el `idCompany` y marca como eliminados todos los registros de las tablas que contienen información relacionada con esa empresa, como `calendar`, `userCalendar`, `userColor`, `workerBusinessHour`, `temporaryBusinessHour`, y `userService`.
       - En lugar de eliminar físicamente los registros, se actualiza el campo `deletedDate` con la fecha actual.

    2. **Actualización del campo `companyRoleJson` en la tabla `User`**:
       - Si un usuario tiene la empresa en su `companyRoleJson`, se agrega el campo `deletedDate` dentro del objeto correspondiente a esa empresa.
       - Si el usuario solo tiene una empresa en su JSON y es la que se está eliminando, se realiza un soft delete del registro completo del usuario.
  
- **Casos especiales**:
    - **Borrado de múltiples relaciones**: Si un usuario tiene más de una empresa asociada en su `companyRoleJson`, solo se marca como eliminada la relación con la empresa especificada en el mensaje.

---

Este diseño permite una flexibilidad máxima en la interacción de los microservicios de **booking**, asegurando que cada uno maneje de manera óptima los datos que recibe y que la eliminación de registros se haga de manera segura y consistente.
