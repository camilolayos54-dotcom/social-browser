# Social Browser

[Español](README.md) · English

A desktop browser for managing social networks with separate profiles, an AI assistant, and an optional MCP agent channel. Each profile keeps its own session. Social sites are displayed inside the Electron application.

## Requirements and installation

You need Node.js 22.12 or newer, npm, and a graphical environment. From this directory:

```bash
npm ci
npm start
```

Open a network from the sidebar, use the tabs and address bar, and create or switch profiles in the top bar. The “···” menu contains API keys and memory controls. Sessions and other user data are stored locally, outside the source code.

## Assistant and credentials

Select local Ollama, OpenAI, or a compatible server in the assistant panel. For Ollama, start the service and download a model. For OpenAI and X search, enter the key or token under “Claves API” or set `OPENAI_API_KEY` or `X_BEARER_TOKEN` in the environment. For a compatible server, supply the complete Chat Completions URL and an optional key. Do not put credentials in the URL; HTTP traffic is not encrypted.

Keys are encrypted using the operating system's secure storage when available; otherwise they remain in memory until the application closes. The compatible-server key is bound to its origin. Deleting a key in the app does not remove an environment variable. Content sent to the assistant, including page content you ask it to read, is transmitted to the selected provider.

The assistant can help draft, navigate, read visible content, and save opportunities. Tool-driven clicks require confirmation. Social networks and their login flows can change and must be tested with each account. Compatibility with every provider or site is not guaranteed.

## MCP agents

“Conectar agente” enables an optional local channel. You can restrict access to the selected profile or authorize all profiles, and disconnect it in the app. The agent can read visible private content and fill fields; clicks require confirmation. Enable it only for trusted clients. The local channel is available on Linux and macOS.

Configure your MCP client with absolute paths to Node and this repository:

```json
{
  "mcpServers": {
    "social-browser": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/social-browser/mcp-server.js"]
    }
  }
}
```

The client and application must run as the same user. If you use a custom data directory, set `SOCIAL_BROWSER_USER_DATA` in the MCP process to the same path used by Electron.

## Tests

```bash
npm test
npm run test:e2e
```

Integration tests require a graphical environment and permission to create local servers. `SOCIAL_BROWSER_TEST_NO_SANDBOX=1` is only for test environments where the Chromium sandbox cannot start; do not use it for everyday browsing.

## Privacy and security

Do not commit keys, cookies, profiles, user data, `.env` files, or agent descriptors. See [SECURITY.md](SECURITY.md). X searches require API access. “Liberar memoria” may discard unsaved changes in background tabs.

## License

[MIT](LICENSE), copyright © 2026 Julian García. You may use, modify, and redistribute the software, including commercially, provided the copyright and permission notices are retained in copies or substantial portions.

## Notes and reminders

Open “Notas y recordatorios” under Acciones or “Notas” in the top bar. Create notes with a title or body, edit them, and delete them; each profile keeps its own notes locally. You can set a local date and time for an in-app reminder and, where supported, a desktop notification. Reminders are checked while the app is open; reminders that become due while it is closed appear when it is reopened. No notifications are sent while the app is closed. The menu bar hides automatically and can be shown by pressing Alt (on supported systems).

## Markdown workspace

Open “Notas” for the note explorer, editor, and preview. Save each note with **Guardar**; pending changes are saved when switching notes or closing the workspace. Files are stored in `notes/<profile-id>/<note-id>.md` under Electron's user data directory (on Linux, usually `~/.config/social-browser/`). The editor footer shows the full path. Notes from the previous version migrate on startup and retain their reminders. Preview supports headings, lists, bold, italics, and code; the file retains the complete Markdown text. If the file changes externally while editing, the app rejects the write to avoid overwriting it: use “Descartar cambios” to reload.

The sidebars can be minimized with their header controls and expanded again from their icon rails. The left rail keeps networks and actions accessible; the right rail offers assistant shortcuts. Both sidebar states are remembered locally.

## Facebook and Messenger tools without AI

In “Detectar en Facebook”, enter one or more comma-separated phrases, comma-separated alternative locations, exclusions and an optional earliest date. “Buscar en Facebook” opens a search using the first phrase and first location; the remaining phrases and filters are checked locally while scrolling. At least one location must appear in visible text. A date filter excludes posts without an interpretable date. Save configurations per profile for reuse. Select the tab and start the scan; it can be stopped at any time. The app highlights matches where possible and stores up to 100 results per profile. Results without a direct link are shown but cannot be opened automatically. Facebook controls the content shown and its page structure may change; filters cannot guarantee finding every post.

Under “Respuestas guardadas”, create messages per profile and network, including Messenger, and select optional local images. From a linked result or opportunity choose “Revisar respuesta”, open the post, open the comment box and return using “Continuar respuesta”. Select a message and review its text and images. A first approval prepares the form and attaches images (the page may receive them at this point); a second approval attempts to click the send button. The application stops if it cannot identify exactly one form and button, or if the page, text or files change. Verify the outcome on Facebook: a click does not guarantee that the network published the comment. Upload and submission depend on Facebook's interface and may not work; they have not been validated against every account or form.

Under “Oportunidades”, set pending, contacted, responded, or discarded status, add notes and schedule a reminder. Reminders are checked while the application is open; those due while closed appear when it is reopened. Text, results, notes, selected image paths and local images may be private; image files must remain available at their paths. None of these features requires an AI provider.

The right-hand “Acciones” button groups tools that work without AI and can directly run a saved search; “Preguntar al asistente” is optional. External agent access is also controlled from that sidebar. The header shares space with the native window controls; press Alt to show the application menu.
