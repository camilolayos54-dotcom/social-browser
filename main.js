const { app, BrowserWindow, ipcMain, session, safeStorage, Notification, clipboard, dialog, webContents, nativeImage } = require('electron');
const path = require('path');

if (process.platform === 'linux') app.setDesktopName('social-browser.desktop');

let mainWindow;
let credentials;
// Toggle the native menu for a standalone Alt press, including inside webviews.
function installAltMenu(contents) {
  if (process.platform === 'darwin') return;
  contents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Alt' && !input.isAutoRepeat && !input.control && !input.shift && !input.meta) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setMenuBarVisibility(!mainWindow.isMenuBarVisible());
    }
  });
}
const replyGuests = new WeakSet();
const configuredSessions = new WeakSet();
const sessionPartitions = new WeakMap();
app.whenReady().then(() => {
  credentials = new (require('./credentials').CredentialStore)(app.getPath('userData'), safeStorage);
  mainWindow = new BrowserWindow({ width: 1440, height: 900, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true } });
  installAltMenu(mainWindow.webContents);
  mainWindow.webContents.on('will-attach-webview', (event, prefs, params) => {
    prefs.preload = path.join(__dirname, 'guest-preload.js');
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.webviewTag = false;
    if (!/^persist:social-[a-z0-9-]+$/.test(params.partition || '') || !/^https?:\/\//i.test(params.src || '')) { event.preventDefault(); return; }
    const browsingSession = session.fromPartition(params.partition);
    sessionPartitions.set(browsingSession, params.partition);
    if (!configuredSessions.has(browsingSession)) {
      browsingSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'));
      browsingSession.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
      configuredSessions.add(browsingSession);
    }
  });
  function configureBrowserContent(contents) {
    installAltMenu(contents);
    contents.setWindowOpenHandler(details => {
      const { url, disposition, frameName, postBody } = details;
      const webUrl = /^https?:\/\//i.test(url);
      if (!webUrl && url !== 'about:blank') return { action: 'deny' };
      const isPopup = url === 'about:blank' || disposition === 'new-window' || Boolean(frameName) || Boolean(postBody);
      if (isPopup) {
        return { action: 'allow', overrideBrowserWindowOptions: {
          width: 700, height: 750, minWidth: 360, minHeight: 300, frame: true, show: true,
          webPreferences: { session: contents.session, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false }
        } };
      }
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('open-tab', { url, partition: sessionPartitions.get(contents.session), sourceId: contents.id, disposition });
      return { action: 'deny' };
    });
    contents.on('did-create-window', child => configureBrowserContent(child.webContents));
    const restrictNavigation = (event, url) => { if (!/^https?:\/\//i.test(url) && url !== 'about:blank') event.preventDefault(); };
    contents.on('will-navigate', restrictNavigation);
    contents.on('will-redirect', restrictNavigation);
  }
  mainWindow.webContents.on('did-attach-webview', (_, guest) => { replyGuests.add(guest); configureBrowserContent(guest); });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
const { ask } = require('./assistant');
const { bindCredential, credentialForEndpoint } = require('./compatible-provider');
const activeRequests = new Map();
ipcMain.handle('ask-ai', async (event, request) => {
  if (event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado');
  const { prompt, model, provider, jobId, continuation, results = [], endpoint, compatibleTools } = request;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20000 || typeof model !== 'string' || !model.trim() || model.length > 200 || typeof jobId !== 'string' || jobId.length > 80 || !Array.isArray(results)) throw new Error('Solicitud inválida');
  const controller = new AbortController();
  activeRequests.set(jobId, controller);
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    let apiKey = '';
    if (provider === 'openai') apiKey = credentials.get('openai');
    if (provider === 'compatible') apiKey = credentialForEndpoint(credentials, endpoint);
    return await ask({ prompt, model, provider, continuation, results, apiKey, endpoint, compatibleTools, signal: controller.signal });
  }
  finally { clearTimeout(timeout); if (activeRequests.get(jobId) === controller) activeRequests.delete(jobId); }
});
ipcMain.on('cancel-ai', (event, jobId) => {
  if (event.sender === mainWindow.webContents && typeof jobId === 'string') activeRequests.get(jobId)?.abort();
});

const { searchRecentPosts } = require('./search');
const activeSearches = new Map();
ipcMain.handle('search-x', async (event, { query, jobId }) => {
  if (event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado');
  if (typeof jobId !== 'string' || jobId.length > 80 || activeSearches.has(jobId)) throw new Error('Búsqueda inválida');
  const controller = new AbortController();
  activeSearches.set(jobId, controller);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 300000);
  try {
    return await searchRecentPosts({ query, token: credentials.get('x'), signal: controller.signal, onPage: posts => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('search-x-page', { jobId, posts });
    } });
  } catch (error) {
    if (timedOut) throw new Error('La búsqueda alcanzó el límite de cinco minutos.');
    throw error;
  } finally { clearTimeout(timeout); activeSearches.delete(jobId); }
});
ipcMain.on('cancel-search-x', (event, jobId) => {
  if (event.sender === mainWindow.webContents && typeof jobId === 'string') activeSearches.get(jobId)?.abort();
});

const { AgentBridge } = require('./agent-bridge');
let agentBridge;
app.whenReady().then(() => {
  agentBridge = new AgentBridge(app.getPath('userData'), (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  });
});
app.on('before-quit', () => agentBridge?.stop());
ipcMain.handle('enable-agent', async (event, profile) => {
  if (event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado');
  return agentBridge.start(profile.id, profile.name, profile.allProfiles === true);
});
ipcMain.handle('disable-agent', event => {
  if (event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado');
  agentBridge.stop();
});
ipcMain.on('agent-result', (event, { id, result }) => {
  if (event.sender === mainWindow.webContents && typeof id === 'string') agentBridge.respond(id, result);
});

ipcMain.handle('credentials-status', event => {
  if (event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado');
  return { openai: credentials.status('openai'), x: credentials.status('x'), compatible: credentials.status('compatible') };
});
ipcMain.handle('credentials-set', (event, { service, value, endpoint }) => {
  if (event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado');
  return credentials.set(service, service === 'compatible' ? bindCredential(endpoint, value) : value);
});
ipcMain.handle('credentials-clear', (event, service) => {
  if (event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado');
  return credentials.clear(service);
});

// Only the application shell can request a local reminder notification.
ipcMain.handle('show-reminder', (event, reminder) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado');
  if (!reminder || typeof reminder.title !== 'string' || typeof reminder.body !== 'string' || reminder.title.length > 160 || reminder.body.length > 500) throw new Error('Recordatorio inválido');
  if (!Notification.isSupported()) return false;
  new Notification({ title: reminder.title, body: reminder.body }).show();
  return true;
});

const noteFiles = require('./note-files');
function checkNoteSender(event) { if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado'); }
ipcMain.handle('note-read', (event, profileId, noteId) => { checkNoteSender(event); return noteFiles.read(app.getPath('userData'), profileId, noteId); });
ipcMain.handle('note-write', (event, profileId, noteId, text, revision) => { checkNoteSender(event); return noteFiles.write(app.getPath('userData'), profileId, noteId, text, revision); });
ipcMain.handle('note-remove', (event, profileId, noteId, revision) => { checkNoteSender(event); return noteFiles.remove(app.getPath('userData'), profileId, noteId, revision); });

ipcMain.handle('copy-template', (event, text) => { if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado'); if (typeof text !== 'string' || !text.trim() || text.length > 5000) throw new Error('Mensaje inválido'); clipboard.writeText(text); });

ipcMain.handle('choose-template-images', async event => { if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado'); const result = await dialog.showOpenDialog(mainWindow, { title: 'Seleccionar imágenes', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] }); if (result.canceled) return null; if (result.filePaths.length > 10) throw new Error('Selecciona como máximo 10 imágenes.'); return result.filePaths; });

ipcMain.handle('reply-attach-images', async (event, request) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado.');
  const { guestId, url, token, files } = request || {};
  if (!Number.isInteger(guestId) || typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token) || !Array.isArray(files) || !files.length || files.length > 10) throw new Error('Selección de imágenes inválida.');
  const guest = webContents.fromId(guestId);
  if (!guest || guest.isDestroyed() || !replyGuests.has(guest) || guest.getURL() !== url) throw new Error('La publicación cambió o se cerró.');
  let target; try { target = new URL(url); } catch { throw new Error('Dirección inválida.'); }
  if (target.protocol !== 'https:' || !/(^|\.)facebook\.com$/i.test(target.hostname) || target.username || target.password) throw new Error('La publicación no pertenece a Facebook.');
  const fs = require('node:fs/promises');
  for (const file of files) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.(png|jpe?g|webp|gif)$/i.test(file)) throw new Error('Archivo de imagen inválido.');
    const info = await fs.stat(file); if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('Revisa que cada imagen exista y no supere 20 MB.');
  }
  if (guest.debugger.isAttached()) throw new Error('No se puede preparar imágenes mientras otra herramienta controla la página.');
  guest.debugger.attach('1.3');
  try {
    if (guest.getURL() !== url) throw new Error('La página cambió.');
    const doc = await guest.debugger.sendCommand('DOM.getDocument', { depth: 0 });
    const found = await guest.debugger.sendCommand('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[data-social-reply="${token}-file"]` });
    if (!found.nodeId || guest.getURL() !== url) throw new Error('No se encontró el selector de imágenes del comentario.');
    await guest.debugger.sendCommand('DOM.setFileInputFiles', { nodeId: found.nodeId, files });
  } finally { if (guest.debugger.isAttached()) guest.debugger.detach(); }
});

ipcMain.handle('reply-image-previews', async (event, files) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Origen no autorizado.');
  if (!Array.isArray(files) || files.length > 10) throw new Error('Selección de imágenes inválida.');
  const fs = require('node:fs/promises');
  return Promise.all(files.map(async file => {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.(png|jpe?g|webp|gif)$/i.test(file)) throw new Error('Archivo de imagen inválido.');
    const info = await fs.stat(file); if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('Revisa que cada imagen exista y no supere 20 MB.');
    const image = nativeImage.createFromPath(file); return { path: file, preview: image.isEmpty() ? '' : image.resize({ width: 160, quality: 'good' }).toDataURL() };
  }));
});
