/** The typed surface the preload script exposes to the renderer. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] };
}

export interface McpServerState {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  enabled: boolean;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  toolCount?: number;
  serverInfo?: { name?: string; version?: string };
}

export interface OllamaModel {
  name: string;
  size: number;
  contextLength?: number;
  family?: string;
}

export interface Persona {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
}

export interface Recipe {
  id: string;
  title: string;
  prompt: string;
  updatedAt: string;
}

export interface Preferences {
  adultContent: boolean;
  ageVerified: boolean;
  verifiedAt?: string;
  birthYear?: number;
}

export interface MindDoc {
  personas: Persona[];
  memories: Memory[];
  recipes: Recipe[];
  preferences: Preferences;
}

export interface TrollyBridge {
  ollama: {
    models(): Promise<OllamaModel[]>;
    chat(payload: {
      model: string;
      messages: {
        role: 'system' | 'user' | 'assistant';
        content: string;
        /** Base64-encoded image attachments for the local vision model. */
        images?: string[];
      }[];
      temperature?: number;
      maxTokens?: number;
    }): Promise<string>;
  };
  mind: {
    read(): Promise<MindDoc>;
    persona(): Promise<Persona | null>;
    savePersona(payload: { id?: string; name: string; content: string }): Promise<Persona>;
    saveMemory(payload: {
      id?: string;
      title: string;
      content: string;
      tags?: string[];
    }): Promise<Memory>;
    deleteMemory(id: string): Promise<void>;
    saveRecipe(payload: { id?: string; title: string; prompt: string }): Promise<Recipe>;
    deleteRecipe(id: string): Promise<void>;
    readPrefs(): Promise<Preferences>;
    verifyAge(birthYear: number): Promise<Preferences>;
    setAdultContent(enabled: boolean): Promise<Preferences>;
    resetVerification(): Promise<Preferences>;
  };
  speech: {
    voices(): Promise<{ name: string; culture: string }[]>;
    speak(payload: { text: string; voice?: string; rate?: number; volume?: number }): Promise<{
      file: string;
      bytes: number;
      voice: string;
    }>;
  },
  comfy: {
    status(): Promise<{ online: boolean; comfyuiVersion?: string; device?: string; vramTotal?: number; vramFree?: number; error?: string }>;
    inventory(): Promise<{
      checkpoints: string[];
      diffusionModels: string[];
      textEncoders: string[];
      vaes: string[];
    }>;
    outputs(limit?: number): Promise<{ filename: string; url: string }[]>;
    generate(payload: {
      positive: string;
      negative?: string;
      seed?: number;
      width?: number;
      height?: number;
      steps?: number;
      cfg?: number;
      sampler?: string;
      checkpoint?: string;
      filenamePrefix?: string;
      mode?: 'image' | 'video';
      duration?: number;
    }): Promise<{ promptId: string; file: string; url: string; kind?: string }>;
  };
  mcp: {
    list(): Promise<McpServerState[]>;
    connect(id: string): Promise<McpServerState[]>;
    disconnect(id: string): Promise<McpServerState[]>;
    tools(id: string): Promise<McpTool[]>;
    call(id: string, name: string, args?: Record<string, unknown>): Promise<{ content?: { type: string; text: string }[] }>;
    onChanged(cb: (servers: McpServerState[]) => void): () => void;
  };
  paths(): Promise<{ dataDir: string; appRoot: string }>;
}

declare global {
  interface Window {
    trolly: TrollyBridge;
  }
}
