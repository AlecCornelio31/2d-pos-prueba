# 2D POS · Prueba compartida gratuita

Paquete preparado el 13 de octubre de 2026. Es una prueba online para una sucursal y una caja, con interfaz adaptable a teléfono y tablet. Reutiliza el logo y los 66 productos del catálogo proporcionado. No incluye datos de empleados, contraseñas de acceso predefinidas ni pedidos reales.

## Qué incluye

- Cuenta inicial de administrador protegida con una clave de instalación.
- Inicio de sesión con usuario y contraseña propios, sin cuenta de ChatGPT.
- Nombre completo obligatorio; roles administrador, cajero y mesero.
- Solo el administrador puede crear, editar, restablecer contraseñas y deshabilitar usuarios. No permite dejar el sistema sin administradores activos.
- Las sesiones de un usuario se invalidan al deshabilitarlo, editarlo o cambiar su contraseña. Cada petición vuelve a comprobar su estado. En un teléfono conectado, la pantalla se actualiza al consultar el servidor (cada 8 segundos cuando está visible y sin un formulario abierto); cualquier operación posterior ya es rechazada. No se garantiza borrar una pantalla que quedó abierta sin conexión.
- Pedidos en mesa, para llevar y a domicilio con cargo fijo de $10. Varias cuentas por mesa. Mesas ampliables desde Administración.
- Para llevar: nombre y teléfono opcionales. Domicilio: nombre, teléfono y dirección obligatorios.
- Productos, extras, indicaciones y promociones manuales de varias unidades del mismo producto. Las bebidas no admiten extras.
- Precios y nombres capturados en cada renglón, conservados aunque cambie el catálogo.
- Edición de cuentas sin cobros. Las reducciones, retiros de extras y retiro de envío requieren credenciales de un administrador y motivo. Toda cancelación requiere la misma autorización.
- Cobros parciales y combinados: efectivo, tarjeta física y transferencia. Selección de renglones para repartir pagos. Cambio calculado sobre el efectivo recibido.
- Registro manual de devoluciones al cancelar: primero se devuelve efectivamente el dinero fuera de la aplicación, después se confirma el registro. No se conecta a Mercado Pago ni al banco.
- Apertura y cierre de caja; préstamos de bolsa negra, devoluciones, entradas y gastos; cuentas pendientes conservadas.
- Historial de operaciones y exportación administrativa en JSON sin contraseñas ni sesiones.
- Control de versiones: no sobrescribe una cuenta si otro dispositivo la modificó. Operaciones con identificador para evitar duplicar un reintento recibido durante las últimas 24 horas.

## Paso 1. Subir el código a GitHub

1. Descarga y extrae `2D_POS_prueba_Render.zip` en tu computadora.
2. En GitHub crea un repositorio llamado `2d-pos-prueba`, con visibilidad **Private**. Puedes activar **Add a README file** para que aparezca el menú de carga de archivos.
3. En el repositorio abre **Add file → Upload files**.
4. Entra en la carpeta extraída `2d-pos-render`. Arrastra **su contenido** al área de carga: los archivos de la raíz y la carpeta `public` completa. No subas el ZIP ni la carpeta contenedora como otro nivel.
5. Guarda con **Commit changes**. El README del paquete puede reemplazar el inicial.
6. Comprueba que `package.json`, `package-lock.json`, `render.yaml`, `server.cjs`, `store.cjs`, `domain.cjs` y `catalog.json` están directamente en la raíz del repositorio. Debe aparecer también `public` con sus archivos y `assets/logo-2d.jpeg`.

No compartas contraseñas de GitHub/Render ni la clave de instalación por chat. Estas cuentas no son las cuentas de tus empleados.

## Paso 2. Crear la prueba en Render

1. En Render, abre **New → Blueprint**.
2. Conecta GitHub y autoriza a Render a acceder al repositorio privado `2d-pos-prueba`. Basta con autorizar este repositorio.
3. Selecciona el repositorio y la rama `main`.
4. Mantén la ruta de Blueprint `render.yaml`. Dale un nombre, por ejemplo `2d-pos-prueba`.
5. Revisa los recursos: un Web Service y una base PostgreSQL. Ambos están declarados con `plan: free`. Si Render muestra un costo o solicita elegir un plan de pago, detente y revisa la pantalla antes de continuar.
6. Pulsa **Deploy Blueprint**. El archivo conecta la base al servidor y genera una clave de instalación automáticamente.
7. Espera a que el servicio web muestre **Live**. Abre su enlace HTTPS terminado en `.onrender.com`.

La cuenta Render puede imponer verificaciones o límites adicionales. El paquete no contrata ni crea servicios por sí solo.

### Configuración preparada

- Node.js 24.19.0.
- Construcción: `npm ci`.
- Arranque: `npm start`.
- Comprobación de salud: `/health`.
- `DATABASE_URL`: conexión interna a PostgreSQL asignada por el Blueprint.
- `SETUP_TOKEN`: valor aleatorio generado por Render.
- `NODE_ENV=production`.
- `RENDER_EXTERNAL_URL`: la proporciona Render. En otro alojamiento, definir `PUBLIC_URL` con el origen HTTPS exacto.
- La base restringe conexiones externas mediante `ipAllowList: []`; el servicio utiliza la red interna en la misma región.

## Paso 3. Crear tu administrador

1. Abre el Web Service en Render y ve a **Environment**.
2. Revela y copia el valor de `SETUP_TOKEN` solo para pegarlo en la pantalla inicial de tu aplicación.
3. Completa nombre completo, usuario y una contraseña de al menos 10 caracteres.
4. Crea el administrador. La configuración inicial se desactiva después de crear esta cuenta; cambiar `SETUP_TOKEN` no permite crear otro administrador ni recuperar una contraseña.
5. En **Administrar → Añadir usuario**, crea las cuentas de cajero y mesero. Un administrador puede restablecer las contraseñas de los demás usuarios. No hay recuperación por correo en esta prueba. Guarda tu contraseña de administrador en tu gestor de contraseñas.

