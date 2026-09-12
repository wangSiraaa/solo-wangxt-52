import Dexie, { type Table } from 'dexie';
import { SEED_PRODUCTS } from './data/catalog';
import type { Draft, Reservation, Session } from './types';

/** 本地库存（基础单位）与停售状态可在门店端调整；其余销售规则随代码版本走。 */
export interface ProductRecord {
  sku: string;
  baseStock: number;
  promoQuota: number;
  active: boolean;
  updatedAt: number;
}

export interface DraftRecord {
  id: string;
  name: string;
  draft: Draft;
  updatedAt: number;
}

class AppDB extends Dexie {
  products!: Table<ProductRecord, string>;
  drafts!: Table<DraftRecord, string>;
  reservations!: Table<Reservation, string>;
  sessions!: Table<Session, string>;

  constructor() {
    super('nongzi-order-desk');
    this.version(1).stores({
      products: 'sku, active',
      drafts: 'id, name, updatedAt',
      reservations: 'key, sku, sessionId, draftId',
      sessions: 'id, heartbeatAt',
    });
  }
}

export const db = new AppDB();

const SEEDED_KEY = 'seeded.v1';

/** 首次运行写入虚构库存；不覆盖门店之后调整过的库存数据。 */
export async function seedProductsIfNeeded(): Promise<void> {
  if (localStorage.getItem(SEEDED_KEY)) return;
  await db.transaction('rw', db.products, async () => {
    const existing = await db.products.count();
    if (existing > 0) return;
    const now = Date.now();
    await db.products.bulkAdd(
      SEED_PRODUCTS.map((p) => ({
        sku: p.sku,
        baseStock: p.baseStock,
        promoQuota: p.promoQuota,
        active: p.active,
        updatedAt: now,
      })),
    );
  });
  localStorage.setItem(SEEDED_KEY, '1');
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', db.products, db.drafts, db.reservations, db.sessions, async () => {
    await db.drafts.clear();
    await db.reservations.clear();
    await db.sessions.clear();
    await db.products.clear();
  });
  localStorage.removeItem(SEEDED_KEY);
  await seedProductsIfNeeded();
}
