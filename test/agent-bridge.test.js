const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { AgentBridge } = require('../agent-bridge');

function send(socketPath, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let data = '';
    socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data', chunk => { data += chunk; if (data.includes('\n')) resolve(JSON.parse(data)); });
    socket.on('error', reject);
  });
}

test('authorizes actions for a pinned profile and revokes the connection', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-bridge-test-'));
  let action;
  const bridge = new AgentBridge(directory, (channel, payload) => {
    if (channel === 'agent-action') { action = payload; bridge.respond(payload.id, { output: 'ok' }); }
  });
  try {
    const profileId = 'a18bfba0-7cec-4e70-8301-5834c0c4ef07';
    await bridge.start(profileId, 'Empresa');
    const descriptor = JSON.parse(fs.readFileSync(path.join(directory, 'agent-connection.json'), 'utf8'));
    assert.equal(fs.statSync(path.join(directory, 'agent-connection.json')).mode & 0o777, 0o600);
    const invalid = await send(descriptor.socketPath, { token: 'wrong', name: 'open_network', arguments: { network: 'X' } });
    assert.match(invalid.error, /no autorizada/);
    const valid = await send(descriptor.socketPath, { token: descriptor.token, name: 'open_network', arguments: { network: 'X' } });
    assert.equal(valid.output, 'ok');
    assert.equal(action.profileId, profileId);
    bridge.stop();
    assert.equal(fs.existsSync(path.join(directory, 'agent-connection.json')), false);
    assert.equal(fs.existsSync(descriptor.socketPath), false);
  } finally { bridge.stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});
