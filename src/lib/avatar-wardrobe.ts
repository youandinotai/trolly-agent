import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

import type { GarmentCategory, StudioGarment } from './studio-types.js';

export interface GarmentPieceSpec {
  shape: 'sphere' | 'cylinder' | 'dress';
  bone: 'head' | 'chest' | 'hips' | 'leftFoot' | 'rightFoot';
  position: [number, number, number];
  scale: [number, number, number];
}

export function buildGarmentSpec(category: GarmentCategory, height: number): { shape: GarmentCategory; pieces: GarmentPieceSpec[] } {
  const h = Math.max(0.5, Math.min(3, height));
  if (category === 'hat') return { shape: category, pieces: [
    { shape: 'cylinder', bone: 'head', position: [0, h * 0.07, 0], scale: [h * 0.10, h * 0.038, h * 0.10] },
    { shape: 'cylinder', bone: 'head', position: [0, h * 0.05, 0], scale: [h * 0.13, h * 0.012, h * 0.13] },
  ] };
  if (category === 'top') return { shape: category, pieces: [
    { shape: 'cylinder', bone: 'chest', position: [0, -h * 0.09, h * 0.02], scale: [h * 0.25, h * 0.34, h * 0.2] },
  ] };
  if (category === 'dress') return { shape: category, pieces: [
    { shape: 'dress', bone: 'chest', position: [0, -h * 0.20, h * 0.02], scale: [h * 0.34, h * 0.56, h * 0.28] },
  ] };
  if (category === 'shoes') return { shape: category, pieces: [
    { shape: 'sphere', bone: 'leftFoot', position: [0, -h * 0.015, h * 0.07], scale: [h * 0.07, h * 0.025, h * 0.11] },
    { shape: 'sphere', bone: 'rightFoot', position: [0, -h * 0.015, h * 0.07], scale: [h * 0.07, h * 0.025, h * 0.11] },
  ] };
  if (category === 'bikini') return { shape: category, pieces: [
    { shape: 'sphere', bone: 'chest', position: [-h * 0.05, -h * 0.11, h * 0.08], scale: [h * 0.09, h * 0.065, h * 0.055] },
    { shape: 'sphere', bone: 'chest', position: [h * 0.05, -h * 0.11, h * 0.08], scale: [h * 0.09, h * 0.065, h * 0.055] },
    { shape: 'sphere', bone: 'hips', position: [0, -h * 0.17, h * 0.06], scale: [h * 0.12, h * 0.09, h * 0.07] },
  ] };
  return { shape: category, pieces: [
    { shape: 'sphere', bone: 'hips', position: [0, -h * 0.09, h * 0.055], scale: [h * 0.16, h * 0.1, h * 0.07] },
  ] };
}

/** A deliberately modest, reusable Clean presentation for any humanoid VRM. */
export function safeGarmentSpecs(height: number) {
  return [buildGarmentSpec('dress', height), buildGarmentSpec('shoes', height)];
}

