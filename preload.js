const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  chooseTemplateImages: () => ipcRenderer.invoke('choose-template-images'),
  copyTemplate: text => ipcRenderer.invoke('copy-template', text),
  readNote: (profileId, noteId) => ipcRenderer.invoke('note-read', profileId, noteId),
  writeNote: (profileId, noteId, text, revision) => ipcRenderer.invoke('note-write', profileId, noteId, text, revision),
  removeNote: (profileId, noteId, revision) => ipcRenderer.invoke('note-remove', profileId, noteId, revision),
  showReminder: reminder => ipcRenderer.invoke('show-reminder', reminder),
  ask: request => ipcRenderer.invoke('ask-ai', request),
  cancel: jobId => ipcRenderer.send('cancel-ai', jobId),
  searchX: request => ipcRenderer.invoke('search-x', request),
  cancelSearchX: jobId => ipcRenderer.send('cancel-search-x', jobId),
  onSearchXPage: callback => ipcRenderer.on('search-x-page', (_, result) => callback(result)),
  enableAgent: profile => ipcRenderer.invoke('enable-agent', profile),
  disableAgent: () => ipcRenderer.invoke('disable-agent'),
  onAgentAction: callback => ipcRenderer.on('agent-action', (_, action) => callback(action)),
  onAgentCancel: callback => ipcRenderer.on('agent-cancel', (_, action) => callback(action)),
  agentResult: (id, result) => ipcRenderer.send('agent-result', { id, result }),
  credentialsStatus: () => ipcRenderer.invoke('credentials-status'),
  credentialsSet: (service, value, endpoint) => ipcRenderer.invoke('credentials-set', { service, value, endpoint }),
  credentialsClear: service => ipcRenderer.invoke('credentials-clear', service),
  onOpenTab: callback => ipcRenderer.on('open-tab', (_, url) => callback(url))
});
