import { useMemo, useState } from 'react';
import { CATEGORY_LABEL, type Category, type Product } from '../types';
import { REGIONS } from '../data/catalog';
import type { ReserveTotal } from '../lib/reservations';
import { toMoney, d } from '../lib/money';

interface ShelfProps {
  products: Product[];
  region: string;
  crop: string;
  reserves: Map<string, ReserveTotal>;
  onAdd: (sku: string, packId: string, packs: number) => void;
  onSaveStock: (sku: string, patch: { baseStock?: number; promoQuota?: number; active?: boolean }) => void;
}

/** 货架。分类/关键字筛选是组件本地状态，只改变展示，不触碰草稿。 */
export default function Shelf({ products, region, crop, reserves, onAdd, onSaveStock }: ShelfProps) {
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const [showStockAdmin, setShowStockAdmin] = useState(false);
  const [chosen, setChosen] = useState<Record<string, { packId: string; packs: number }>>({});

  const visible = useMemo(() => {
    const kw = q.trim().toUpperCase();
    return products.filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (kw && !p.sku.includes(kw) && !p.name.toUpperCase().includes(kw)) return false;
      return true;
    });
  }, [products, cat, q]);

  return (
    <div className="panel">
      <h2>本地货架（虚构商品，离线数据）</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="field">
          分类筛选
          <select value={cat} onChange={(e) => setCat(e.target.value as Category | 'all')}>
            <option value="all">全部</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          编号 / 名称搜索
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="如 F001 / 肥" />
        </label>
        <button className="small" onClick={() => setShowStockAdmin((v) => !v)}>
          {showStockAdmin ? '收起库存调整' : '本店库存调整'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
        当前区域：{REGIONS.find((r) => r.code === region)?.label ?? region}；当前作物：{crop || '未选择'}。
        切换区域/作物只重新判定资格，不会清空清单。
      </p>

      {visible.map((p) => {
        const res = reserves.get(p.sku) ?? { base: 0, promo: 0 };
        const baseAvail = p.baseStock - res.base;
        const promoAvail = p.promoQuota - res.promo;
        const sel = chosen[p.sku] ?? { packId: p.packs[0].id, packs: 1 };
        const regionBad = p.forbiddenRegions.includes(region);
        const cropBad = p.crops.length > 0 && crop !== '' && !p.crops.includes(crop);
        return (
          <div key={p.sku} className={`product-card ${p.active ? '' : 'inactive'}`}>
            <div className="title">
              <strong>{p.name}</strong>
              <span className="tag">{p.sku}</span>
              <span className={`tag cat-${p.category}`}>{CATEGORY_LABEL[p.category]}</span>
              {!p.active && <span className="pill invalid">已停用</span>}
            </div>
            <div className="tags">
              <span className="tag">适用作物：{p.crops.length ? p.crops.join('、') : '通用'}</span>
              {p.forbiddenRegions.length > 0 && (
                <span className="tag" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
                  禁售：{p.forbiddenRegions.map((c) => REGIONS.find((r) => r.code === c)?.label ?? c).join('、')}
                </span>
              )}
              {p.mutexGroup && <span className="tag">互斥组 {p.mutexGroup}</span>}
              {p.maxPerFarmer != null && <span className="tag">每农户限购 {p.maxPerFarmer} 件</span>}
              {regionBad && <span className="pill invalid">当前区域禁售</span>}
              {cropBad && <span className="pill pending">作物不匹配</span>}
            </div>
            <div className="stock-line">
              阶梯价：
              {p.tiers.map((t) => `${t.minQty}件起 ${toMoney(d(t.unitPrice))}`).join(' / ')}
            </div>
            <div className="stock-line">
              <span>物理库存：{p.baseStock}（已预占 {res.base}，余 {baseAvail}）</span>
              <span className={promoAvail <= 0 && p.promoQuota > 0 ? 'zero' : promoAvail < p.promoQuota ? 'tight' : ''}>
                促销库存：{p.promoQuota}（已预占 {res.promo}，余 {Math.max(0, promoAvail)}）
              </span>
              {p.promoNote && <span>· {p.promoNote}</span>}
            </div>
            {showStockAdmin && (
              <div className="stock-line">
                <label className="field">物理库存
                  <input
                    type="number" defaultValue={p.baseStock} style={{ width: 90 }}
                    onBlur={(e) => onSaveStock(p.sku, { baseStock: Number(e.target.value) })}
                  />
                </label>
                <label className="field">促销库存
                  <input
                    type="number" defaultValue={p.promoQuota} style={{ width: 90 }}
                    onBlur={(e) => onSaveStock(p.sku, { promoQuota: Number(e.target.value) })}
                  />
                </label>
                <label className="field">状态
                  <select
                    value={p.active ? '1' : '0'}
                    onChange={(e) => onSaveStock(p.sku, { active: e.target.value === '1' })}
                  >
                    <option value="1">在售</option>
                    <option value="0">停用</option>
                  </select>
                </label>              </div>
            )}
            <div className="add-row">
              <select
                value={sel.packId}
                onChange={(e) => setChosen((c) => ({ ...c, [p.sku]: { ...sel, packId: e.target.value } }))}
              >
                {p.packs.map((pk) => (
                  <option key={pk.id} value={pk.id}>{pk.label}（{pk.factor} 基础单位）</option>
                ))}
              </select>
              <input
                type="number" min={1} value={sel.packs}
                onChange={(e) => setChosen((c) => ({ ...c, [p.sku]: { ...sel, packs: Math.max(1, Number(e.target.value) || 1) } }))}
              />
              <button className="primary small" disabled={!p.active} onClick={() => onAdd(p.sku, sel.packId, sel.packs)}>
                加入清单（预占促销库存）
              </button>
            </div>
          </div>
        );
      })}
      {visible.length === 0 && <p className="muted">没有符合筛选的商品。</p>}
    </div>
  );
}
