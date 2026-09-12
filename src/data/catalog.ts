import type { Product } from '../types';

/** 本文件全部为虚构商品与虚构销售规则，仅用于离线演示，不对应真实农资产品。
 *  工具不输出任何农药使用、剂量或混配建议；农药条目也只承载销售规则。 */

export const REGIONS = [
  { code: 'NORTH_PLAIN', label: '北方平原区' },
  { code: 'SOUTH_HILL', label: '南方丘陵区' },
  { code: 'WEST_PLATEAU', label: '西部高原区' },
  { code: 'EAST_COAST', label: '东部沿海区' },
] as const;

export const CROPS = ['水稻', '小麦', '玉米', '番茄', '棉花'] as const;
export type CropName = (typeof CROPS)[number];

/** 订单满减（方案 B），与单品阶梯/促销优惠互斥，结账时二选一并说明依据。 */
export interface CouponTier {
  threshold: string;
  discount: string;
  label: string;
}

export const COUPON_TIERS: CouponTier[] = [
  { threshold: '1000', discount: '60', label: '满 1000 减 60' },
  { threshold: '3000', discount: '220', label: '满 3000 减 220' },
];

export const PACK_BOX = { id: 'box', label: '箱（20 袋/瓶）', factor: 20 } as const;
export const PACK_BAG = { id: 'bag', label: '袋', factor: 1 } as const;
export const PACK_BOTTLE = { id: 'bottle', label: '瓶', factor: 1 } as const;
export const PACK_BAG5 = { id: 'bag5', label: '中包（5 袋）', factor: 5 } as const;
export const PACK_PIECE = { id: 'piece', label: '件', factor: 1 } as const;

export const SEED_PRODUCTS: Product[] = [
  {
    sku: 'P001',
    name: '【虚构】清田牌 30% 除虫悬浮剂',
    category: 'pesticide',
    packs: [PACK_BOTTLE, PACK_BOX],
    tiers: [
      { minQty: 1, unitPrice: '45.00' },
      { minQty: 20, unitPrice: '40.00' },
      { minQty: 100, unitPrice: '36.00' },
    ],
    promoQuota: 40,
    baseStock: 300,
    crops: ['水稻', '小麦'],
    forbiddenRegions: ['WEST_PLATEAU'],
    maxPerFarmer: 60,
    mutexGroup: 'MX-A',
    promoNote: '促销库存 40 瓶，促销价 38.00 元/瓶',
    active: true,
  },
  {
    sku: 'P002',
    name: '【虚构】绿野牌 25% 除草可湿性粉剂',
    category: 'pesticide',
    packs: [PACK_BAG, PACK_BAG5, PACK_BOX],
    tiers: [
      { minQty: 1, unitPrice: '28.00' },
      { minQty: 40, unitPrice: '25.00' },
      { minQty: 200, unitPrice: '22.50' },
    ],
    promoQuota: 100,
    baseStock: 500,
    crops: ['玉米', '小麦'],
    forbiddenRegions: ['SOUTH_HILL'],
    maxPerFarmer: 120,
    mutexGroup: 'MX-A',
    promoNote: '与 P001 属同一互斥组 MX-A，禁止同单销售（虚构规则）；促销 100 袋，24.00 元/袋',
    active: true,
  },
  {
    sku: 'P003',
    name: '【虚构】金穗牌 15% 杀菌水乳剂',
    category: 'pesticide',
    packs: [PACK_BOTTLE, PACK_BOX],
    tiers: [
      { minQty: 1, unitPrice: '52.00' },
      { minQty: 20, unitPrice: '47.00' },
    ],
    promoQuota: 0,
    baseStock: 160,
    crops: ['番茄', '棉花'],
    forbiddenRegions: [],
    maxPerFarmer: 80,
    active: true,
  },
  {
    sku: 'P004',
    name: '【虚构】护苗牌 10% 杀虫颗粒剂',
    category: 'pesticide',
    packs: [PACK_BAG, PACK_BAG5],
    tiers: [
      { minQty: 1, unitPrice: '18.00' },
      { minQty: 50, unitPrice: '16.00' },
    ],
    promoQuota: 60,
    baseStock: 40,
    crops: ['玉米'],
    forbiddenRegions: ['EAST_COAST'],
    maxPerFarmer: 40,
    mutexGroup: 'MX-B',
    promoNote: '促销 60 袋但物理库存仅 40 袋（预占争用演示）；促销价 15.00 元/袋',
    active: true,
  },
  {
    sku: 'F001',
    name: '【虚构】沃土牌复合肥料 45%',
    category: 'fertilizer',
    packs: [PACK_BAG, PACK_BOX],
    tiers: [
      { minQty: 1, unitPrice: '160.00' },
      { minQty: 40, unitPrice: '148.00' },
      { minQty: 200, unitPrice: '138.00' },
    ],
    promoQuota: 80,
    baseStock: 800,
    crops: [],
    forbiddenRegions: [],
    maxPerFarmer: 400,
    promoNote: '促销 80 袋，促销价 135.00 元/袋',
    active: true,
  },
  {
    sku: 'F002',
    name: '【虚构】青原牌有机颗粒肥',
    category: 'fertilizer',
    packs: [PACK_BAG, PACK_BAG5],
    tiers: [
      { minQty: 1, unitPrice: '75.00' },
      { minQty: 25, unitPrice: '69.00' },
    ],
    promoQuota: 30,
    baseStock: 200,
    crops: ['番茄', '玉米'],
    forbiddenRegions: ['WEST_PLATEAU'],
    promoNote: '西部高原区禁售；促销 30 袋，促销价 65.00 元/袋',
    active: true,
  },
  {
    sku: 'S001',
    name: '【虚构】丰稻 3 号水稻种子',
    category: 'seed',
    packs: [PACK_BAG, PACK_BAG5, PACK_BOX],
    tiers: [
      { minQty: 1, unitPrice: '32.00' },
      { minQty: 100, unitPrice: '28.50' },
    ],
    promoQuota: 200,
    baseStock: 1200,
    crops: ['水稻'],
    forbiddenRegions: ['NORTH_PLAIN'],
    maxPerFarmer: 600,
    promoNote: '北方平原区禁售；促销 200 袋，促销价 27.00 元/袋',
    active: true,
  },
  {
    sku: 'T001',
    name: '【虚构】手持式小型播种器',
    category: 'tool',
    packs: [PACK_PIECE, { id: 'dozen', label: '打（12 件）', factor: 12 }],
    tiers: [{ minQty: 1, unitPrice: '39.00' }],
    promoQuota: 0,
    baseStock: 96,
    crops: [],
    forbiddenRegions: [],
    active: true,
  },
  {
    sku: 'F003',
    name: '【虚构】退市品牌叶面肥（已停用）',
    category: 'fertilizer',
    packs: [PACK_BAG],
    tiers: [{ minQty: 1, unitPrice: '40.00' }],
    promoQuota: 0,
    baseStock: 50,
    crops: [],
    forbiddenRegions: [],
    active: false,
  },
];

/** 促销价规则：促销库存内的基础单位按促销价（虚构规则：取最高档阶梯价再优惠一档的固定值）。 */
export const PROMO_UNIT_PRICE: Record<string, string> = {
  P001: '38.00',
  P002: '24.00',
  P004: '15.00',
  F001: '135.00',
  F002: '65.00',
  S001: '27.00',
};
