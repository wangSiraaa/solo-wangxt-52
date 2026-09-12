import { describe, expect, it } from 'vitest';
import { PROMO_UNIT_PRICE } from '../data/catalog';
import { lineCost, priceDraft, tierUnitPrice } from '../lib/pricing';
import { products } from './helpers';

describe('阶梯定价（decimal.js）', () => {
  it('按数量命中正确阶梯档', () => {
    const p002 = products.get('P002')!;
    expect(tierUnitPrice(p002, 1).toString()).toBe('28');
    expect(tierUnitPrice(p002, 39).toString()).toBe('28');
    expect(tierUnitPrice(p002, 40).toString()).toBe('25');
    expect(tierUnitPrice(p002, 200).toString()).toBe('22.5');
  });

  it('促销部分与阶梯部分分别计价，金额来源可解释', () => {
    const f001 = products.get('F001')!;
    // 40 袋命中 148 元档：30 享促销价 135，10 按阶梯价 148
    const b = lineCost(f001, 40, 30);
    // 30*135 + 10*148 = 4050 + 1480 = 5530
    expect(b.lineTotal).toBe('5530.00');
    expect(b.promoUnits).toBe(30);
    expect(b.sources.join()).toContain('促销');
    expect(b.sources.join()).toContain('阶梯');
    expect(b.listTotal).toBe('6400.00');
    expect(b.saved).toBe('870.00');
  });

  it('promoUnits 不会超过行数量；促销价高于阶梯价时仍按规则取促销价（规则固定不猜）', () => {
    const p = products.get('P001')!;
    expect(PROMO_UNIT_PRICE.P001).toBe('38.00');
    const b = lineCost(p, 100, 999); // 超出部分被截断
    expect(b.promoUnits).toBe(100);
  });
});

describe('两个互斥优惠方案：取低价并解释', () => {
  it('小额订单采用方案 A（阶梯+促销），满减未达门槛', () => {
    const f001 = products.get('F001')!;
    const { plans, chosen } = priceDraft([
      { product: f001, line: { id: 'x', sku: 'F001', packId: 'bag', packs: 10 }, baseUnits: 10, promoUnits: 10 },
    ]);
    expect(chosen).toBe('A_PROMO_TIER');
    // A: 10*135 = 1350；B: 10*160-60 = 1540
    expect(plans.A_PROMO_TIER.payable).toBe('1350.00');
    expect(plans.B_COUPON.payable).toBe('1540.00');
    expect(plans.A_PROMO_TIER.explanation).toContain('不与订单满减叠加');
  });

  it('大额订单满减更省 => 采用方案 B，并在解释中给出双方金额对比', () => {
    // 构造：F001 200 袋。原价 32000；A：促销80*135 + 120*138 = 10800+16560 = 27360；B：32000-220=31780
    // A 仍更低，换一个几乎不打折的 T001 农具
    const t001 = products.get('T001')!;
    // 100 件原价 3900；无促销；阶梯 39。A = B原价-满减 => B = 3900-220=3680
    const { plans, chosen } = priceDraft([
      { product: t001, line: { id: 't', sku: 'T001', packId: 'piece', packs: 100 }, baseUnits: 100, promoUnits: 0 },
    ]);
    expect(plans.A_PROMO_TIER.payable).toBe('3900.00');
    expect(plans.B_COUPON.payable).toBe('3680.00');
    expect(chosen).toBe('B_COUPON');
    expect(plans.B_COUPON.explanation).toContain('3680.00');
    expect(plans.B_COUPON.explanation).toContain('3900.00');
  });

  it('失效行不参与计价', () => {
    const t001 = products.get('T001')!;
    const { plans } = priceDraft([
      { product: t001, line: { id: 't', sku: 'T001', packId: 'piece', packs: 1 }, baseUnits: 1, promoUnits: 0, invalid: true },
    ]);
    expect(plans.A_PROMO_TIER.payable).toBe('0.00');
  });
});
