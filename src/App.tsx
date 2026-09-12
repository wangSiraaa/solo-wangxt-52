import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, resetAllData, seedProductsIfNeeded, type DraftRecord } from './db';
import { CROPS, REGIONS } from './data/catalog';
import type { Draft, DraftLine, OrderHeader } from './types';
import { useProductMap, makeLineId } from './hooks/useProductMap';
import { buildBill } from './lib/bill';
import {
  activeSessions,
  getAllReserves,
  getExternalReserves,
  newSessionId,
  releaseDraft,
  syncReservations,
  type ReserveTotal,
} from './lib/reservations';
import Shelf from './components/Shelf';
import CartList from './components/CartList';
import PricingSummary from './components/PricingSummary';
import ImportModal from './components/ImportModal';
import PrintBill from './components/PrintBill';

const SESSION_KEY = 'nongzi.sessionId';
function sessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = newSessionId();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function emptyHeader(): OrderHeader {
  return {
    farmerName: '',
    phone: '',
    region: 'NORTH_PLAIN',
    crop: '',
    date: new Date().toISOString().slice(0, 10),
  };
}

function newDraftName(): string {
  return `草稿 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ header: emptyHeader(), lines: [], updatedAt: 0 });
  const [importOpen, setImportOpen] = useState(false);
  const sidRef = useRef<string>(sessionId());

  const productMap = useProductMap();
  const draftRecords = useLiveQuery<DraftRecord[]>(() => db.drafts.orderBy('updatedAt').reverse().toArray(), []);
  const allReserves = useLiveQuery<Map<string, ReserveTotal>>(() => getAllReserves(), [currentId, draft]);
  const sessions = useLiveQuery(() => activeSessions(), [currentId, draft]);

  useEffect(() => {
    seedProductsIfNeeded().then(() => setReady(true));
  }, []);

  // 首次载入：打开最近草稿，没有则新建。
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!ready || currentId || !draftRecords || bootstrapped.current) return;
    bootstrapped.current = true;
    if (draftRecords.length > 0) {
      const rec = draftRecords[0];
      setCurrentId(rec.id);
      setDraft(rec.draft);
    } else {
      void createDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, draftRecords]);

  // 自动保存（筛选/区域变化不走这里，因此不会因筛选丢草稿）。
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!ready || !currentId) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const updated = { ...draft, updatedAt: Date.now() };
      void db.drafts.put({ id: currentId, name: draft.header.farmerName || newDraftName(), draft: updated, updatedAt: Date.now() });
    }, 250);
  }, [draft, currentId, ready]);

  // 外部（其他标签页）预占量。
  const [external, setExternal] = useState<Map<string, ReserveTotal>>(new Map());
  useEffect(() => {
    let cancelled = false;
    getExternalReserves(sidRef.current).then((m) => {
      if (!cancelled) setExternal(m);
    });
    const t = window.setInterval(() => {
      getExternalReserves(sidRef.current).then((m) => !cancelled && setExternal(m));
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const promoQuotaMap = useMemo(
    () => new Map([...productMap.values()].map((p) => [p.sku, p.promoQuota])),
    [productMap],
  );
  const baseStockMap = useMemo(
    () => new Map([...productMap.values()].map((p) => [p.sku, p.baseStock])),
    [productMap],
  );

  const bill = useMemo(
    () =>
      buildBill(draft.header, draft.lines, productMap, {
        region: draft.header.region,
        crop: draft.header.crop,
        external,
        promoQuota: promoQuotaMap,
        baseStock: baseStockMap,
      }),
    [draft, productMap, external, promoQuotaMap, baseStockMap],
  );

  // 资格变化 => 同步预占（加入预占、移除/失效释放）。
  useEffect(() => {
    if (!ready || !currentId) return;
    const billable = bill.ordered
      .filter((v) => v.ev.status !== 'invalid')
      .map((v) => ({ line: v.line, ev: v.ev }));
    const t = window.setTimeout(() => {
      void syncReservations(sidRef.current, currentId, billable);
    }, 200);
    return () => window.clearTimeout(t);
  }, [bill, currentId, ready]);

  // 关闭/刷新页面时释放本标签页预占。
  useEffect(() => {
    const onUnload = () => {
      // beforeunload 中异步事务可能来不及，尽力而为；心跳过期兜底（15s）保证最终释放。
      void db.reservations.where('sessionId').equals(sidRef.current).delete();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  async function createDraft() {
    const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const fresh: Draft = { header: emptyHeader(), lines: [], updatedAt: Date.now() };
    await db.drafts.put({ id, name: newDraftName(), draft: fresh, updatedAt: Date.now() });
    setCurrentId(id);
    setDraft(fresh);
  }

  async function switchDraft(id: string) {
    if (currentId) await releaseDraft(sidRef.current, currentId);
    const rec = await db.drafts.get(id);
    if (rec) {
      setCurrentId(id);
      setDraft(rec.draft);
    }
  }

  async function deleteDraft(id: string) {
    await releaseDraft(sidRef.current, id);
    await db.drafts.delete(id);
    if (id === currentId) {
      setCurrentId(null);
      setDraft({ header: emptyHeader(), lines: [], updatedAt: 0 });
    }
  }

  function patchHeader(patch: Partial<OrderHeader>) {
    setDraft((d0) => ({ ...d0, header: { ...d0.header, ...patch } }));
  }

  function addLine(sku: string, packId: string, packs: number) {
    setDraft((d0) => {
      // 同编号同包装合并为一行（拆行不能绕过限购，合并也更直观）。
      const existing = d0.lines.find((l) => l.sku === sku && l.packId === packId);
      if (existing) {
        return {
          ...d0,
          lines: d0.lines.map((l) => (l.id === existing.id ? { ...l, packs: l.packs + packs } : l)),
        };
      }
      const line: DraftLine = { id: makeLineId(), sku, packId, packs };
      return { ...d0, lines: [...d0.lines, line] };
    });
  }

  function changeLine(lineId: string, patch: Partial<DraftLine>) {
    setDraft((d0) => ({ ...d0, lines: d0.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));
  }

  function removeLine(lineId: string) {
    // 预占释放由「资格变化 => 同步预占」effect 完成；这里仅改行。
    setDraft((d0) => ({ ...d0, lines: d0.lines.filter((l) => l.id !== lineId) }));
  }

  function confirmImport(lines: DraftLine[], headerPatch: Partial<OrderHeader>) {
    setDraft((d0) => ({
      header: { ...d0.header, ...headerPatch },
      lines: [...d0.lines, ...lines],
      updatedAt: d0.updatedAt,
    }));
    setImportOpen(false);
  }

  async function saveStock(sku: string, patch: { baseStock?: number; promoQuota?: number; active?: boolean }) {
    const cur = await db.products.get(sku);
    const base = cur ?? {
      sku,
      baseStock: productMap.get(sku)?.baseStock ?? 0,
      promoQuota: productMap.get(sku)?.promoQuota ?? 0,
      active: true,
      updatedAt: 0,
    };
    await db.products.put({ ...base, ...patch, updatedAt: Date.now() });
  }

  if (!ready) return <div style={{ padding: 24 }}>正在初始化本地货架…</div>;

  return (
    <>
      <div className="app">
        <div className="topbar">
          <h1>离线农资促销配单工具</h1>
          <span className="badge">虚构商品规则 · 无后端 · IndexedDB 本地存储</span>
          <span className="badge">标签页会话 {sidRef.current.slice(0, 8)}</span>
          <span className="spacer" />
          <button className="small" onClick={() => void createDraft()}>新建草稿</button>
          <button
            className="small"
            onClick={async () => {
              if (confirm('确定清空本机全部库存调整、草稿与预占，恢复演示数据？')) {
                await resetAllData();
                location.reload();
              }
            }}
          >
            重置全部本机数据
          </button>
        </div>

        <div className="note-bar">
          合规提示：本工具仅用于按虚构销售规则整理采购清单与金额，<strong>不输出任何农药使用、剂量或混配建议</strong>。
          待确认项需店员线下核实；多标签页同时开单时促销库存实时争用，其他标签页预占会即时削减可享促销数量。
          {sessions && sessions.length > 1 && (
            <> 当前在线开单标签页：{sessions.length}（{sessions.map((s) => s.name).join('、')}）。</>
          )}
        </div>

        <div style={{ padding: '12px 14px 0' }}>
          <div className="draft-tabs">
            {(draftRecords ?? []).map((r) => (
              <span
                key={r.id}
                className={`draft-tab ${r.id === currentId ? 'active' : ''}`}
                onClick={() => void switchDraft(r.id)}
              >
                {r.name}
                <button
                  className="small danger"
                  style={{ marginLeft: 8, padding: '0 6px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('删除该草稿？其预占会立即释放。')) void deleteDraft(r.id);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="row">
              <label className="field">农户姓名
                <input value={draft.header.farmerName} onChange={(e) => patchHeader({ farmerName: e.target.value })} />
              </label>
              <label className="field">联系电话
                <input value={draft.header.phone} onChange={(e) => patchHeader({ phone: e.target.value })} />
              </label>
              <label className="field">销售区域（切换后部分商品会转为失效）
                <select value={draft.header.region} onChange={(e) => patchHeader({ region: e.target.value })}>
                  {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </label>
              <label className="field">作物
                <select value={draft.header.crop} onChange={(e) => patchHeader({ crop: e.target.value })}>
                  <option value="">未选择</option>
                  {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field">配单日期
                <input type="date" value={draft.header.date} onChange={(e) => patchHeader({ date: e.target.value })} />
              </label>
            </div>
          </div>
        </div>

        <div className="layout">
          <Shelf
            products={[...productMap.values()]}
            region={draft.header.region}
            crop={draft.header.crop}
            reserves={allReserves ?? new Map()}
            onAdd={addLine}
            onSaveStock={(sku, patch) => void saveStock(sku, patch)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CartList
              bill={bill}
              onChangeLine={changeLine}
              onRemove={removeLine}
              onPrint={() => window.print()}
              onOpenImport={() => setImportOpen(true)}
            />
            <PricingSummary bill={bill} />
          </div>
        </div>
      </div>

      {importOpen && (
        <ImportModal
          products={productMap}
          region={draft.header.region}
          existing={draft.lines}
          onClose={() => setImportOpen(false)}
          onConfirm={confirmImport}
        />
      )}

      <PrintBill bill={bill} />
    </>
  );
}
