import { describe, expect, it } from 'vitest';
import { evaluateDraft } from '../lib/eligibility';
import { makeCtx, makeLine, products } from './helpers';

describe('促销库存预占：多标签页争用', () => {
  it('其他标签页预占促销库存后，本行促销数量被削减，溢出部分待确认', () => {
    // F001 促销库存 80 袋，另一标签页预占促销 50、基础 50
    const ev = evaluateDraft(
      [makeLine('F001', 40, 'bag', 'a')],
      products,
      makeCtx({ external: new Map([['F001', { base: 50, promo: 50 }]]) }),
    );
    // 基础库存 800 充足，不失效；促销只剩 30
    expect(ev[0].status).toBe('pending');
    expect(ev[0].promoUnits).toBe(30);
    expect(ev[0].reasons.map((r) => r.code)).toContain('PROMO_OVERFLOW');
  });

  it('外部预占把促销库存吃光时，本行全部按阶梯价（仍待确认并解释）', () => {
    const ev = evaluateDraft(
      [makeLine('F001', 10, 'bag', 'a')],
      products,
      makeCtx({ external: new Map([['F001', { base: 0, promo: 80 }]]) }),
    );
    expect(ev[0].promoUnits).toBe(0);
    expect(ev[0].status).toBe('pending');
  });

  it('促销数量在本单多行之间按行序分配，不重复占用', () => {
    const ev = evaluateDraft(
      [makeLine('F001', 50, 'bag', 'a'), makeLine('F001', 50, 'bag', 'b')],
      products,
      makeCtx(),
    );
    expect(ev[0].promoUnits).toBe(50);
    expect(ev[1].promoUnits).toBe(30);
    expect(ev[1].reasons.map((r) => r.code)).toContain('PROMO_OVERFLOW');
  });

  it('本地库存表下调促销库存后按新值计算（规则在本地，可离线调整）', () => {
    const ev = evaluateDraft(
      [makeLine('F001', 20, 'bag', 'a')],
      products,
      makeCtx({ promoQuota: new Map([['F001', 10]]) }),
    );
    expect(ev[0].promoUnits).toBe(10);
    expect(ev[0].status).toBe('pending');
  });
});
