import { db } from '../db';
import type { DraftLine, LineEvaluation, Reservation } from '../types';

/**
 * 预占模型：
 * - 加入清单（有效/待确认行）即按行在事务中预占：baseUnits 计物理库存，promoUnits 计促销库存。
 * - 移除行 / 行失效（区域禁售等）=> 下一次同步删除对应预占，立即释放。
 * - 预占按会话（标签页）隔离；资格校验读取「其他会话」的预占，实现多标签页争用。
 * - 会话心跳超时（STALE_MS）视为崩溃，其预占被清理释放。
 */

const STALE_MS = 15_000;

export function newSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function heartbeat(sessionId: string): Promise<void> {
  await db.sessions.put({
    id: sessionId,
    name: `标签页 ${sessionId.slice(2, 6)}`,
    heartbeatAt: Date.now(),
  });
}

/** 删除过期会话及其预占（崩溃标签页的库存兜底释放）。 */
export async function cleanupStale(): Promise<void> {
  const cutoff = Date.now() - STALE_MS;
  const staleIds = await db.sessions.where('heartbeatAt').below(cutoff).primaryKeys();
  if (staleIds.length === 0) return;
  await db.transaction('rw', db.sessions, db.reservations, async () => {
    const ids = await db.sessions.where('heartbeatAt').below(cutoff).primaryKeys();
    if (ids.length === 0) return;
    await db.reservations.where('sessionId').anyOf(ids).delete();
    await db.sessions.bulkDelete(ids);
  });
}

export interface ReserveTotal {
  base: number;
  promo: number;
}

/** 其他标签页（会话）已预占量，按 SKU 汇总；不同草稿的标签页争用同一门店库存。 */
export async function getExternalReserves(sessionId: string): Promise<Map<string, ReserveTotal>> {
  await cleanupStale();
  const rows = await db.reservations.where('sessionId').notEqual(sessionId).toArray();
  const map = new Map<string, ReserveTotal>();
  for (const r of rows) {
    const cur = map.get(r.sku) ?? { base: 0, promo: 0 };
    cur.base += r.baseUnits;
    cur.promo += r.promoUnits;
    map.set(r.sku, cur);
  }
  return map;
}

/** 全部预占（含本标签页），用于货架余量展示。 */
export async function getAllReserves(): Promise<Map<string, ReserveTotal>> {
  await cleanupStale();
  const rows = await db.reservations.toArray();
  const map = new Map<string, ReserveTotal>();
  for (const r of rows) {
    const cur = map.get(r.sku) ?? { base: 0, promo: 0 };
    cur.base += r.baseUnits;
    cur.promo += r.promoUnits;
    map.set(r.sku, cur);
  }
  return map;
}

interface BillableLine {
  line: DraftLine;
  ev: LineEvaluation;
}

/**
 * 把本标签页对某草稿的预占与最新资格评估对齐。
 * 失效行不预占；待确认行仍预占（库存为农户保留，确认后可直接成交）。
 */
export async function syncReservations(
  sessionId: string,
  draftId: string,
  billable: BillableLine[],
): Promise<void> {
  await heartbeat(sessionId);
  const desired = new Map<string, Reservation>();
  for (const { line, ev } of billable) {
    if (ev.status === 'invalid' || !Number.isFinite(ev.baseUnits) || ev.baseUnits <= 0) continue;
    const key = `${draftId}::${line.id}::${ev.sku}`;
    desired.set(key, {
      key,
      sessionId,
      sku: ev.sku,
      draftId,
      baseUnits: ev.baseUnits,
      promoUnits: ev.promoUnits,
      updatedAt: Date.now(),
    });
  }

  await db.transaction('rw', db.reservations, db.sessions, async () => {
    const mine = await db.reservations.where('sessionId').equals(sessionId).toArray();
    const staleKeys = mine.map((r) => r.key).filter((k) => !desired.has(k) && k.startsWith(`${draftId}::`));
    if (staleKeys.length) await db.reservations.bulkDelete(staleKeys);
    if (desired.size) await db.reservations.bulkPut([...desired.values()]);
  });
}

/** 切走或关闭前释放本草稿在本会话的全部预占。 */
export async function releaseDraft(sessionId: string, draftId: string): Promise<void> {
  const mine = await db.reservations.where('sessionId').equals(sessionId).toArray();
  const keys = mine.filter((r) => r.draftId === draftId).map((r) => r.key);
  if (keys.length) await db.reservations.bulkDelete(keys);
}

export async function activeSessions(): Promise<{ id: string; name: string; heartbeatAt: number }[]> {
  await cleanupStale();
  return db.sessions.orderBy('heartbeatAt').reverse().toArray();
}
