import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetAllData } from '../db';
import {
  cleanupStale,
  getExternalReserves,
  newSessionId,
  releaseDraft,
  syncReservations,
} from '../lib/reservations';
import { evaluateDraft } from '../lib/eligibility';
import { makeCtx, makeLine, products } from './helpers';

beforeEach(async () => {
  await resetAllData();
});

describe('预占：加入预占、移除释放、跨标签页争用', () => {
  it('同步后预占写入，移除行再同步即释放', async () => {
    const s1 = newSessionId();
    const lineA = makeLine('F001', 10, 'bag', 'a');
    let ev = evaluateDraft([lineA], products, makeCtx());
    await syncReservations(s1, 'draft-1', [{ line: lineA, ev: ev[0] }]);
    const rows = await db.reservations.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: 'F001', baseUnits: 10, promoUnits: 10 });

    // 移除行后同步 => 预占删除（释放）
    ev = evaluateDraft([], products, makeCtx());
    await syncReservations(s1, 'draft-1', []);
    expect(await db.reservations.count()).toBe(0);
  });

  it('失效行不预占；恢复有效后重新预占', async () => {
    const s1 = newSessionId();
    // S001 在北方禁售
    const l = makeLine('S001', 5, 'bag', 's');
    const evNorth = evaluateDraft([l], products, makeCtx({ region: 'NORTH_PLAIN', crop: '水稻' }));
    await syncReservations(s1, 'd1', [{ line: l, ev: evNorth[0] }]);
    expect(await db.reservations.count()).toBe(0);

    const evSouth = evaluateDraft([l], products, makeCtx({ region: 'SOUTH_HILL', crop: '水稻' }));
    await syncReservations(s1, 'd1', [{ line: l, ev: evSouth[0] }]);
    expect(await db.reservations.count()).toBe(1);
  });

  it('标签页 B 看到标签页 A 的预占，促销库存被削减', async () => {
    const a = newSessionId();
    const lineA = makeLine('F001', 50, 'bag', 'a');
    const evA = evaluateDraft([lineA], products, makeCtx());
    await syncReservations(a, 'dA', [{ line: lineA, ev: evA[0] }]);

    const b = newSessionId();
    const external = await getExternalReserves(b);
    expect(external.get('F001')?.promo).toBe(50);

    const lineB = makeLine('F001', 40, 'bag', 'b');
    const evB = evaluateDraft([lineB], products, makeCtx({ external }));
    expect(evB[0].promoUnits).toBe(30);
    expect(evB[0].reasons.map((r) => r.code)).toContain('PROMO_OVERFLOW');

    // A 释放后，B 重新评估恢复 40 促销
    await releaseDraft(a, 'dA');
    const externalAfter = await getExternalReserves(b);
    const evB2 = evaluateDraft([lineB], products, makeCtx({ external: externalAfter }));
    expect(evB2[0].promoUnits).toBe(40);
    expect(evB2[0].status).toBe('valid');
  });

  it('崩溃标签页心跳过期后预占被兜底释放', async () => {
    const a = newSessionId();
    const l = makeLine('F001', 5, 'bag', 'a');
    const ev = evaluateDraft([l], products, makeCtx());
    await syncReservations(a, 'dA', [{ line: l, ev: ev[0] }]);
    // 会话心跳回拨到 30 秒前
    await db.sessions.update(a, { heartbeatAt: Date.now() - 30_000 });
    await cleanupStale();
    expect(await db.reservations.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
  });
});
