const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only surface the renderer gets. No Node, no fs, no raw ipcRenderer.
 */
contextBridge.exposeInMainWorld('trolly', {
  ollama: {
    models: () => ipcRenderer.invoke('trolly:ollama:models'),
    chat: (payload) => ipcRenderer.invoke('trolly:ollama:chat', payload),
    pull: (name) => ipcRenderer.invoke('trolly:ollama:pull', name),
    delete: (name) => ipcRenderer.invoke('trolly:ollama:delete', name),
  },
  provider: {
    models: (input) => ipcRenderer.invoke('trolly:provider:models', input),
    chat: (input) => ipcRenderer.invoke('trolly:provider:chat', input),
  },
  agents: {
    list: () => ipcRenderer.invoke('trolly:agents:list'),
  },
  workspace: {
    list: () => ipcRenderer.invoke('trolly:workspace:list'),
    create: (input) => ipcRenderer.invoke('trolly:workspace:create', input),
    setStatus: (id, status) => ipcRenderer.invoke('trolly:workspace:status', { id, status }),
    delete: (id) => ipcRenderer.invoke('trolly:workspace:delete', id),
  },
  router: {
    classify: (prompt) => ipcRenderer.invoke('trolly:router:classify', prompt),
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
    verifyAge: (birthDate) => ipcRenderer.invoke('trolly:mind:prefs:verify', birthDate),
    setAdultContent: (enabled) => ipcRenderer.invoke('trolly:mind:prefs:adult', enabled),
    resetVerification: () => ipcRenderer.invoke('trolly:mind:prefs:reset'),
  },
  speech: {
    voices: () => ipcRenderer.invoke('trolly:speech:voices'),
    speak: (payload) => ipcRenderer.invoke('trolly:speech:speak', payload),
    onStatus: (cb) => {
      const listener = (_e, status) => cb(status);
      ipcRenderer.on('trolly:speech:status', listener);
      return () => ipcRenderer.removeListener('trolly:speech:status', listener);
    },
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
    error: () => ipcRenderer.invoke('trolly:mcp:error'),
    connect: (id) => ipcRenderer.invoke('trolly:mcp:connect', id),
    disconnect: (id) => ipcRenderer.invoke('trolly:mcp:disconnect', id),
    tools: (id) => ipcRenderer.invoke('trolly:mcp:tools', id),
    call: (id, name, args) => ipcRenderer.invoke('trolly:mcp:call', { id, name, args }),
    add: (input) => ipcRenderer.invoke('trolly:mcp:add', input),
    remove: (id) => ipcRenderer.invoke('trolly:mcp:remove', id),
    onChanged: (cb) => {
      const listener = (_e, servers) => cb(servers);
      ipcRenderer.on('trolly:mcp:changed', listener);
      return () => ipcRenderer.removeListener('trolly:mcp:changed', listener);
    },
  },
  studio: {
    read: () => ipcRenderer.invoke('trolly:studio:read'),
    saveGarment: (payload) => ipcRenderer.invoke('trolly:studio:garment:save', payload),
    saveActor: (payload) => ipcRenderer.invoke('trolly:studio:actor:save', payload),
    saveScene: (payload) => ipcRenderer.invoke('trolly:studio:scene:save', payload),
    uploadAsset: (payload) => ipcRenderer.invoke('trolly:studio:asset:upload', payload),
    readAsset: (filePath) => ipcRenderer.invoke('trolly:studio:asset:read', filePath),
  },
  hermes: {
    status: () => ipcRenderer.invoke('trolly:hermes:status'),
    review: (packet) => ipcRenderer.invoke('trolly:hermes:review', packet),
  },
  mode: {
    state: () => ipcRenderer.invoke('trolly:mode:state'),
    setAdult: (enabled) => ipcRenderer.invoke('trolly:mode:adult', enabled),
    clean: () => ipcRenderer.invoke('trolly:mode:clean'),
    acknowledgeClean: (epoch) => ipcRenderer.invoke('trolly:mode:clean-ack', epoch),
    onChanged: (cb) => {
      const listener = (_e, state) => cb(state);
      ipcRenderer.on('trolly:mode:changed', listener);
      return () => ipcRenderer.removeListener('trolly:mode:changed', listener);
    },
  },
  glance: {
    toggle: () => ipcRenderer.invoke('trolly:glance:toggle'),
  },
  vault: {
    status: () => ipcRenderer.invoke('trolly:vault:status'),
    lock: () => ipcRenderer.invoke('trolly:vault:lock'),
    setPassword: (password) => ipcRenderer.invoke('trolly:vault:set', password),
    unlock: (password, confirmMigration) => ipcRenderer.invoke('trolly:vault:unlock', password, confirmMigration),
    changePassword: (current, next, confirmMigration) => ipcRenderer.invoke('trolly:vault:change', current, next, confirmMigration),
    reset: (password) => ipcRenderer.invoke('trolly:vault:reset', password),
    list: () => ipcRenderer.invoke('trolly:vault:list'),
    add: (payload) => ipcRenderer.invoke('trolly:vault:add', payload),
    read: (name) => ipcRenderer.invoke('trolly:vault:read', name),
    remove: (name) => ipcRenderer.invoke('trolly:vault:remove', name),
  },
  paths: () => ipcRenderer.invoke('trolly:paths'),
});
