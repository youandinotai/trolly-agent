export type GarmentCategory = 'hat' | 'top' | 'dress' | 'bikini' | 'underwear' | 'shoes';

export interface StudioGarment {
  id: string;
  name: string;
  category: GarmentCategory;
  color: string;
  scale: number;
  imageUrl?: string;
}

export interface StudioScene {
  id: string;
  name: string;
  background: string;
  accent: string;
  lightIntensity: number;
  imageUrl?: string;
}

export interface StudioActor {
  id: string;
  name: string;
  role: 'actor' | 'actress';
  modelPath: string;
  hair: { color: string; length: number; volume: number };
  smile: number;
  garmentIds: string[];
  sceneId: string;
}

export interface StudioDoc {
  actors: StudioActor[];
  garments: StudioGarment[];
  scenes: StudioScene[];
  activeActorId: string | null;
}

export type NewGarment = Omit<StudioGarment, 'id'> & { id?: string };
export type NewScene = Omit<StudioScene, 'id'> & { id?: string };
export type NewActor = Omit<StudioActor, 'id'> & { id?: string };
