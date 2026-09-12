import Decimal from 'decimal.js';
import { COUPON_TIERS, PROMO_UNIT_PRICE } from '../data/catalog';
import type { DraftLine, Product } from '../types';
import { d, toMoney } from './money';

/** 某数量（基础单位）适用的阶梯单价：取 minQty <= qty 的最高档。 */
export function tierUnitPrice(product: Product, qty: number): Decimal {
  let price = d(product.tiers[0].unitPrice);
  for (const tier of product.tiers) {
    if (qty >= tier.minQty) price = d(tier.unitPrice);
  }
  return price;
}

export interface LineCostBreakdown {
  /** 阶梯单价（该行总量所在档位）。 */
  tierPrice: string;
  tierLabel: string;
  /** 其中可享促销价的数量。 */
  promoUnits: number;
  promoPrice: string | null;
  /** 原价合计（第 1 档单价 × 数量），仅用于展示节省。 */
  listTotal: string;
  /** 行金额 = 促销部分按促销价 + 其余按阶梯价。 */
  lineTotal: string;
  /** 相对原价节省。 */
  saved: string;
  sources: string[];
}

/**
 * 单行成本（方案 A：单品阶梯 + 促销库存价）。
 * promoUnits 由资格校验/预占结果传入，不允许超过促销库存。
 */
export function lineCost(product: Product, baseUnits: number, promoUnits: number): LineCostBreakdown {
  const listPrice = d(product.tiers[0].unitPrice);
  const tierPrice = tierUnitPrice(product, baseUnits);
  const promoPriceStr = PROMO_UNIT_PRICE[product.sku] ?? null;
  const usedPromo = Math.max(0, Math.min(promoUnits, baseUnits));
  const promoPrice = promoPriceStr ? d(promoPriceStr) : null;

  let total = tierPrice.mul(baseUnits - usedPromo);
  if (promoPrice) total = total.plus(promoPrice.mul(usedPromo));

  const tier = [...product.tiers].reverse().find((t) => baseUnits >= t.minQty)!;
  const sources = [
    usedPromo > 0
      ? `${usedPromo} 个基础单位按促销价 ${toMoney(promoPrice!)}（促销库存预占）`
      : null,
    baseUnits - usedPromo > 0
      ? `${baseUnits - usedPromo} 个按阶梯价 ${toMoney(tierPrice)}（达到 ${tier.minQty} 件档）`
      : null,
  ].filter((s): s is string => s !== null);

  const listTotal = listPrice.mul(baseUnits);
  return {
    tierPrice: toMoney(tierPrice),
    tierLabel: `满 ${tier.minQty} 件 ${toMoney(tierPrice)} 元/件`,
    promoUnits: usedPromo,
    promoPrice: promoPriceStr,
    listTotal: toMoney(listTotal),
    lineTotal: toMoney(total),
    saved: toMoney(listTotal.minus(total)),
    sources,
  };
}

export type PlanId = 'A_PROMO_TIER' | 'B_COUPON';

export interface PricingPlan {
  id: PlanId;
  label: string;
  /** 应付合计。 */
  payable: string;
  /** 相对全部按原价的节省。 */
  saved: string;
  explanation: string;
}

export interface LinePriceInput {
  product: Product;
  line: DraftLine;
  baseUnits: number;
  promoUnits: number;
  invalid?: boolean;
}

/** 计算整张清单的两个互斥方案并选定较优者；优惠不可叠加，选择依据会写入 explanation。 */
export function priceDraft(inputs: LinePriceInput[]): {
  plans: Record<PlanId, PricingPlan>;
  chosen: PlanId;
  listTotal: string;
  /** 仅统计有效/待确认行；失效行不参与计价。 */
  billable: LinePriceInput[];
} {
  const billable = inputs.filter((i) => !i.invalid);
  const breakdowns = billable.map((i) => lineCost(i.product, i.baseUnits, i.promoUnits));

  const listTotal = breakdowns.reduce((acc, b) => d(acc).plus(b.listTotal), d(0));
  const planATotal = breakdowns.reduce((acc, b) => d(acc).plus(b.lineTotal), d(0));

  const planA: PricingPlan = {
    id: 'A_PROMO_TIER',
    label: '方案 A：单品阶梯价 + 促销库存价',
    payable: toMoney(planATotal),
    saved: toMoney(listTotal.minus(planATotal)),
    explanation:
      '每行先按总量匹配阶梯单价，促销库存内的部分按促销价；不与订单满减叠加。',
  };

  // 方案 B：全部按原价（不享单品促销/阶梯），只享订单满减。
  let coupon = d(0);
  let couponLabel = '未达满减门槛';
  for (const t of COUPON_TIERS) {
    if (listTotal.gte(t.threshold)) {
      coupon = d(t.discount);
      couponLabel = t.label;
    }
  }
  const planBTotal = listTotal.minus(coupon);
  const planB: PricingPlan = {
    id: 'B_COUPON',
    label: '方案 B：全部原价 + 订单满减',
    payable: toMoney(planBTotal),
    saved: toMoney(coupon),
    explanation: `放弃单品阶梯与促销价，全部按原价 ${toMoney(listTotal)} 元，套用${couponLabel}；满减与单品优惠互斥。`,
  };

  // 取应付更低者；相等时优先方案 A（商家促销库存优先出清），并明确说明。
  const chosen: PlanId = planBTotal.lt(planATotal) ? 'B_COUPON' : 'A_PROMO_TIER';
  if (chosen === 'A_PROMO_TIER') {
    const tie = planBTotal.eq(planATotal);
    planA.explanation += tie
      ? ` 两方案应付相同（${toMoney(planATotal)} 元），按规则默认采用方案 A。`
      : ` 方案 A 应付 ${toMoney(planATotal)} 元，低于方案 B 的 ${toMoney(planBTotal)} 元，故采用 A。`;
  } else {
    planB.explanation += ` 方案 B 应付 ${toMoney(planBTotal)} 元，低于方案 A 的 ${toMoney(planATotal)} 元，故采用 B。`;
  }

  return { plans: { A_PROMO_TIER: planA, B_COUPON: planB }, chosen, listTotal: toMoney(listTotal), billable };
}
