const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const allowedActions = new Set(['list_profiles', 'select_profile', 'list_tabs', 'select_tab', 'open_tab', 'close_tab', 'open_network', 'open_inbox', 'search_facebook', 'search_web', 'search_x_recent', 'save_draft', 'read_page', 'scroll_page', 'navigate_page', 'inspect_controls', 'fill_control', 'click_control', 'save_opportunity', 'wait_page']);

class AgentBridge {
  constructor(userData, send) {
    this.userData = userData;
    this.send = send;
    this.server = null;
    this.pending = new Map();
    this.connections = new Set();
  }

  async start(profileId, profileName, allProfiles = false) {
    if (this.server) throw new Error('El acceso para agentes ya está activo.');
    if (process.platform === 'win32') throw new Error('El acceso local para agentes aún no está disponible en Windows.');
    if (!/^[a-f0-9-]{36}$/.test(profileId) || typeof profileName !== 'string') throw new Error('Perfil inválido.');
    const token = crypto.randomBytes(32).toString('hex');
    const socketPath = path.join(this.userData, `agent-${process.pid}-${crypto.randomBytes(4).toString('hex')}.sock`);
    if (Buffer.byteLength(socketPath) > 100) throw new Error('La ruta de datos es demasiado larga para el canal local.');
    const server = net.createServer(socket => this.handleConnection(socket, token, profileId, allProfiles));
    server.on('error', error => console.error('Error del canal de agentes:', error.message));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, () => { server.removeListener('error', reject); resolve(); });
    });
    try {
      fs.chmodSync(socketPath, 0o600);
      const descriptor = path.join(this.userData, 'agent-connection.json');
      const temp = path.join(this.userData, `agent-${process.pid}.json.tmp`);
      fs.writeFileSync(temp, JSON.stringify({ socketPath, token }), { mode: 0o600 });
      fs.renameSync(temp, descriptor);
      this.server = server;
      this.socketPath = socketPath;
      this.descriptor = descriptor;
      this.token = token;
      this.profileId = profileId;
      return { profileName };
    } catch (error) {
      server.close();
      try { fs.unlinkSync(socketPath); } catch {}
      throw error;
    }
  }

  handleConnection(socket, token, profileId, allProfiles) {
    this.connections.add(socket);
    let data = '';
    let handled = false;
    let requestId;
    socket.setTimeout(330000, () => socket.destroy());
    socket.on('data', chunk => {
      if (handled) return;
      data += chunk.toString('utf8');
      if (Buffer.byteLength(data) > 32000) { socket.destroy(); return; }
      const end = data.indexOf('\n');
      if (end < 0) return;
      handled = true;
      let request;
      try { request = JSON.parse(data.slice(0, end)); } catch { socket.end(JSON.stringify({ error: 'Solicitud inválida' }) + '\n'); return; }
      const supplied = Buffer.from(typeof request.token === 'string' ? request.token : '');
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected) || !allowedActions.has(request.name) || !request.arguments || typeof request.arguments !== 'object' || Array.isArray(request.arguments)) {
        socket.end(JSON.stringify({ error: 'Solicitud no autorizada o inválida' }) + '\n'); return;
      }
      const targetProfileId = request.profileId || profileId;
      if (typeof targetProfileId !== 'string' || !/^[a-f0-9-]{36}$/.test(targetProfileId) || (!allProfiles && targetProfileId !== profileId)) {
        socket.end(JSON.stringify({ error: 'El perfil no está autorizado' }) + '\n'); return;
      }
      requestId = crypto.randomUUID();
      const timer = setTimeout(() => { this.pending.delete(requestId); this.send('agent-cancel', { id: requestId }); socket.end(JSON.stringify({ error: 'La operación excedió el tiempo permitido' }) + '\n'); }, 310000);
      this.pending.set(requestId, { socket, timer });
      this.send('agent-action', { id: requestId, profileId: targetProfileId, allProfiles, name: request.name, arguments: request.arguments });
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      this.connections.delete(socket);
      const pending = this.pending.get(requestId);
      if (pending) { clearTimeout(pending.timer); this.pending.delete(requestId); this.send('agent-cancel', { id: requestId }); }
    });
  }

  respond(id, result) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.socket.end(JSON.stringify(result) + '\n');
  }

  stop() {
    if (!this.server) return;
    for (const [id, pending] of this.pending) { clearTimeout(pending.timer); this.send('agent-cancel', { id }); pending.socket.destroy(); }
    this.pending.clear();
    for (const connection of this.connections) connection.destroy();
    this.server.close();
    try {
      const descriptor = JSON.parse(fs.readFileSync(this.descriptor, 'utf8'));
      if (descriptor.token === this.token) fs.unlinkSync(this.descriptor);
    } catch {}
    try { fs.unlinkSync(this.socketPath); } catch {}
    this.server = null;
    this.token = null;
  }
}
module.exports = { AgentBridge };
