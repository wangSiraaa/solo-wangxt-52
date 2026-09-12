import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ProductRecord } from '../db';
import { SEED_PRODUCTS } from '../data/catalog';
import type { Product } from '../types';

/** 合并代码内置的虚构销售规则与 IndexedDB 中的本地库存/停售状态。 */
export function useProductMap(): Map<string, Product> {
  const records = useLiveQuery<ProductRecord[]>(() => db.products.toArray(), []);
  return useMemo(() => {
    const recMap = new Map((records ?? []).map((r) => [r.sku, r]));
    return new Map(
      SEED_PRODUCTS.map((p) => {
        const r = recMap.get(p.sku);
        const merged: Product = r
          ? { ...p, baseStock: r.baseStock, promoQuota: r.promoQuota, active: r.active }
          : p;
        return [p.sku, merged];
      }),
    );
  }, [records]);
}

export function makeLineId(): string {
  return `ln-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
