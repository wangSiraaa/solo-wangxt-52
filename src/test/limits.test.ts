import { describe, expect, it } from 'vitest';
import { evaluateDraft } from '../lib/eligibility';
import { makeCtx, makeLine, products } from './helpers';

describe('限购汇总：拆行不能绕过', () => {
  it('同一 SKU 拆成多行、跨包装，汇总超过限购仍全部判超限', () => {
    // P004 限购 40 袋：3 个中包(15) + 25 袋 = 40，不超
    const ok = evaluateDraft(
      [makeLine('P004', 3, 'bag5', 'a'), makeLine('P004', 25, 'bag', 'b')],
      products,
      makeCtx({ crop: '玉米' }),
    );
    expect(ok.every((e) => e.status !== 'invalid')).toBe(true);
    expect(ok[0].totalForSku).toBe(40);

    // 再拆一行 1 袋 => 41 > 40，所有同 SKU 行都标 LIMIT_EXCEEDED
    const over = evaluateDraft(
      [makeLine('P004', 3, 'bag5', 'a'), makeLine('P004', 25, 'bag', 'b'), makeLine('P004', 1, 'bag', 'c')],
      products,
      makeCtx({ crop: '玉米' }),
    );
    expect(over).toHaveLength(3);
    for (const ev of over) {
      expect(ev.status).toBe('invalid');
      expect(ev.reasons.map((r) => r.code)).toContain('LIMIT_EXCEEDED');
    }
  });

  it('限购按农户维度（整单），与包装无关：箱装拆行同样被拦', () => {
    // P001 限购 60 瓶：2 箱(40) + 21 瓶 = 61
    const over = evaluateDraft(
      [makeLine('P001', 2, 'box', 'a'), makeLine('P001', 21, 'bottle', 'b')],
      products,
      makeCtx({ crop: '小麦' }),
    );
    for (const ev of over) {
      expect(ev.reasons.map((r) => r.code)).toContain('LIMIT_EXCEEDED');
    }
  });

  it('物理库存不足 => OUT_OF_STOCK；其他标签页预占计入占用', () => {
    // P004 物理库存 40：本单要 40 袋，另一标签页已预占 5 袋
    const ev = evaluateDraft(
      [makeLine('P004', 40, 'bag', 'a')],
      products,
      makeCtx({ crop: '玉米', external: new Map([['P004', { base: 5, promo: 5 }]]) }),
    );
    expect(ev[0].status).toBe('invalid');
    expect(ev[0].reasons.map((r) => r.code)).toContain('OUT_OF_STOCK');
  });
});

describe('互斥组', () => {
  it('同一互斥组两个不同 SKU 同单 => 两行均失效', () => {
    const ev = evaluateDraft(
      [makeLine('P001', 1, 'bottle', 'a'), makeLine('P002', 1, 'bag', 'b')],
      products,
      makeCtx({ crop: '小麦' }),
    );
    expect(ev[0].reasons.map((r) => r.code)).toContain('MUTEX_CONFLICT');
    expect(ev[1].reasons.map((r) => r.code)).toContain('MUTEX_CONFLICT');
  });

  it('同一 SKU 拆行不误判互斥', () => {
    const ev = evaluateDraft(
      [makeLine('P001', 1, 'bottle', 'a'), makeLine('P001', 2, 'bottle', 'b')],
      products,
      makeCtx({ crop: '小麦' }),
    );
    expect(ev.every((e) => !e.reasons.some((r) => r.code === 'MUTEX_CONFLICT'))).toBe(true);
  });
});
