import type { DraftLine, OrderHeader, Product } from '../types';

/** 导入支持两种格式：
 *  1) JSON：{ "header"?: OrderHeader, "lines": [{ sku, packId, packs, note? }] }
 *  2) CSV/文本：表头 编号,包装,数量,备注（表头可省略，按列序识别）。
 */

export interface ParsedImportRow {
  sku: string;
  packId: string;
  packs: number;
  note?: string;
  raw: string;
}

export interface ParsedImport {
  header?: Partial<OrderHeader>;
  rows: ParsedImportRow[];
  fatalErrors: string[];
}

function makeId(): string {
  return `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRow(raw: unknown): ParsedImportRow | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: '行不是对象' };
  const r = raw as Record<string, unknown>;
  const sku = String(r.sku ?? r['编号'] ?? r.SKU ?? '').trim().toUpperCase();
  const packId = String(r.packId ?? r['包装'] ?? '').trim();
  const packs = Number(r.packs ?? r['数量'] ?? 0);
  if (!sku) return { error: '缺少商品编号' };
  if (!packId) return { error: `${sku} 缺少包装规格` };
  if (!Number.isInteger(packs) || packs <= 0) return { error: `${sku} 数量必须为正整数` };
  return { sku, packId, packs, note: r.note ? String(r.note) : undefined, raw: JSON.stringify(raw) };
}

export function parseImportText(text: string): ParsedImport {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], fatalErrors: ['导入内容为空'] };

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      const obj = Array.isArray(json) ? { lines: json } : json;
      const lines = Array.isArray(obj.lines) ? obj.lines : null;
      if (!lines) return { rows: [], fatalErrors: ['JSON 中缺少 lines 数组'] };
      const rows: ParsedImportRow[] = [];
      const fatalErrors: string[] = [];
      lines.forEach((l: unknown, i: number) => {
        const n = normalizeRow(l);
        if ('error' in n) fatalErrors.push(`第 ${i + 1} 行：${n.error}`);
        else rows.push(n);
      });
      return { header: obj.header ?? undefined, rows, fatalErrors };
    } catch (e) {
      return { rows: [], fatalErrors: [`JSON 解析失败：${(e as Error).message}`] };
    }
  }

  // CSV：兼容中文表头
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: ParsedImportRow[] = [];
  const fatalErrors: string[] = [];
  let startIdx = 0;
  if (lines[0] && /编号|sku/i.test(lines[0])) startIdx = 1;
  lines.slice(startIdx).forEach((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const n = normalizeRow({ sku: cells[0], packId: cells[1], packs: cells[2], note: cells[3] });
    if ('error' in n) fatalErrors.push(`第 ${i + 1} 行：${n.error}`);
    else rows.push(n);
  });
  return { rows, fatalErrors };
}

export type ImportIssueKind =
  | 'DUPLICATE_IN_DRAFT'
  | 'DUPLICATE_IN_FILE'
  | 'UNKNOWN_SKU'
  | 'BAD_PACK'
  | 'REGION_FORBIDDEN';

export interface ImportEntry {
  row: ParsedImportRow;
  issues: { kind: ImportIssueKind; message: string }[];
  existing?: { lineId: string; packId: string; packs: number };
  /** 用户决策：冲突默认 skip，绝不覆盖。 */
  decision: 'skip' | 'add';
  toLine: DraftLine;
}

export interface ImportReport {
  entries: ImportEntry[];
  conflictCount: number;
}

const ISSUE_TEXT: Record<ImportIssueKind, string> = {
  DUPLICATE_IN_DRAFT: '草稿中已存在同一商品编号（默认跳过，不覆盖；可手动选择仍加入为新行）',
  DUPLICATE_IN_FILE: '导入文件内出现重复编号（默认只加入第一行）',
  UNKNOWN_SKU: '本地货架无此编号',
  BAD_PACK: '包装规格不存在，请人工核对',
  REGION_FORBIDDEN: '当前区域禁售，加入后将标记为失效',
};

/** 对照当前草稿与货架生成冲突报告。 */
export function reconcileImport(
  parsed: ParsedImport,
  existing: DraftLine[],
  products: Map<string, Product>,
  region: string,
): ImportReport {
  const seenInFile = new Set<string>();
  const existingBySku = new Map<string, DraftLine>();
  for (const l of existing) {
    if (!existingBySku.has(l.sku)) existingBySku.set(l.sku, l);
  }

  let conflictCount = 0;
  const entries: ImportEntry[] = parsed.rows.map((row) => {
    const issues: ImportEntry['issues'] = [];
    const product = products.get(row.sku);

    if (!product) issues.push({ kind: 'UNKNOWN_SKU', message: ISSUE_TEXT.UNKNOWN_SKU });
    else if (!product.packs.some((p) => p.id === row.packId)) {
      issues.push({ kind: 'BAD_PACK', message: ISSUE_TEXT.BAD_PACK });
    }
    if (product?.forbiddenRegions.includes(region)) {
      issues.push({ kind: 'REGION_FORBIDDEN', message: ISSUE_TEXT.REGION_FORBIDDEN });
    }
    if (seenInFile.has(row.sku)) {
      issues.push({ kind: 'DUPLICATE_IN_FILE', message: ISSUE_TEXT.DUPLICATE_IN_FILE });
    } else {
      seenInFile.add(row.sku);
    }
    const existingLine = existingBySku.get(row.sku);
    if (existingLine) {
      issues.push({ kind: 'DUPLICATE_IN_DRAFT', message: ISSUE_TEXT.DUPLICATE_IN_DRAFT });
    }
    if (issues.some((i) => i.kind.startsWith('DUPLICATE'))) conflictCount++;

    return {
      row,
      issues,
      existing: existingLine
        ? { lineId: existingLine.id, packId: existingLine.packId, packs: existingLine.packs }
        : undefined,
      decision: issues.some((i) => i.kind.startsWith('DUPLICATE')) ? 'skip' : 'add',
      toLine: { id: makeId(), sku: row.sku, packId: row.packId, packs: row.packs, note: row.note },
    };
  });

  return { entries, conflictCount };
}
