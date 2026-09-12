import { useMemo, useState } from 'react';
import { parseImportText, reconcileImport, type ImportReport } from '../lib/importDraft';
import type { DraftLine, Product } from '../types';

interface ImportModalProps {
  products: Map<string, Product>;
  region: string;
  existing: DraftLine[];
  onClose: () => void;
  onConfirm: (lines: DraftLine[], headerPatch: { farmerName?: string; phone?: string; date?: string }) => void;
}

export default function ImportModal({ products, region, existing, onClose, onConfirm }: ImportModalProps) {
  const [text, setText] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fatal, setFatal] = useState<string[]>([]);
  const [headerPatch, setHeaderPatch] = useState<{ farmerName?: string; phone?: string; date?: string }>({});
  const [importHeader, setImportHeader] = useState(true);

  const parsed = useMemo(() => (text.trim() ? parseImportText(text) : null), [text]);

  const preview = () => {
    if (!parsed) return;
    setFatal(parsed.fatalErrors);
    setReport(reconcileImport(parsed, existing, products, region));
    setHeaderPatch({
      farmerName: parsed.header?.farmerName,
      phone: parsed.header?.phone,
      date: parsed.header?.date,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>导入清单</h2>
        <p className="muted">
          支持 JSON（{'{ header?, lines:[{sku, packId, packs, note?}] }'}）或 CSV（编号,包装,数量,备注，首行可为中文表头）。
          与现有草稿重复的商品编号<strong>不会覆盖</strong>，会在下方列出冲突并默认跳过。
        </p>
        <textarea
          placeholder='{"lines":[{"sku":"F001","packId":"bag","packs":10}]}'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div style={{ margin: '8px 0' }}>
          <button className="small" onClick={preview}>检查冲突并预览</button>
          <button className="small" onClick={onClose}>取消</button>
        </div>

        {fatal.length > 0 && (
          <div style={{ background: 'var(--red-bg)', borderRadius: 8, padding: 8 }}>
            {fatal.map((f, i) => <div key={i} style={{ color: 'var(--red)' }}>{f}</div>)}
          </div>
        )}

        {report && (
          <>
            <h3>预览：{report.entries.length} 行，其中 {report.conflictCount} 行编号冲突</h3>
            <table className="lines">
              <thead><tr><th>编号</th><th>包装/数量</th><th>问题</th><th>处理</th></tr></thead>
              <tbody>
                {report.entries.map((e, i) => (
                  <tr key={i} className={e.issues.some((x) => x.kind.startsWith('DUPLICATE')) ? 'st-invalid' : e.issues.length ? 'st-pending' : ''}>
                    <td>{e.row.sku}{e.row.note ? <div className="muted">{e.row.note}</div> : null}</td>
                    <td>{e.row.packId} × {e.row.packs}</td>
                    <td>
                      {e.issues.length === 0 && <span className="muted">无冲突</span>}
                      {e.issues.map((iss, j) => (
                        <div key={j} className={`issue ${iss.kind.startsWith('DUPLICATE') ? 'conflict' : 'warn2'}`}>
                          · {iss.message}
                          {e.existing && `（现有：${e.existing.packId} × ${e.existing.packs}）`}
                        </div>
                      ))}
                    </td>
                    <td>
                      <select
                        value={e.decision}
                        onChange={(ev) => {
                          const next = { ...report, entries: report.entries.map((x, k) => (k === i ? { ...x, decision: ev.target.value as 'skip' | 'add' } : x)) };
                          setReport(next);
                        }}
                      >
                        <option value="skip">跳过（保留现有）</option>
                        <option value="add">仍加入为新行（不覆盖旧行）</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {parsed?.header && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0' }}>
                <input type="checkbox" checked={importHeader} onChange={(e) => setImportHeader(e.target.checked)} />
                同时带入抬头信息（{[headerPatch.farmerName, headerPatch.phone, headerPatch.date].filter(Boolean).join(' / ') || '文件中无抬头'}）
              </label>
            )}

            <div>
              <button
                className="primary"
                onClick={() => {
                  const lines = report.entries.filter((e) => e.decision === 'add').map((e) => e.toLine);
                  onConfirm(lines, importHeader ? headerPatch : {});
                }}
              >
                确认加入所选行
              </button>
              <span className="muted" style={{ marginLeft: 8 }}>
                将加入 {report.entries.filter((e) => e.decision === 'add').length} 行；跳过的行与现有草稿均不变。
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
