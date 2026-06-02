Descripción del proyecto y estructura de archivos

Este documento explica la estructura del proyecto "horario y nomina" y describe el propósito y comportamiento de cada archivo creado hasta ahora. Está pensado para ayudarte a entender dónde están las piezas clave, cómo probar la aplicación y qué claves de `localStorage` utiliza.

Estructura (raíz):
- [index.html](index.html) — Página principal del panel de turnos (TurnosPRO).
- [styles.css](styles.css) — Estilos globales para la interfaz principal (`index.html`).
- [script.js](script.js) — Lógica principal que genera el cronograma, conteo de semana y render de la tabla.
- /login/
  - [login/index.html](login/index.html) — Página de inicio de sesión con formulario sencillo.
  - [login/styles.css](login/styles.css) — Estilos específicos para la pantalla de login.
  - [login/script.js](login/script.js) — Lógica del login; credenciales válidas: usuario `1001977786`, contraseña `1001977786`. Redirige a `../inicio/index.html` al iniciar sesión.
- /inicio/
  - [inicio/index.html](inicio/index.html) — Página de "Inicio" (dashboard) que muestra horas acumuladas, botones para subir el día, exportar y reiniciar mes. Diseño en pantalla completa con columna lateral y modales.
  - [inicio/script.js](inicio/script.js) — Lógica del dashboard de horas:
    - Calcula las horas programadas de la semana hasta el día actual (basado en el horario semanal cargado).
    - Maneja "Horas extras" (modal), las guarda acumuladas y por fecha.
    - Permite "Subir horas del día" (guarda un registro en `daily_uploads`).
    - Permite reiniciar el mes y reemplazar el horario semanal desde un JSON en el modal.

Principales conceptos y claves en `localStorage`:
- `month_schedule` — (JSON) Horario semanal activo por trabajador (clave: objeto con arrays de 7 números Mon..Sun). Si no existe, se usa un `DEFAULT_WEEK_SCHEDULE` incrustado.
- `extras_hours_<id>` — (num) Horas extras acumuladas por trabajador (`<id>` = `elias`, `jose`, `darwin`, `caro`).
- `extras_by_date_YYYY-MM-DD` — (JSON) Registro por fecha de las horas extras añadidas ese día (obj: { workerId: horas }).
- `daily_uploads` — (JSON array) Lista de entradas guardadas al pulsar "Subir horas del día"; cada entrada incluye `date` y `workers` con `scheduled`, `extras`, `total`.
- `last_upload_date` — (string) Fecha de la última subida.
- `manual_rest_<weekNumber>` / `manual_flags_<weekNumber>` — (usadas por `script.js` del cronograma, si estaban presentes) para sobrescribir descansos por semana (si se usaron previamente).

Cómo probar localmente (pasos rápidos):
1. Abrir `index.html` en el navegador para ver el cronograma principal y comprobar estilos y generación de turnos.
2. Pulsar el botón "Admin" (arriba) para ir a `login/index.html` y entrar con las credenciales `1001977786` / `1001977786`.
3. En `inicio/index.html`:
   - Verás la tabla con `Horas programadas`, `Horas extra` y `Total` por colaborador.
   - Pulsar "Horas extras" por cualquier colaborador, indicar cantidad y confirmar: se suman a los extras acumulados y quedan registrados por fecha.
   - Pulsar "Subir horas del día" guarda una entrada en `daily_uploads` con los valores de hoy (programado + extras del día).
   - Pulsar "Exportar Excel" descarga un archivo `.csv` con las filas por fecha/colaborador y un resumen mensual.
   - Pulsar "Reiniciar mes / Nuevo horario" abre un modal donde puedes pegar un JSON con el nuevo horario semanal y opcionalmente borrar las subidas del mes.

Formato del JSON de horario (ejemplo válido):
{
  "elias":  [9,9,9,9,9,9,0],
  "jose":   [9,0,9,9,9,9,9],
  "darwin": [11,11,8,0,8,8,9],
  "caro":   [0,9,9,9,9,9,8]
}
Cada arreglo debe tener 7 números (lunes..domingo). 0 significa día de descanso.

Notas de implementación y límites actuales:
- La app es cliente pero ahora sincroniza con Firebase Realtime Database gracias a `firebase-init.js`.
- El respaldo local sigue funcionando con `backup.js` y `backup_actual` / `backup_anterior`.
- El archivo exportado es CSV (compatible con Excel). Puedo añadir exportación `.xlsx` usando una librería como SheetJS si lo deseas.
- Las subidas diarias impiden duplicados por fecha (no se sube 2 veces la misma fecha).
- El cronograma original se generaba automáticamente en `script.js` del root; la página `inicio` usa `month_schedule` en `localStorage` para calcular las horas programadas de la semana.
- La sincronización con Firebase cubre las claves principales: `month_schedule`, `daily_uploads`, `last_upload_date`, `monthly_history`, `extras_hours_*`, `extras_by_date_*`, `manual_rest_*`, `manual_flags_*`.

Sugerencias siguientes:
- Exportar `.xlsx` nativo (agregar SheetJS). Requiere incluir la librería en `/lib` o usar CDN.
- Añadir autenticación real con Firebase Auth en lugar del login fijo.
- Agregar validaciones de datos más estrictas para el JSON de horario y las horas extras.
- Implementar un pequeño servidor local para pruebas de archivos y Firebase, por ejemplo con `npx http-server`.

Archivo creado:
- [DOCUMENTACION.md](DOCUMENTACION.md)

Si quieres, actualizo el documento con capturas de pantalla, ejemplos de `localStorage` concretos o pasos para desplegar la app en producción con Firebase Hosting.