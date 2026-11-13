import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  VRM,
  VRMExpressionPresetName,
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm';

import {
  blinkEnvelope,
  idlePose,
  mouthShapes,
  normalizeAudioLevel,
  type AvatarEmotion,
} from './avatar-motion';
import { AvatarWardrobe } from './avatar-wardrobe';
import type { StudioGarment } from './studio-types.js';

export type AvatarFraming = 'full' | 'portrait';
export type AvatarQuality = 'low' | 'balanced' | 'high';

interface EngineEvents {
  onSpeaking?: (speaking: boolean) => void;
  onError?: (message: string) => void;
}

const EMOTIONS: AvatarEmotion[] = ['neutral', 'happy', 'sad', 'angry', 'relaxed', 'surprised'];
const FACE_PRESETS = [
  VRMExpressionPresetName.Happy,
  VRMExpressionPresetName.Sad,
  VRMExpressionPresetName.Angry,
  VRMExpressionPresetName.Relaxed,
  VRMExpressionPresetName.Surprised,
  VRMExpressionPresetName.Neutral,
];

/** Owns the WebGL stage. All model and audio processing stays in this process. */
export class AvatarEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  private readonly controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly gazeTarget = new THREE.Object3D();
  private readonly pointer = { x: 0, y: 0 };
  private readonly baseBoneRotations = new Map<THREE.Object3D, THREE.Quaternion>();
  private readonly baseChestScale = new THREE.Vector3(1, 1, 1);
  private readonly events: EngineEvents;
  private readonly wardrobe = new AvatarWardrobe();
  private readonly keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  private readonly rimLight = new THREE.DirectionalLight(0x7c9cf5, 2.4);

  private vrm: VRM | null = null;
  private model: THREE.Object3D | null = null;
  private modelHeight = 1.6;
  private animationFrame = 0;
  private previousFrame = 0;
  private elapsed = 0;
  private nextBlinkAt = 2;
  private blinkStarted = -1;
  private emotion: AvatarEmotion = 'neutral';
  private smileAmount = 0;
  private gazeEnabled = true;
  private idleEnabled = true;
  private reducedMotion = false;
  private idleAmount = 1;
  private micSensitivity = 1.4;
  private framing: AvatarFraming = 'full';
  private zoom = 1;
  private quality: AvatarQuality = 'balanced';
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioSource: AudioNode | null = null;
  private speechElement: HTMLAudioElement | null = null;
  private speechFinished: (() => void) | null = null;
  private microphone: MediaStream | null = null;
  private timeData = new Uint8Array(512);
  private frequencyData = new Uint8Array(256);
  private smoothedMouth = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement, events: EngineEvents = {}) {
    this.events = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.65;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = Math.PI * 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.65;

    this.scene.add(new THREE.HemisphereLight(0xd9f9ff, 0x192133, 2.2));
    this.keyLight.position.set(2.5, 4, 3);
    this.scene.add(this.keyLight);
    this.rimLight.position.set(-3, 2, -2);
    this.scene.add(this.rimLight);
    this.scene.add(this.gazeTarget);
    this.createEnvironment();

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.frameModel();
    this.animationFrame = requestAnimationFrame((time) => this.animate(time));
  }

  private createEnvironment() {
    const grid = new THREE.GridHelper(12, 48, 0x285b60, 0x202a3b);
    grid.position.y = -0.012;
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.32;
    });
    this.scene.add(grid);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.64, 0.65, 96),
      new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    this.scene.add(ring);
  }

  async loadModel(file: File): Promise<{ name: string; kind: 'VRM' | 'GLB'; meta?: string }> {
    if (!/\.(vrm|glb)$/i.test(file.name)) throw new Error('Choose a .vrm or .glb avatar file.');
    if (file.size > 300 * 1024 * 1024) throw new Error('That avatar is over the 300 MB safety limit.');

    const buffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(buffer, '');
    const vrm = (gltf.userData.vrm as VRM | undefined) ?? null;

    this.removeModel();
    this.model = vrm?.scene ?? gltf.scene;
    this.vrm = vrm;
    if (vrm) {
      if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse((object) => {
        object.frustumCulled = false;
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      if (vrm.lookAt) {
        vrm.lookAt.target = this.gazeTarget;
        vrm.lookAt.autoUpdate = true;
      }
      for (const name of ['head', 'neck', 'spine', 'chest'] as const) {
        const bone = vrm.humanoid.getNormalizedBoneNode(name);
        if (bone) this.baseBoneRotations.set(bone, bone.quaternion.clone());
      }
      for (const name of ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm'] as const) {
        const bone = vrm.humanoid.getNormalizedBoneNode(name);
        if (bone) this.baseBoneRotations.set(bone, bone.quaternion.clone());
      }
      const chest = vrm.humanoid.getNormalizedBoneNode('chest');
      if (chest) this.baseChestScale.copy(chest.scale);
    }

    this.scene.add(this.model);
    const bounds = new THREE.Box3().setFromObject(this.model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    this.modelHeight = Math.max(size.y, 0.5);
    this.model.position.x -= center.x;
    this.model.position.y -= bounds.min.y;
    this.model.position.z -= center.z;
    this.wardrobe.attach(this.model, this.vrm, this.modelHeight);
    this.frameModel();
    this.elapsed = 0;
    this.nextBlinkAt = 2;

    const meta = vrm?.meta;
    const creator = meta
      ? ('authors' in meta ? meta.authors?.join(', ') : meta.author) || ''
      : '';
    return { name: file.name.replace(/\.(vrm|glb)$/i, ''), kind: vrm ? 'VRM' : 'GLB', meta: creator };
  }

  private removeModel() {
    if (!this.model) return;
    this.wardrobe.clearGarments();
    this.scene.remove(this.model);
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    else {
      this.model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    }
    this.model = null;
    this.vrm = null;
    this.baseBoneRotations.clear();
  }

  setEmotion(emotion: AvatarEmotion) {
    this.emotion = emotion;
  }

  setSmile(value: number) {
    this.smileAmount = THREE.MathUtils.clamp(value, 0, 1);
  }

  setHair(settings: { color: string; length: number; volume: number }) {
    this.wardrobe.setHair(settings);
  }

  applyGarment(garment: Pick<StudioGarment, 'id' | 'category' | 'color' | 'scale' | 'imageUrl'>) {
    this.wardrobe.applyGarment(garment);
  }

  removeGarment(id: string) {
    this.wardrobe.removeGarment(id);
  }

  clearGarments() {
    this.wardrobe.clearGarments();
  }

  /** Switch only the presentation; model, chat, tools, and task state survive. */
  setCleanMode(enabled: boolean): boolean {
    const ready = this.wardrobe.setCleanMode(enabled);
    if (enabled) {
      this.stopAudio();
      this.setEmotion('neutral');
      this.setSmile(0.15);
    }
    if (this.model) this.renderer.render(this.scene, this.camera);
    return ready;
  }

  get safeReady(): boolean {
    return this.wardrobe.safeReady;
  }

  setSceneLighting(settings: { accent: string; intensity: number }) {
    const intensity = THREE.MathUtils.clamp(settings.intensity, 0.2, 3);
    this.keyLight.color.set(settings.accent);
    this.keyLight.intensity = 3.2 * intensity;
    this.rimLight.color.set(settings.accent);
    this.rimLight.intensity = 2.4 * intensity;
  }

  setGaze(enabled: boolean) {
    this.gazeEnabled = enabled;
  }

  setIdle(enabled: boolean) {
    this.idleEnabled = enabled;
  }

  setReducedMotion(enabled: boolean) {
    this.reducedMotion = enabled;
  }

  setIdleAmount(value: number) {
    this.idleAmount = THREE.MathUtils.clamp(value, 0, 2);
  }

  setMicSensitivity(value: number) {
    this.micSensitivity = THREE.MathUtils.clamp(value, 0.2, 3);
  }

  setPointer(x: number, y: number) {
    this.pointer.x = THREE.MathUtils.clamp(x, -1, 1);
    this.pointer.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  setFraming(framing: AvatarFraming) {
    this.framing = framing;
    this.frameModel();
  }

  setZoom(zoom: number) {
    this.zoom = THREE.MathUtils.clamp(zoom, 0.65, 2);
    this.frameModel();
  }

  setQuality(quality: AvatarQuality) {
    this.quality = quality;
    const cap = quality === 'low' ? 0.85 : quality === 'balanced' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.resize();
  }

  private frameModel() {
    const targetHeight = this.framing === 'portrait' ? this.modelHeight * 0.76 : this.modelHeight * 0.48;
    const visibleHeight = this.framing === 'portrait' ? this.modelHeight * 0.57 : this.modelHeight * 1.14;
    const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / this.zoom;
    this.camera.position.set(0, targetHeight + 0.06, Math.max(0.7, distance));
    this.controls.target.set(0, targetHeight, 0);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  /** Play the SAPI WAV and use its actual samples to animate the mouth. */
  async playSpeech(base64: string): Promise<void> {
    this.stopAudio();
    const context = await this.ensureAudio();
    const analyser = this.createAnalyser(context);
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    this.speechElement = audio;
    this.audioSource = context.createMediaElementSource(audio);
    this.audioSource.connect(analyser);
    analyser.connect(context.destination);
    audio.onended = () => {
      if (this.speechElement === audio) this.stopAudio();
    };
    audio.onerror = () => {
      if (this.speechElement === audio) {
        this.events.onError?.('The synthesized voice audio could not be played.');
        this.stopAudio();
      }
    };
    this.events.onSpeaking?.(true);
    await audio.play();
    await new Promise<void>((resolve) => { this.speechFinished = resolve; });
  }

  async toggleMicrophone(): Promise<boolean> {
    if (this.microphone) {
      this.stopAudio();
      return false;
    }
    this.stopAudio();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const context = await this.ensureAudio();
    const analyser = this.createAnalyser(context);
    this.microphone = stream;
    this.audioSource = context.createMediaStreamSource(stream);
    this.audioSource.connect(analyser);
    this.events.onSpeaking?.(true);
    return true;
  }

  stopAudio() {
    const finished = this.speechFinished;
    this.speechFinished = null;
    this.speechElement?.pause();
    this.speechElement = null;
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;
    this.audioSource?.disconnect();
    this.audioSource = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.smoothedMouth = 0;
    this.events.onSpeaking?.(false);
    finished?.();
  }

  private async ensureAudio(): Promise<AudioContext> {
    this.audioContext ??= new AudioContext();
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    return this.audioContext;
  }

  private createAnalyser(context: AudioContext): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.35;
    this.analyser = analyser;
    this.timeData = new Uint8Array(analyser.fftSize);
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    return analyser;
  }

  private readMouth(delta: number) {
    let level = 0;
    let centroid = 0.5;
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(this.timeData);
      this.analyser.getByteFrequencyData(this.frequencyData);
      let sum = 0;
      for (const sample of this.timeData) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      level = normalizeAudioLevel(Math.sqrt(sum / this.timeData.length), this.micSensitivity);
      let weighted = 0;
      let energy = 0;
      for (let i = 2; i < this.frequencyData.length; i++) {
        const magnitude = this.frequencyData[i];
        weighted += i * magnitude;
        energy += magnitude;
      }
      if (energy > 0) centroid = THREE.MathUtils.clamp(weighted / energy / 80, 0, 1);
    }
    const response = level > this.smoothedMouth ? 22 : 12;
    this.smoothedMouth = THREE.MathUtils.damp(this.smoothedMouth, level, response, delta);
    return mouthShapes(this.smoothedMouth, centroid);
  }

  private updatePerformance(delta: number) {
    const vrm = this.vrm;
    if (!vrm) {
      if (this.model && this.idleEnabled && !this.reducedMotion) {
        this.model.rotation.y = Math.sin(this.elapsed * 0.45) * 0.035;
      }
      return;
    }

    const expressions = vrm.expressionManager;
    if (expressions) {
      for (const emotion of EMOTIONS) {
        const current = expressions.getValue(emotion) ?? 0;
        const target = emotion === 'happy'
          ? Math.max(emotion === this.emotion ? 1 : 0, this.smileAmount)
          : emotion === this.emotion ? 1 : 0;
        expressions.setValue(emotion, THREE.MathUtils.damp(current, target, 7, delta));
      }
      const phase = this.blinkStarted < 0 ? -1 : (this.elapsed - this.blinkStarted) / 0.16;
      expressions.setValue(VRMExpressionPresetName.Blink, this.reducedMotion ? 0 : blinkEnvelope(phase));
      const shapes = this.readMouth(delta);
      for (const [name, value] of Object.entries(shapes)) expressions.setValue(name, value);
    }

    const pose = idlePose(
      this.elapsed,
      this.gazeEnabled ? this.pointer : { x: 0, y: 0 },
      this.idleEnabled ? this.idleAmount : 0,
      this.reducedMotion,
    );
    this.rotateBone('head', pose.headPitch, pose.headYaw, pose.headRoll);
    this.rotateBone('neck', pose.headPitch * 0.22, pose.headYaw * 0.2, 0);
    this.rotateBone('spine', 0, 0, pose.spineRoll);
    const chest = vrm.humanoid.getNormalizedBoneNode('chest');
    if (chest) chest.scale.copy(this.baseChestScale).multiplyScalar(pose.chestScale);
    this.relaxArm('leftUpperArm', -0.95);
    this.relaxArm('rightUpperArm', 0.95);
    this.relaxArm('leftLowerArm', -0.12);
    this.relaxArm('rightLowerArm', 0.12);

    this.gazeTarget.position.set(
      this.gazeEnabled ? this.pointer.x * 1.2 : 0,
      this.modelHeight * 0.77 + (this.gazeEnabled ? this.pointer.y * 0.65 : 0),
      2.5,
    );
    vrm.update(delta);
  }

  private relaxArm(name: 'leftUpperArm' | 'rightUpperArm' | 'leftLowerArm' | 'rightLowerArm', angle: number) {
    const bone = this.vrm?.humanoid.getNormalizedBoneNode(name);
    if (!bone) return;
    const base = this.baseBoneRotations.get(bone) ?? new THREE.Quaternion();
    bone.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, angle)));
  }

  private rotateBone(name: 'head' | 'neck' | 'spine', x: number, y: number, z: number) {
    const bone = this.vrm?.humanoid.getNormalizedBoneNode(name);
    if (!bone) return;
    const base = this.baseBoneRotations.get(bone) ?? new THREE.Quaternion();
    bone.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
  }

  private animate(timeMs: number) {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame((time) => this.animate(time));
    const maxFps = this.quality === 'low' ? 30 : 60;
    if (timeMs - this.previousFrame < 1000 / maxFps - 1) return;
    const delta = Math.min((timeMs - this.previousFrame) / 1000 || 1 / 60, 0.06);
    this.previousFrame = timeMs;
    if (document.hidden) return;
    this.elapsed += delta;

    if (!this.reducedMotion && this.elapsed >= this.nextBlinkAt) {
      this.blinkStarted = this.elapsed;
      this.nextBlinkAt = this.elapsed + 2.1 + Math.random() * 3.8;
    }
    this.updatePerformance(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.stopAudio();
    void this.audioContext?.close();
    this.controls.dispose();
    this.wardrobe.dispose();
    this.removeModel();
    this.renderer.dispose();
  }
}
