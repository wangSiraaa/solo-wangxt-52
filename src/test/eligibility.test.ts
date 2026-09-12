import { describe, expect, it } from 'vitest';
import { SEED_PRODUCTS } from '../data/catalog';
import { evaluateDraft } from '../lib/eligibility';
import { makeCtx, makeLine, products } from './helpers';

describe('资格校验：区域 / 作物 / 停用 / 未知编号 / 包装', () => {
  it('区域禁售 => invalid；作物不匹配 => pending', () => {
    const ev1 = evaluateDraft([makeLine('F002', 1)], products, makeCtx({ region: 'WEST_PLATEAU', crop: '番茄' }));
    expect(ev1[0].status).toBe('invalid');
    expect(ev1[0].reasons.map((r) => r.code)).toContain('REGION_FORBIDDEN');

    // F001 通用肥（crops 为空）在任何作物下均有效
    const ev2 = evaluateDraft([makeLine('F001', 2)], products, makeCtx({ crop: '番茄' }));
    expect(ev2[0].status).toBe('valid');

    // F002 适用番茄/玉米；切到小麦 => 待确认
    const ev3 = evaluateDraft([makeLine('F002', 2)], products, makeCtx({ crop: '小麦' }));
    expect(ev3[0].status).toBe('pending');
    expect(ev3[0].reasons.map((r) => r.code)).toContain('CROP_UNSUITABLE');
  });

  it('区域切换使部分商品失效，另一些仍有效（不清空、不删除行）', () => {
    const lines = [makeLine('P001', 1, 'bottle'), makeLine('F001', 1), makeLine('S001', 1)];
    // 北方平原：S001 禁售；P001 适用水稻；F001 通用
    const north = evaluateDraft(lines, products, makeCtx({ region: 'NORTH_PLAIN', crop: '水稻' }));
    expect(north.map((e) => e.status)).toEqual(['valid', 'valid', 'invalid']);

    // 切到西部高原：P001 禁售高原；S001 仅禁售北方，高原有效
    const west = evaluateDraft(lines, products, makeCtx({ region: 'WEST_PLATEAU', crop: '水稻' }));
    expect(west[0].status).toBe('invalid');
    expect(west[1].status).toBe('valid');
    expect(west[2].status).toBe('valid');
  });

  it('停售商品与未知编号失效', () => {
    const ev = evaluateDraft(
      [makeLine('F003', 1), makeLine('ZZZ', 1)],
      products,
      makeCtx(),
    );
    expect(ev[0].reasons.map((r) => r.code)).toContain('PRODUCT_INACTIVE');
    expect(ev[1].reasons.map((r) => r.code)).toContain('UNKNOWN_SKU');
  });

  it('跨包装规格：包装 id 变化/失效 => BAD_PACK，基础单位按 factor 换算', () => {
    const p002 = SEED_PRODUCTS.find((p) => p.sku === 'P002')!;
    expect(p002.packs.map((p) => p.id)).toEqual(['bag', 'bag5', 'box']);

    // 1 箱 = 20 袋
    const ev = evaluateDraft([makeLine('P002', 1, 'box')], products, makeCtx({ crop: '小麦' }));
    expect(ev[0].baseUnits).toBe(20);

    // 3 个中包 = 15 袋
    const ev2 = evaluateDraft([makeLine('P002', 3, 'bag5')], products, makeCtx({ crop: '小麦' }));
    expect(ev2[0].baseUnits).toBe(15);

    // 已删除的包装
    const ev3 = evaluateDraft([makeLine('P002', 1, 'carton99')], products, makeCtx({ crop: '小麦' }));
    expect(ev3[0].status).toBe('invalid');
    expect(ev3[0].reasons.map((r) => r.code)).toContain('BAD_PACK');
  });
});
