import type {
  DraftLine,
  LineEvaluation,
  LineReasonCode,
  Product,
} from '../types';

/** 其他标签页（会话）已预占的库存，按 SKU 汇总。本会话自身的预占不计入。 */
export interface ExternalReserve {
  base: number;
  promo: number;
}

export interface EligibilityContext {
  region: string;
  crop: string;
  external: Map<string, ExternalReserve>;
  /** SKU -> 促销库存（来自本地库存表，可被门店调整）。 */
  promoQuota: Map<string, number>;
  baseStock: Map<string, number>;
}

const REASON_TEXT: Record<LineReasonCode, string> = {
  REGION_FORBIDDEN: '该商品在当前所选区域禁售（虚构销售规则）',
  CROP_UNSUITABLE: '商品适用作物不含当前作物，需店员向农户确认后保留',
  PRODUCT_INACTIVE: '商品已停用，不能销售',
  UNKNOWN_SKU: '清单中的商品编号在本地货架中不存在',
  BAD_PACK: '包装规格不存在或已变化（跨包装规格失效）',
  OUT_OF_STOCK: '数量超过可用物理库存（含其他标签页已预占）',
  LIMIT_EXCEEDED: '超过每位农户限购量；已按同一编号跨整单汇总，拆行不能绕过',
  MUTEX_CONFLICT: '与清单中同一互斥组的商品冲突，不可同时销售（虚构规则）',
  PROMO_OVERFLOW: '促销库存被其他标签页预占，部分数量将按阶梯价，待确认',
};

function reason(code: LineReasonCode) {
  return { code, message: REASON_TEXT[code] };
}

function baseUnitsOf(line: DraftLine, product?: Product): number {
  if (!product) return line.packs;
  const pack = product.packs.find((p) => p.id === line.packId);
  return pack ? line.packs * pack.factor : NaN;
}

/**
 * 评估整张草稿。规则要点：
 * - 区域禁售 / 停售 / 编号缺失 / 包装失效 / 互斥冲突 / 物理库存不足 / 超限购 => invalid
 * - 作物不匹配 / 促销库存被外部占用导致溢出 => pending（待确认，保留行）
 * - 限购按 SKU 汇总所有行后判定，拆行无法绕过
 * - 促销可享数量在本单行之间按顺序分配，先扣减其他标签页预占
 */
export function evaluateDraft(
  lines: DraftLine[],
  products: Map<string, Product>,
  ctx: EligibilityContext,
): LineEvaluation[] {
  // 同一 SKU 汇总基础单位（跨行、跨包装）。
  const totals = new Map<string, number>();
  for (const line of lines) {
    const p = products.get(line.sku);
    const units = baseUnitsOf(line, p);
    if (Number.isFinite(units)) totals.set(line.sku, (totals.get(line.sku) ?? 0) + units);
  }

  // 互斥组：同组出现多个不同 SKU 即冲突。
  const groupSkus = new Map<string, Set<string>>();
  for (const line of lines) {
    const p = products.get(line.sku);
    if (p?.mutexGroup) {
      const set = groupSkus.get(p.mutexGroup) ?? new Set<string>();
      set.add(p.sku);
      groupSkus.set(p.mutexGroup, set);
    }
  }

  // 促销库存在本单各行间按行顺序分配（外部预占先扣减）。
  const promoRemaining = new Map<string, number>();
  const promoDemandExceeds = new Set<string>();

  const evals: LineEvaluation[] = lines.map((line) => {
    const product = products.get(line.sku);
    const reasons: LineEvaluation['reasons'] = [];
    let status: LineEvaluation['status'] = 'valid';

    const fail = (code: LineReasonCode) => {
      status = 'invalid';
      reasons.push(reason(code));
    };
    const warn = (code: LineReasonCode) => {
      if (status !== 'invalid') status = 'pending';
      reasons.push(reason(code));
    };

    if (!product) {
      fail('UNKNOWN_SKU');
      return {
        lineId: line.id,
        sku: line.sku,
        baseUnits: 0,
        status,
        reasons,
        promoUnits: 0,
        totalForSku: totals.get(line.sku) ?? 0,
      };
    }

    const pack = product.packs.find((p) => p.id === line.packId);
    const units = baseUnitsOf(line, product);

    if (!product.active) fail('PRODUCT_INACTIVE');
    if (!pack) fail('BAD_PACK');
    if (product.forbiddenRegions.includes(ctx.region)) fail('REGION_FORBIDDEN');
    if (ctx.crop && product.crops.length > 0 && !product.crops.includes(ctx.crop)) warn('CROP_UNSUITABLE');
    if (product.mutexGroup && (groupSkus.get(product.mutexGroup)?.size ?? 0) > 1) {
      fail('MUTEX_CONFLICT');
    }

    const ext = ctx.external.get(product.sku) ?? { base: 0, promo: 0 };
    const stock = ctx.baseStock.get(product.sku) ?? product.baseStock;
    const totalForSku = totals.get(product.sku) ?? 0;

    if (pack && totalForSku + ext.base > stock) fail('OUT_OF_STOCK');
    if (pack && product.maxPerFarmer != null && totalForSku > product.maxPerFarmer) {
      fail('LIMIT_EXCEEDED');
    }

    // 促销数量分配（即使本行失效也计算，便于界面解释；失效行不预占，由调用方处理）。
    let promoUnits = 0;
    if (pack && Number.isFinite(units)) {
      const quota = ctx.promoQuota.get(product.sku) ?? product.promoQuota;
      if (!promoRemaining.has(product.sku)) {
        promoRemaining.set(product.sku, Math.max(0, quota - ext.promo));
      }
      const left = promoRemaining.get(product.sku)!;
      promoUnits = Math.min(units, left);
      promoRemaining.set(product.sku, left - promoUnits);
      if (units > left) promoDemandExceeds.add(product.sku);
    }

    if (promoDemandExceeds.has(product.sku) && promoUnits < units && status === 'valid') {
      warn('PROMO_OVERFLOW');
    }

    return {
      lineId: line.id,
      sku: product.sku,
      product,
      baseUnits: Number.isFinite(units) ? units : 0,
      status,
      reasons,
      promoUnits,
      totalForSku,
    };
  });

  return evals;
}
