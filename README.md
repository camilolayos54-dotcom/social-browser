# Social Browser

[English](README.en.md) · Español

Navegador de escritorio para gestionar redes sociales con perfiles independientes, un asistente de IA y un canal opcional para agentes MCP. Cada perfil conserva su propia sesión. El contenido de las redes se muestra dentro de la aplicación Electron.

## Requisitos e instalación

Necesitas Node.js 22.12 o posterior, npm y un entorno gráfico. Desde este directorio:

```bash
npm ci
npm start
```

Abre una red desde la barra lateral, utiliza las pestañas y la barra de direcciones, y crea o cambia de perfil en la barra superior. El menú «···» contiene las claves y los controles de memoria. Las sesiones y otros datos de usuario se guardan localmente, fuera del código fuente.

## Asistente y credenciales

Selecciona Ollama local, OpenAI o un servidor compatible en el panel. Para Ollama, inicia el servicio y descarga un modelo. Para OpenAI y la búsqueda de X, introduce la clave o token en «Claves API» o configura `OPENAI_API_KEY` o `X_BEARER_TOKEN` en el entorno. Para un servidor compatible, indica la URL completa de Chat Completions y, si procede, una clave. No incluyas credenciales en la URL; HTTP no cifra el tráfico.

Las claves se guardan cifradas mediante el almacén seguro del sistema cuando está disponible; si no, se mantienen en memoria hasta cerrar la aplicación. La clave del servidor compatible está vinculada a su origen. Borrar una clave en la aplicación no borra una variable de entorno. El contenido enviado al asistente, incluido el contenido de páginas que se le solicite leer, se transmite al proveedor seleccionado.

El asistente puede ayudar a redactar, navegar, leer contenido visible y guardar oportunidades. Los clics realizados mediante herramientas requieren confirmación. Las redes y sus inicios de sesión pueden cambiar y deben probarse con cada cuenta. No se garantiza compatibilidad con todos los proveedores o sitios.

## Agentes MCP

«Conectar agente» habilita un canal local opcional. Puedes limitarlo al perfil seleccionado o autorizar todos los perfiles, y desconectarlo desde la aplicación. El agente puede leer contenido privado visible y rellenar campos; los clics requieren confirmación. Activa este acceso solo para clientes de confianza. El canal local está disponible en Linux y macOS.

Configura el cliente MCP con las rutas absolutas a Node y a este repositorio:

```json
{
  "mcpServers": {
    "social-browser": {
      "command": "/ruta/absoluta/a/node",
      "args": ["/ruta/absoluta/social-browser/mcp-server.js"]
    }
  }
}
```

El cliente y la aplicación deben ejecutarse con el mismo usuario. Si usas una carpeta de datos personalizada, configura `SOCIAL_BROWSER_USER_DATA` en el proceso MCP con la misma ruta de Electron.

## Pruebas

```bash
npm test
npm run test:e2e
```

Las pruebas de integración requieren un entorno gráfico y la capacidad de crear servidores locales. `SOCIAL_BROWSER_TEST_NO_SANDBOX=1` es exclusivamente para entornos de prueba donde el sandbox de Chromium no arranque; no lo uses para navegación cotidiana.

## Privacidad y seguridad

No subas claves, cookies, perfiles, datos de usuario, archivos `.env` ni descriptores del agente. Consulta [SECURITY.md](SECURITY.md). Las búsquedas de X requieren acceso a su API. «Liberar memoria» puede descartar cambios sin guardar en pestañas en segundo plano.

## Licencia

[MIT](LICENSE), copyright © 2026 Julian García. Permite usar, modificar y redistribuir el software, incluso comercialmente, siempre que se conserve el aviso de copyright y la licencia en las copias o partes sustanciales.

## Notas y recordatorios

Abre «Notas y recordatorios» en Acciones o «Notas» en la barra superior. Crea notas con título o texto, edítalas y elimínalas; cada perfil conserva sus propias notas localmente. Puedes indicar una fecha y hora local para recibir un aviso en la aplicación y, cuando el sistema lo permita, una notificación de escritorio. Los recordatorios se comprueban mientras la aplicación está abierta; los que vencen mientras está cerrada se muestran al iniciarla de nuevo. No se envían notificaciones cuando la aplicación está cerrada. La barra de menú se oculta automáticamente y se muestra al pulsar Alt (en sistemas compatibles).

