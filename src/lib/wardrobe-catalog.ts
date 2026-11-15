import type { GarmentCategory } from './studio-types.js';

export interface WardrobePick {
  id: string;
  name: string;
  category: GarmentCategory;
  color: string;
  lane: 'sfw' | 'nsfw';
  shopUrl: string;
  shopLabel: string;
}

/** Public marketplace search. No affiliate code is attached. */
export const WARDROBE_SHOP_URL = 'https://booth.pm/en/search/3D%20clothing';

const shop = { shopUrl: WARDROBE_SHOP_URL, shopLabel: 'Browse similar on BOOTH' };

/** Original closet. Not store art, and not another platform's skins. */
export const WARDROBE_CATALOG: WardrobePick[] = [
  { id: 'garment-turtleneck', name: 'Cyan turtleneck', category: 'top', color: '#22c1e8', lane: 'sfw', ...shop },
  { id: 'garment-crew', name: 'Black crew tee', category: 'top', color: '#161616', lane: 'sfw', ...shop },
  { id: 'garment-oxford', name: 'White oxford', category: 'top', color: '#f4f4f4', lane: 'sfw', ...shop },
  { id: 'garment-hoodie', name: 'Navy hoodie', category: 'top', color: '#1e3a5f', lane: 'sfw', ...shop },
  { id: 'garment-denim', name: 'Indigo jacket', category: 'top', color: '#355c8a', lane: 'sfw', ...shop },
  { id: 'garment-dress', name: 'Clean day dress', category: 'dress', color: '#334155', lane: 'sfw', ...shop },
  { id: 'garment-hat', name: 'Midnight cap', category: 'hat', color: '#24101f', lane: 'sfw', ...shop },
  { id: 'garment-sneakers', name: 'White court sneakers', category: 'shoes', color: '#f8fafc', lane: 'sfw', ...shop },
  { id: 'garment-shoes', name: 'Black ankle boots', category: 'shoes', color: '#24101f', lane: 'sfw', ...shop },
  { id: 'garment-bikini', name: 'Scarlet bikini', category: 'bikini', color: '#e11d48', lane: 'nsfw', ...shop },
  { id: 'garment-wine', name: 'Wine two-piece', category: 'bikini', color: '#7f1d1d', lane: 'nsfw', ...shop },
  { id: 'garment-underwear', name: 'Rose underwear', category: 'underwear', color: '#fb7185', lane: 'nsfw', ...shop },
  { id: 'garment-black-set', name: 'Black set', category: 'underwear', color: '#111111', lane: 'nsfw', ...shop },
];

export function wardrobePicks(lane: 'sfw' | 'nsfw' | 'all' = 'all'): WardrobePick[] {
  return WARDROBE_CATALOG.filter((item) => lane === 'all' || item.lane === lane);
}
