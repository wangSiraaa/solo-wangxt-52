/** 领域类型定义。所有数量均为整数，按「基础单位」（袋/瓶）计量。 */

export type Category = 'pesticide' | 'fertilizer' | 'seed' | 'tool';

export const CATEGORY_LABEL: Record<Category, string> = {
  pesticide: '农药',
  fertilizer: '肥料',
  seed: '种子',
  tool: '农具',
};

/** 跨包装规格：factor 为该包装等于多少基础单位。 */
export interface PackSpec {
  id: string;
  label: string;
  factor: number;
}

/** 阶梯优惠：达到 minQty 基础单位后，该件享 unitPrice 单价。 */
export interface PriceTier {
  minQty: number;
  unitPrice: string;
}

/** 虚构商品规则（适用作物、禁售区域、互斥组、限购、阶梯价、促销库存）。 */
export interface Product {
  sku: string;
  name: string;
  category: Category;
  packs: PackSpec[];
  tiers: PriceTier[];
  /** 促销专属库存（基础单位），来自 db.products.promoQuota。 */
  promoQuota: number;
  /** 物理库存（基础单位）。 */
  baseStock: number;
  /** 适用作物（空数组表示通用）。 */
  crops: string[];
  /** 禁售区域编码。 */
  forbiddenRegions: string[];
  /** 每位农户限购（基础单位），按 SKU 跨整单汇总校验，无法靠拆行绕过。 */
  maxPerFarmer?: number;
  /** 互斥组：同组商品不可同时在一张清单中（虚构销售规则）。 */
  mutexGroup?: string;
  /** 促销说明；促销与订单满减不可叠加时由定价模块二选一。 */
  promoNote?: string;
  active: boolean;
}

/** 清单行。 */
export interface DraftLine {
  id: string;
  sku: string;
  packs: number;
  packId: string;
  note?: string;
}

export interface OrderHeader {
  farmerName: string;
  phone: string;
  region: string;
  crop: string;
  date: string;
}

export interface Draft {
  header: OrderHeader;
  lines: DraftLine[];
  updatedAt: number;
}

/** 跨标签页预占记录：加入清单即预占促销库存，移除后释放。 */
export interface Reservation {
  key: string; // `${draftId}::${lineId}::${sku}`
  sessionId: string;
  sku: string;
  draftId: string;
  baseUnits: number;
  promoUnits: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  name: string;
  heartbeatAt: number;
}

export type LineStatus = 'valid' | 'pending' | 'invalid';

export type LineReasonCode =
  | 'REGION_FORBIDDEN'
  | 'CROP_UNSUITABLE'
  | 'PRODUCT_INACTIVE'
  | 'UNKNOWN_SKU'
  | 'BAD_PACK'
  | 'OUT_OF_STOCK'
  | 'LIMIT_EXCEEDED'
  | 'MUTEX_CONFLICT'
  | 'PROMO_OVERFLOW';

export interface LineEvaluation {
  lineId: string;
  sku: string;
  product?: Product;
  baseUnits: number;
  status: LineStatus;
  reasons: { code: LineReasonCode; message: string }[];
  promoUnits: number;
  /** 同一 SKU 在本单全部行的基础单位汇总（用于解释限购/拆行）。 */
  totalForSku: number;
}
