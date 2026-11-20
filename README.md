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