## Ventana Markdown

Abre «Notas» para ver el explorador y el editor con vista previa. Guarda cada nota con **Guardar**; al cambiar de nota o cerrar la ventana se guardan los cambios pendientes. Los archivos se guardan en `notes/<id-del-perfil>/<id-de-la-nota>.md` dentro de la carpeta de datos de Electron (en Linux, normalmente `~/.config/social-browser/`). La ruta completa aparece en el pie del editor. Las notas creadas con la versión anterior se migran al abrir la aplicación y conservan sus recordatorios. La vista previa admite títulos, listas, negrita, cursiva y código; el archivo conserva el texto Markdown completo. Si el archivo cambia fuera de la aplicación mientras lo editas, se rechaza la escritura para evitar sobrescribirlo: usa «Descartar cambios» para volver a cargarlo.

Las barras laterales se pueden minimizar con los controles de sus cabeceras y ampliar de nuevo desde sus iconos. La barra izquierda mantiene accesibles las redes; la derecha es el panel principal con todas las acciones visibles directamente, búsquedas guardadas, conexión del agente y acceso al asistente. El estado de ambas barras se recuerda en el equipo.

## Herramientas de Facebook y Messenger sin IA

En «Detectar en Facebook» escribe una o varias frases separadas por comas, ubicaciones alternativas separadas por comas, exclusiones y una fecha inicial opcional. «Buscar en Facebook» abre una búsqueda usando la primera frase y la primera ubicación; las demás frases y filtros se comprueban localmente durante el recorrido. Al menos una ubicación debe aparecer en el texto visible. Con un filtro de fecha se omiten las publicaciones sin fecha interpretable. Guarda una configuración por perfil para reutilizarla. Selecciona la pestaña y comienza el recorrido, que se puede detener. La aplicación resalta coincidencias cuando es posible y conserva hasta 100 resultados por perfil. Los resultados sin enlace directo se muestran, pero no se pueden abrir automáticamente. Facebook controla qué contenido aparece y su estructura puede cambiar; los filtros no garantizan encontrar todas las publicaciones.

En «Respuestas guardadas» crea mensajes por perfil y red, incluido Messenger, y selecciona imágenes locales opcionales. Desde un resultado con enlace o una oportunidad, selecciona «Revisar respuesta», abre la publicación, abre el cuadro de comentario y vuelve con «Continuar respuesta». Selecciona un mensaje y revisa texto e imágenes. Una primera aprobación permite preparar el formulario y adjuntar imágenes (la página podría recibirlas en ese momento); una segunda aprobación intenta pulsar el botón de envío. La aplicación se detiene si no identifica exactamente un formulario y un botón, o si cambian la página, el texto o los archivos. Verifica el resultado en Facebook: una pulsación no garantiza que la red haya publicado el comentario. La carga y el envío dependen de la interfaz de Facebook y pueden no funcionar; no se han validado con todas las cuentas y formularios.

En «Oportunidades» asigna pendiente, contactada, respondida o descartada, añade notas y programa un recordatorio. Los avisos se comprueban mientras la aplicación está abierta; los vencidos durante el cierre aparecen al volver a abrirla. Los textos, resultados, notas, imágenes seleccionadas y rutas se guardan localmente y pueden ser privados; los archivos de imagen deben permanecer disponibles en su ubicación. Ninguna de estas funciones requiere un proveedor de IA.

El panel de «Acciones» en la barra derecha reúne las herramientas que funcionan sin IA directamente visibles sin menús anidados y permite ejecutar una búsqueda guardada sin menús adicionales; el asistente de IA es opcional y desplegable. La conexión del agente externo también se controla desde esa barra. La cabecera comparte espacio con los controles nativos de la ventana; pulsa Alt para mostrar el menú de la aplicación.
