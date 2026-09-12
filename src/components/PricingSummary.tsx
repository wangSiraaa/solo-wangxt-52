import type { Bill } from '../lib/bill';

export default function PricingSummary({ bill }: { bill: Bill }) {
  const chosen = bill.plans[bill.chosen];
  const other = bill.plans[bill.chosen === 'A_PROMO_TIER' ? 'B_COUPON' : 'A_PROMO_TIER'];
  const billableCount = bill.valid.length + bill.pending.length;

  return (
    <div className="panel">
      <h2>优惠方案（互斥，不叠加）</h2>
      {billableCount === 0 ? (
        <p className="muted">暂无有效或待确认行可计价；失效行不参与计价。</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            全部按原价合计 {bill.listTotal} 元；失效行不计价，待确认行暂按当前规则计价，成交前需人工确认。
          </p>
          {(['A_PROMO_TIER', 'B_COUPON'] as const).map((id) => {
            const plan = bill.plans[id];
            const isChosen = id === bill.chosen;
            return (
              <div key={id} className={`plan-box ${isChosen ? 'chosen' : ''}`}>
                <div>
                  <strong>{plan.label}</strong>
                  {isChosen && <span className="pill valid" style={{ marginLeft: 8 }}>采用</span>}
                </div>
                <div className="pay">应付 {plan.payable} 元（相对原价省 {plan.saved} 元）</div>
                <div className="muted">{plan.explanation}</div>
              </div>
            );
          })}
          <p className="muted" style={{ marginBottom: 0 }}>
            比较：{chosen.label} 应付 {chosen.payable} 元，另一方案（{other.label}）应付 {other.payable} 元；
            两者相同时默认优先使用促销库存方案。
          </p>
        </>
      )}
    </div>
  );
}
