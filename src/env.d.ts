/** The typed surface the preload script exposes to the renderer. */
import type { NewActor, NewGarment, NewScene, StudioDoc } from './lib/studio-types.js';

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

export interface SessionModeState {
  adult: boolean;
  ageVerified: boolean;
  epoch: number;
  visuals: 'adult' | 'protected';
  agentAvailable: true;
  speechAction: 'none' | 'stop';
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
  router: {
    classify(prompt: string): Promise<{
      task: 'avatar' | 'image' | 'video' | 'edit' | 'chat';
      backend: 'stage-vrm' | 'comfyui-image' | 'comfyui-ltxv' | 'comfyui-img2img' | 'ollama-chat';
      model: string;
      reason: string;
      prompt: string;
      source: 'jev' | 'panda' | 'fallback';
      routerModel?: string;
    }>;
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
    voices(): Promise<{ id: string; name: string; culture: string; gender: 'female'; engine: 'kokoro'; description: string }[]>;
    onStatus(cb: (status: { state: 'idle' | 'loading' | 'ready' | 'generating' | 'error'; message: string }) => void): () => void;
    speak(payload: { text: string; voice?: string; rate?: number; volume?: number }): Promise<{
      file: string;
      bytes: number;
      voice: string;
      /** WAV samples used both for playback and real-time VRM lip sync. */
      audioBase64: string;
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
    generateAfterDark(payload: {
      positive?: string;
      negative?: string;
      reference: { name: string; dataBase64: string };
      seed?: number;
      width?: number;
      height?: number;
      steps?: number;
      cfg?: number;
      sampler?: string;
      scheduler?: string;
      checkpoint?: string;
      denoise?: number;
    }): Promise<
      | { kind: 'visible'; result: { promptId: string; file: string; url: string; kind: 'image'; outputDir: string } }
      | { kind: 'suppressed' }
    >;
  };
  mcp: {
    list(): Promise<McpServerState[]>;
    connect(id: string): Promise<McpServerState[]>;
    disconnect(id: string): Promise<McpServerState[]>;
    tools(id: string): Promise<McpTool[]>;
    call(id: string, name: string, args?: Record<string, unknown>): Promise<{ content?: { type: string; text: string }[] }>;
    onChanged(cb: (servers: McpServerState[]) => void): () => void;
  };
  studio: {
    read(): Promise<StudioDoc>;
    saveGarment(payload: NewGarment): Promise<StudioDoc['garments'][number]>;
    saveActor(payload: NewActor): Promise<StudioDoc['actors'][number]>;
    saveScene(payload: NewScene): Promise<StudioDoc['scenes'][number]>;
    uploadAsset(payload: { name: string; dataBase64: string; kind: 'image' | 'model' }): Promise<{ path: string; url: string; name: string }>;
    readAsset(filePath: string): Promise<{ name: string; dataBase64: string }>;
  };
  hermes: {
    status(): Promise<{ online: boolean; model?: string; error?: string }>;
    review(packet: { feature: string; checks: string[]; counts?: Record<string, number> }): Promise<{ review: string; model: string; sanitized: true }>;
  };
  mode: {
    state(): Promise<SessionModeState>;
    setAdult(enabled: boolean): Promise<SessionModeState>;
    clean(): Promise<SessionModeState>;
    acknowledgeClean(epoch: number): Promise<SessionModeState>;
    onChanged(cb: (state: SessionModeState) => void): () => void;
  };
  vault: {
    status(): Promise<{ hasPassword: boolean; unlocked: boolean }>;
    lock(): Promise<{ hasPassword: boolean; unlocked: boolean }>;
    setPassword(password: string): Promise<{ hasPassword: boolean; unlocked: boolean }>;
    unlock(password: string): Promise<{ hasPassword: boolean; unlocked: boolean }>;
    changePassword(current: string, next: string): Promise<{ hasPassword: boolean; unlocked: boolean }>;
    reset(password: string): Promise<{ hasPassword: boolean; unlocked: boolean }>;
    list(): Promise<{ name: string }[]>;
    add(payload: { name: string; dataBase64: string }): Promise<{ name: string }>;
    read(name: string): Promise<{ name: string; dataBase64: string } | null>;
    remove(name: string): Promise<void>;
  };
  paths(): Promise<{ dataDir: string; appRoot: string }>;
}

declare global {
  interface Window {
    trolly: TrollyBridge;
  }
}
