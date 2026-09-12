import { SEED_PRODUCTS } from '../data/catalog';
import type { EligibilityContext } from '../lib/eligibility';
import type { DraftLine, Product } from '../types';

export const products = new Map<string, Product>(SEED_PRODUCTS.map((p) => [p.sku, p]));

export function makeCtx(overrides: Partial<EligibilityContext> = {}): EligibilityContext {
  return {
    region: 'NORTH_PLAIN',
    crop: '小麦',
    external: new Map(),
    promoQuota: new Map(),
    baseStock: new Map(),
    ...overrides,
  };
}

export function makeLine(sku: string, packs: number, packId = 'bag', id?: string): DraftLine {
  return { id: id ?? `l-${sku}-${packs}-${packId}-${Math.random().toString(36).slice(2, 6)}`, sku, packId, packs };
}