export function normalizeHexColor(value: string): string {
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split('').map((part) => part + part).join('')}`.toLowerCase();
  }
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#fb7185';
}

export function shouldHideBaseCloth(materialName: string): boolean {
  return /(?:Onepiece|Accessory_Tie).*CLOTH/i.test(materialName);
}

export function shouldHideBaseShoes(materialName: string): boolean {
  return /Shoes.*CLOTH/i.test(materialName);
}

export function normalizeHairSettings(input: { color: string; length: number; volume: number }) {
  return {
    color: normalizeHexColor(input.color),
    length: Math.max(0.7, Math.min(1.6, Number(input.length) || 1)),
    volume: Math.max(0.7, Math.min(1.5, Number(input.volume) || 1)),
  };
}

/** Bone-fitted, recolorable parametric garments and hair controls. */
export class AvatarWardrobe {
  private model: THREE.Object3D | null = null;
  private vrm: VRM | null = null;
  private height = 1.6;
  private garments = new Map<string, THREE.Object3D[]>();
  private cleanMode = false;
  private safePieces: THREE.Object3D[] = [];
  private verifiedBody = false;
  private garmentCategories = new Map<string, GarmentCategory>();
  private clothingMaterials = new Map<THREE.Material, boolean>();
  private clothingShaderCallbacks = new Map<THREE.Material, { callback: THREE.Material['onBeforeCompile']; cacheKey: string }>();
  private textures = new Map<string, THREE.Texture>();
  private hairMaterials = new Map<THREE.Material, THREE.Color>();
  private hairMeshes = new Map<THREE.Object3D, THREE.Vector3>();

  attach(model: THREE.Object3D, vrm: VRM | null, height: number) {
    this.clearGarments();
    this.clearSafeGarments();
    this.model = model;
    this.vrm = vrm;
    this.height = Math.max(0.5, height);
    this.hairMaterials.clear();
    this.hairMeshes.clear();
    this.clothingMaterials.clear();
    this.garmentCategories.clear();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (/(?:Tops|Onepiece|Accessory_Tie|Shoes).*CLOTH/i.test(material.name) && !this.clothingMaterials.has(material)) {
          this.clothingMaterials.set(material, material.visible);
        }
      }
      const hair = /hair|kami|髪/i.test(`${object.name} ${materials.map((m) => m.name).join(' ')}`);
      if (!hair) return;
      this.hairMeshes.set(object, object.scale.clone());
      for (const material of materials) {
        if ('color' in material && material.color instanceof THREE.Color && !this.hairMaterials.has(material)) {
          this.hairMaterials.set(material, material.color.clone());
        }
      }
    });
    // Fail closed: only a model with recognizable original clothing/body
    // coverage may reveal a Clean stage. Unknown avatars stay behind the cover.
    this.verifiedBody = this.clothingMaterials.size > 0;
    if (this.cleanMode) this.setCleanMode(true);
  }

  applyGarment(garment: Pick<StudioGarment, 'id' | 'category' | 'color' | 'scale' | 'imageUrl'>) {
    if (!this.model) throw new Error('Load an avatar before adding clothes.');
    this.removeGarment(garment.id);
    this.garmentCategories.set(garment.id, garment.category);
    this.updateBaseClothingVisibility();
    const spec = buildGarmentSpec(garment.category, this.height);
    const texture = garment.imageUrl ? this.texture(garment.imageUrl) : null;
    if (texture) texture.repeat.setScalar(Math.max(0.25, Math.min(4, garment.scale || 1)));
    const material = new THREE.MeshStandardMaterial({
      color: normalizeHexColor(garment.color),
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.04,
    });
    const pieces = this.createPieces(spec, material, !this.cleanMode);
    this.garments.set(garment.id, pieces);
  }

  private createPieces(
    spec: ReturnType<typeof buildGarmentSpec>,
    material: THREE.Material,
    visible: boolean,
  ): THREE.Object3D[] {
    if (!this.model?.parent) throw new Error('The avatar scene is not ready.');
    const pieces: THREE.Object3D[] = [];
    for (const piece of spec.pieces) {
      const geometry = piece.shape === 'sphere'
        ? new THREE.SphereGeometry(0.5, 32, 20)
        : piece.shape === 'dress'
          ? new THREE.CylinderGeometry(0.38, 0.62, 1, 48, 1, false)
          : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 1, false);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.wardrobe = true;
      mesh.userData.safePresentation = visible && this.cleanMode;
      const bone = this.vrm?.humanoid.getNormalizedBoneNode(piece.bone) ?? this.model;
      this.model.parent.updateWorldMatrix(true, true);
      const worldPosition = bone.getWorldPosition(new THREE.Vector3());
      worldPosition.add(new THREE.Vector3(...piece.position));
      this.model.parent.add(mesh);
      mesh.position.copy(this.model.parent.worldToLocal(worldPosition.clone()));
      mesh.scale.set(...piece.scale);
      bone.attach(mesh);
      mesh.visible = visible;
      pieces.push(mesh);
    }
    return pieces;
  }

  /** Hide the private look and synchronously install a modest dress and shoes. */
  setCleanMode(enabled: boolean): boolean {
    this.cleanMode = enabled;
    if (!this.model) return false;
    if (enabled) {
      // Restore any Adult-mode torso-discard shaders before hiding base cloth,
      // or the base torso stays discarded in Clean too.
      for (const [material] of this.clothingMaterials) this.restoreMaterialShader(material);
      for (const pieces of this.garments.values()) pieces.forEach((piece) => { piece.visible = false; });
      for (const [material] of this.clothingMaterials) material.visible = false;
      if (!this.safePieces.length) {
        const colors = ['#334155', '#111827'];
        safeGarmentSpecs(this.height).forEach((spec, index) => {
          const material = new THREE.MeshStandardMaterial({
            color: colors[index], side: THREE.DoubleSide, roughness: 0.78, metalness: 0.02,
          });
          this.safePieces.push(...this.createPieces(spec, material, true));
        });
      }
      this.safePieces.forEach((piece) => { piece.visible = true; });
      return this.safeReady;
    }
    this.clearSafeGarments();
    for (const pieces of this.garments.values()) pieces.forEach((piece) => { piece.visible = true; });
    this.updateBaseClothingVisibility();
    return true;
  }

  get safeReady(): boolean {
    return this.cleanMode && this.verifiedBody && this.safePieces.length === 3 && this.safePieces.every((piece) => piece.visible);
  }

  private clearSafeGarments() {
    for (const piece of this.safePieces) {
      piece.parent?.remove(piece);
      if (piece instanceof THREE.Mesh) {
        piece.geometry.dispose();
        const materials = Array.isArray(piece.material) ? piece.material : [piece.material];
        materials.forEach((material) => material.dispose());
      }
    }
    this.safePieces = [];
  }

  private updateBaseClothingVisibility() {
    if (this.cleanMode) {
      for (const [material] of this.clothingMaterials) material.visible = false;
      return;
    }
    const hasReplacement = [...this.garmentCategories.values()].some((category) => !['hat', 'dress'].includes(category));
    const hasShoes = [...this.garmentCategories.values()].includes('shoes');
    for (const [material, original] of this.clothingMaterials) {
      const hideOriginal = (hasReplacement && shouldHideBaseCloth(material.name)) || (hasShoes && shouldHideBaseShoes(material.name));
      material.visible = hideOriginal ? false : original;
      if (!/Tops.*CLOTH/i.test(material.name)) continue;
      if (hasReplacement) this.installTorsoDiscard(material);
      else this.restoreMaterialShader(material);
    }
  }

  private installTorsoDiscard(material: THREE.Material) {
    if (!this.clothingShaderCallbacks.has(material)) {
      this.clothingShaderCallbacks.set(material, {
        callback: material.onBeforeCompile,
        cacheKey: material.customProgramCacheKey(),
      });
    }
    const halfWidth = this.height * 0.16;
    const lower = this.height * 0.40;
    const upper = this.height * 0.70;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 vStudioWorldPosition;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvStudioWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
      shader.fragmentShader = `varying vec3 vStudioWorldPosition;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>\nif (abs(vStudioWorldPosition.x) < ${halfWidth.toFixed(4)} && vStudioWorldPosition.y > ${lower.toFixed(4)} && vStudioWorldPosition.y < ${upper.toFixed(4)}) discard;`,
      );
    };
    material.customProgramCacheKey = () => 'studio-torso-discard';
    material.needsUpdate = true;
  }

  private restoreMaterialShader(material: THREE.Material) {
    const original = this.clothingShaderCallbacks.get(material);
    if (!original) return;
    material.onBeforeCompile = original.callback;
    material.customProgramCacheKey = () => original.cacheKey;
    material.needsUpdate = true;
  }

  private texture(url: string): THREE.Texture {
    const existing = this.textures.get(url);
    if (existing) return existing;
    const texture = new THREE.TextureLoader().load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    this.textures.set(url, texture);
    return texture;
  }

  setHair(settings: { color: string; length: number; volume: number }) {
    const hair = normalizeHairSettings(settings);
    for (const [material] of this.hairMaterials) {
      if ('color' in material && material.color instanceof THREE.Color) material.color.set(hair.color);
      if ('map' in material) {
        (material as THREE.MeshStandardMaterial).map = null;
        material.needsUpdate = true;
      }
    }
    for (const [mesh, original] of this.hairMeshes) {
      mesh.scale.set(original.x * hair.volume, original.y * hair.length, original.z * hair.volume);
    }
  }

  removeGarment(id: string) {
    const pieces = this.garments.get(id) ?? [];
    for (const piece of pieces) {
      piece.parent?.remove(piece);
      if (piece instanceof THREE.Mesh) {
        piece.geometry.dispose();
        const materials = Array.isArray(piece.material) ? piece.material : [piece.material];
        materials.forEach((material) => material.dispose());
      }
    }
    this.garments.delete(id);
    this.garmentCategories.delete(id);
    this.updateBaseClothingVisibility();
  }

  clearGarments() {
    for (const id of [...this.garments.keys()]) this.removeGarment(id);
  }

  dispose() {
    this.clearGarments();
    this.clearSafeGarments();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.hairMaterials.clear();
    this.hairMeshes.clear();
    this.clothingMaterials.clear();
    this.garmentCategories.clear();
    this.clothingShaderCallbacks.clear();
  }
}
