import type { Bill, BillLineView } from '../lib/bill';
import { REGIONS } from '../data/catalog';

function rows(views: BillLineView[]) {
  return views.map((v) => (
    <tr key={v.line.id}>
      <td>{v.product?.sku ?? v.line.sku}</td>
      <td>{v.product?.name ?? '（未知编号）'}</td>
      <td>{v.packLabel}</td>
      <td>{v.line.packs}</td>
      <td>{v.ev.baseUnits}</td>
      <td>
        {v.breakdown
          ? `${v.breakdown.lineTotal} 元（${v.breakdown.sources.join('；')}）`
          : '失效，不计价'}
      </td>
      <td>{v.ev.reasons.map((r) => r.message).join('；')}</td>
    </tr>
  ));
}

export default function PrintBill({ bill }: { bill: Bill }) {
  const chosen = bill.plans[bill.chosen];
  return (
    <div className="print-area">
      <h1>农资采购配单（虚构商品演示 · 离线打印）</h1>
      <table>
        <tbody>
          <tr>
            <th>农户</th><td>{bill.header.farmerName || '（未填）'}</td>
            <th>电话</th><td>{bill.header.phone || '（未填）'}</td>
          </tr>
          <tr>
            <th>区域</th><td>{REGIONS.find((r) => r.code === bill.header.region)?.label ?? bill.header.region}</td>
            <th>作物</th><td>{bill.header.crop || '（未选择）'}</td>
          </tr>
          <tr>
            <th>日期</th><td>{bill.header.date}</td>
            <th>打印时间</th><td>{new Date().toLocaleString('zh-CN')}</td>
          </tr>
        </tbody>
      </table>

      <div className="sec-title">一、有效项（{bill.valid.length} 行，可成交）</div>
      <table>
        <thead><tr><th>编号</th><th>名称</th><th>包装</th><th>包装数</th><th>基础单位</th><th>金额及来源</th><th></th></tr></thead>
        <tbody>{rows(bill.valid)}</tbody>
      </table>

      <div className="sec-title stamp-pending">二、待确认项（{bill.pending.length} 行，暂计价并预占库存，须店员核实后才能成交）</div>
      <table>
        <thead><tr><th>编号</th><th>名称</th><th>包装</th><th>包装数</th><th>基础单位</th><th>暂估金额及来源</th><th>待确认原因</th></tr></thead>
        <tbody>{rows(bill.pending)}</tbody>
      </table>

      <div className="sec-title stamp-invalid">三、失效项（{bill.invalid.length} 行，不能销售、不计价、不预占库存）</div>
      <table>
        <thead><tr><th>编号</th><th>名称</th><th>包装</th><th>包装数</th><th>基础单位</th><th>处理</th><th>失效原因</th></tr></thead>
        <tbody>{rows(bill.invalid)}</tbody>
      </table>

      <div className="sec-title">四、金额来源与优惠方案</div>
      <table>
        <tbody>
          <tr><th>采用方案</th><td>{chosen.label}</td></tr>
          <tr><th>应付金额</th><td>{chosen.payable} 元（相对原价合计 {bill.listTotal} 元节省 {chosen.saved} 元）</td></tr>
          <tr><th>未采用方案</th>
            <td>
              {bill.plans[bill.chosen === 'A_PROMO_TIER' ? 'B_COUPON' : 'A_PROMO_TIER'].label}，
              应付 {bill.plans[bill.chosen === 'A_PROMO_TIER' ? 'B_COUPON' : 'A_PROMO_TIER'].payable} 元
            </td>
          </tr>
        </tbody>
      </table>
      <div className="sources">{bill.amountSources.map((s, i) => `${i + 1}. ${s}`).join('\n')}</div>

      <p style={{ fontSize: 12, marginTop: 16 }}>
        说明：本单商品及规则均为虚构，仅用于离线配单演示。本工具不提供农药使用、剂量或混配建议；
        待确认项与失效项未经人工核实不得销售。促销库存为加入清单时本地预占，移除即释放，多台设备同时开单可能争用，以最终成交页为准。
      </p>
    </div>
  );
}
