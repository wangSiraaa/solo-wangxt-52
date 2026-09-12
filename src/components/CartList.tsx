import type { Bill, BillLineView } from '../lib/bill';
import type { DraftLine } from '../types';

interface CartProps {
  bill: Bill;
  onChangeLine: (lineId: string, patch: Partial<DraftLine>) => void;
  onRemove: (lineId: string) => void;
  onPrint: () => void;
  onOpenImport: () => void;
}

function LineRow({
  view,
  onChangeLine,
  onRemove,
}: {
  view: BillLineView;
  onChangeLine: CartProps['onChangeLine'];
  onRemove: CartProps['onRemove'];
}) {
  const { line, ev, product, packLabel, breakdown } = view;
  return (
    <tr className={`st-${ev.status}`}>
      <td>
        <div><strong>{product?.name ?? line.sku}</strong></div>
        <div className="muted">{line.sku}</div>
        <ul className="reasons">
          {ev.reasons.map((r, i) => (
            <li key={i}>{r.message}</li>
          ))}
        </ul>
      </td>
      <td>
        {product ? (
          <select value={line.packId} onChange={(e) => onChangeLine(line.id, { packId: e.target.value })}>
            {product.packs.map((pk) => (
              <option key={pk.id} value={pk.id}>{pk.label}</option>
            ))}
          </select>
        ) : (
          packLabel
        )}
      </td>
      <td>
        <input
          type="number" min={1} style={{ width: 72 }}
          value={line.packs}
          onChange={(e) => onChangeLine(line.id, { packs: Math.max(1, Math.floor(Number(e.target.value) || 1) )} )}
        />
        {product && <div className="muted">= {ev.baseUnits} 基础单位</div>}
      </td>
      <td>
        {breakdown ? (
          <>
            <div>{breakdown.lineTotal} 元</div>
            {breakdown.promoUnits > 0 && (
              <div className="muted">含促销价 ×{breakdown.promoUnits}</div>
            )}
          </>
        ) : (
          <span className="muted">不计价</span>
        )}
      </td>
      <td>
        <span className={`pill ${ev.status}`}>
          {ev.status === 'valid' ? '有效' : ev.status === 'pending' ? '待确认' : '失效'}
        </span>
      </td>
      <td>
        <button className="small danger" onClick={() => onRemove(line.id)}>移除并释放</button>
      </td>
    </tr>
  );
}

export default function CartList({ bill, onChangeLine, onRemove, onPrint, onOpenImport }: CartProps) {
  const all = bill.ordered;
  return (
    <div className="panel">
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, flex: 'none' }}>采购清单（草稿自动保存在本机）</h2>
        <span style={{ flex: 1 }} />
        <button className="small" onClick={onOpenImport}>导入清单（冲突不覆盖）</button>
        <button className="small primary" onClick={onPrint}>打印 / 导出清单</button>
      </div>

      <table className="lines">
        <thead>
          <tr>
            <th>商品</th><th>包装</th><th>数量</th><th>金额来源</th><th>状态</th><th></th>
          </tr>
        </thead>
        <tbody>
          {all.length === 0 && (
            <tr><td colSpan={6} className="muted">还没有商品。从左侧货架加入；加入即预占促销库存，移除后释放。</td></tr>
          )}
          {all.map((v) => (
            <LineRow key={v.line.id} view={v} onChangeLine={onChangeLine} onRemove={onRemove} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
