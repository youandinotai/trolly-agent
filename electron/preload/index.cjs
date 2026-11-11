const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only surface the renderer gets. No Node, no fs, no raw ipcRenderer.
 */
contextBridge.exposeInMainWorld('trolly', {
  ollama: {
    models: () => ipcRenderer.invoke('trolly:ollama:models'),
    chat: (payload) => ipcRenderer.invoke('trolly:ollama:chat', payload),
  },
  mind: {
    read: () => ipcRenderer.invoke('trolly:mind:read'),
    persona: () => ipcRenderer.invoke('trolly:mind:persona'),
    savePersona: (payload) => ipcRenderer.invoke('trolly:mind:persona:save', payload),
    saveMemory: (payload) => ipcRenderer.invoke('trolly:mind:memory:save', payload),
    deleteMemory: (id) => ipcRenderer.invoke('trolly:mind:memory:delete', id),
    saveRecipe: (payload) => ipcRenderer.invoke('trolly:mind:recipe:save', payload),
    deleteRecipe: (id) => ipcRenderer.invoke('trolly:mind:recipe:delete', id),
    readPrefs: () => ipcRenderer.invoke('trolly:mind:prefs:read'),
    verifyAge: (birthYear) => ipcRenderer.invoke('trolly:mind:prefs:verify', birthYear),
    setAdultContent: (enabled) => ipcRenderer.invoke('trolly:mind:prefs:adult', enabled),
    resetVerification: () => ipcRenderer.invoke('trolly:mind:prefs:reset'),
  },
  speech: {
    voices: () => ipcRenderer.invoke('trolly:speech:voices'),
    speak: (payload) => ipcRenderer.invoke('trolly:speech:speak', payload),
  },
  comfy: {
    status: () => ipcRenderer.invoke('trolly:comfy:status'),
    generate: (payload) => ipcRenderer.invoke('trolly:comfy:generate', payload),
    inventory: () => ipcRenderer.invoke('trolly:comfy:inventory'),
    outputs: (limit) => ipcRenderer.invoke('trolly:comfy:outputs', limit),
    generateAfterDark: (payload) => ipcRenderer.invoke('trolly:comfy:after-dark', payload),
  },
  mcp: {
    list: () => ipcRenderer.invoke('trolly:mcp:list'),
    connect: (id) => ipcRenderer.invoke('trolly:mcp:connect', id),
    disconnect: (id) => ipcRenderer.invoke('trolly:mcp:disconnect', id),
    tools: (id) => ipcRenderer.invoke('trolly:mcp:tools', id),
    call: (id, name, args) => ipcRenderer.invoke('trolly:mcp:call', { id, name, args }),
    onChanged: (cb) => {
      const listener = (_e, servers) => cb(servers);
      ipcRenderer.on('trolly:mcp:changed', listener);
      return () => ipcRenderer.removeListener('trolly:mcp:changed', listener);
    },
  },
  paths: () => ipcRenderer.invoke('trolly:paths'),
});
