import type { Product } from '../types';
import type { DraftLine, LineEvaluation, OrderHeader } from '../types';
import { evaluateDraft, type EligibilityContext } from './eligibility';
import { lineCost, priceDraft, type LineCostBreakdown, type PricingPlan } from './pricing';

export interface BillLineView {
  line: DraftLine;
  ev: LineEvaluation;
  product?: Product;
  packLabel: string;
  breakdown: LineCostBreakdown | null;
}

export interface Bill {
  header: OrderHeader;
  /** 按草稿原顺序的全部行（渲染用）。 */
  ordered: BillLineView[];
  valid: BillLineView[];
  pending: BillLineView[];
  invalid: BillLineView[];
  plans: Record<'A_PROMO_TIER' | 'B_COUPON', PricingPlan>;
  chosen: 'A_PROMO_TIER' | 'B_COUPON';
  listTotal: string;
  amountSources: string[];
}

function toView(line: DraftLine, ev: LineEvaluation): BillLineView {
  const pack = ev.product?.packs.find((p) => p.id === line.packId);
  return {
    line,
    ev,
    product: ev.product,
    packLabel: pack ? pack.label : `未知包装(${line.packId})`,
    breakdown:
      ev.product && ev.status !== 'invalid' && Number.isFinite(ev.baseUnits)
        ? lineCost(ev.product, ev.baseUnits, ev.promoUnits)
        : null,
  };
}

export function buildBill(
  header: OrderHeader,
  lines: DraftLine[],
  products: Map<string, Product>,
  ctx: EligibilityContext,
): Bill {
  const evaluations = evaluateDraft(lines, products, ctx);
  const evByLine = new Map(evaluations.map((e) => [e.lineId, e]));

  const valid: BillLineView[] = [];
  const pending: BillLineView[] = [];
  const invalid: BillLineView[] = [];

  const pricingInputs = lines
    .map((line) => {
      const ev = evByLine.get(line.id)!;
      const view = toView(line, ev);
      if (ev.status === 'invalid') invalid.push(view);
      else if (ev.status === 'pending') pending.push(view);
      else valid.push(view);
      return ev.product && ev.status !== 'invalid'
        ? { product: ev.product, line, baseUnits: ev.baseUnits, promoUnits: ev.promoUnits }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const { plans, chosen, listTotal } = priceDraft(pricingInputs);

  const amountSources = [
    `原价合计 ${listTotal} 元（第 1 档单价 × 各有效/待确认行数量，失效行不计价）`,
    ...valid.flatMap((v) => (v.breakdown ? [`[${v.product!.sku}] ${v.product!.name}：${v.breakdown.sources.join('；')}`] : [])),
    ...pending.flatMap((v) =>
      v.breakdown ? [`[${v.product!.sku}] ${v.product!.name}（待确认，暂按当前规则计价）：${v.breakdown.sources.join('；')}`] : [],
    ),
    `采用【${plans[chosen].label}】，应付 ${plans[chosen].payable} 元。${plans[chosen].explanation}`,
    '单品优惠与订单满减互斥，未叠加；所有金额由 decimal.js 按分单位四舍五入。',
  ];

  return { header, ordered: lines.map((line) => toView(line, evByLine.get(line.id)!)), valid, pending, invalid, plans, chosen, listTotal, amountSources };
}