## Paso 4. Probar con iPhone y iPad

1. Abre el mismo enlace de Render en ambos dispositivos.
2. En la tablet entra como cajero y abre caja con un fondo de prueba.
3. En el teléfono entra como mesero y crea un pedido.
4. En la tablet abre Cuentas y pulsa Actualizar, o espera la actualización periódica.
5. Cobra una parte en efectivo y el resto como tarjeta, usando únicamente datos ficticios.
6. Marca la entrega y cierra la cuenta.
7. Desde la cuenta administrativa, deshabilita al mesero; comprueba que ya no pueda operar ni iniciar sesión. Sus pedidos deben seguir en el historial.
8. Para el acceso desde pantalla de inicio en iPhone/iPad: Safari → Compartir → Añadir a pantalla de inicio. En Android, usa la opción de instalación o de añadir acceso desde Chrome. El menú exacto depende de la versión del sistema.

El manifiesto permite presentarla como aplicación web. No incluye service worker ni funcionamiento offline completo. La disponibilidad de la opción Instalar depende del navegador; añadir un acceso directo no habilita operaciones sin conexión.

## Límites de esta primera prueba

- **No utilizar para la operación real del negocio todavía.** Falta la validación en dispositivos físicos, despliegue PostgreSQL y revisión antes de producción.
- Necesita internet para iniciar sesión, consultar, confirmar, editar, cobrar o administrar usuarios. El borrador se conserva localmente por usuario; no se sincroniza entre teléfonos ni es una cola de operaciones offline.
- No hay impresión, cocina, inventario, impuestos, facturación, enlaces de pago, importación histórica ni importación de respaldos desde la interfaz.
- Los registros del prototipo de Sites no se migran automáticamente. El paquete empieza sin ventas y con el catálogo original de 66 productos.
- La interfaz del servidor es una primera adaptación del diseño, no una réplica exacta de todas las pantallas del prototipo. Las mesas se seleccionan al tomar el pedido; no hay plano de mesas. La entrega se marca por cuenta completa.
- Solo se editan cuentas sin cobros. Las cuentas cobradas requieren cancelación con devolución y autorización, y creación de otra cuenta.
- División por renglones o importes, no selección individual de unidades dentro de un renglón.
- Promociones del mismo producto; no promociones combinadas ni calendario de vigencia.
- Un cierre corresponde a una sesión de caja con fecha de México. Reabrir después de un cierre crea otra sesión; no existe cierre fiscal ni bloqueo diario irreversible.
- No hay copias de seguridad automáticas. La exportación JSON es manual e incluye datos de la operación. Guardarla no equivale a una restauración probada.
- Render suspende el servidor gratuito tras 15 minutos sin tráfico; despertar puede tardar alrededor de un minuto. PostgreSQL gratuito caduca a los 30 días de crearlo. Exporta las pruebas antes de la caducidad.

## Validación realizada

18 pruebas automatizadas aprobadas (17 subpruebas HTTP y su suite): autenticación, permisos, sesiones, desactivación, restablecimiento de contraseña, límites de intentos, catálogo, importes calculados en servidor, extras, promociones, reintentos, versiones concurrentes, pagos, cancelaciones, caja e historial.

Se ejecutaron contra el servidor HTTP real con almacenamiento SQLite temporal y clientes separados. Sintaxis JavaScript comprobada. La conexión PostgreSQL en Render, la presentación visual y la instalación en iOS/Android **requieren validación después del despliegue**. No se ha publicado este paquete en tu cuenta.

## Desarrollo local (opcional)

Requiere Node 24.19.0. Instala dependencias con `npm ci` y ejecuta `npm test`.

Antes de `npm start`, configura `SETUP_TOKEN` con una cadena aleatoria de al menos 24 caracteres en el entorno. No la escribas en el repositorio. En desarrollo se usa `trial.sqlite`; en producción es obligatoria `DATABASE_URL` para impedir guardar ventas en el disco efímero de Render.

En PowerShell puedes generar una clave temporal local así:

```powershell
$env:SETUP_TOKEN = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
npm start
```

Abre `http://localhost:3000`. Consulta el valor de esa variable solo en tu propia terminal para completar la instalación.

## Organización técnica

- `server.cjs`: HTTP, sesiones, origen de peticiones, rutas y archivos públicos.
- `domain.cjs`: permisos, usuarios, catálogo, cuentas, pagos y caja.
- `store.cjs`: persistencia y transacciones.
- `catalog.json`: catálogo inicial, importado del archivo proporcionado.
- `public/`: interfaz, estilos, manifiesto y logo.
- `test.cjs`: pruebas HTTP reproducibles, con datos ficticios.
- `render.yaml`: recursos gratuitos de prueba.

Para mantener la prueba pequeña, PostgreSQL almacena un documento JSONB en una fila bloqueada durante las operaciones. Es una arquitectura de ensayo para una sucursal con pocos dispositivos; una versión de producción debería migrar a tablas normalizadas, paginación, auditoría y respaldos operativos con restauración probada. Las contraseñas usan scrypt con sal aleatoria; las cookies de sesión son HttpOnly, SameSite Strict y Secure en producción. Los roles se comprueban en servidor, no solo ocultando botones.

## Referencias de instalación

- Render Blueprint: https://render.com/docs/infrastructure-as-code
- Render YAML: https://render.com/docs/blueprint-spec
- Límites gratuitos: https://render.com/docs/free
- Carga de archivos GitHub: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
