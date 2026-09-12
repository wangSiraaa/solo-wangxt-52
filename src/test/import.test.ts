import { describe, expect, it } from 'vitest';
import { parseImportText, reconcileImport } from '../lib/importDraft';
import type { DraftLine } from '../types';
import { makeLine, products } from './helpers';

describe('导入解析', () => {
  it('解析 JSON 行与可选 header', () => {
    const r = parseImportText(JSON.stringify({
      header: { farmerName: '张三' },
      lines: [{ sku: 'f001', packId: 'bag', packs: 10 }],
    }));
    expect(r.fatalErrors).toEqual([]);
    expect(r.rows[0].sku).toBe('F001');
    expect(r.header?.farmerName).toBe('张三');
  });

  it('解析带中文表头的 CSV', () => {
    const r = parseImportText('编号,包装,数量,备注\nF001,bag,5,老张要\nT001,piece,2,');
    expect(r.fatalErrors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].note).toBe('老张要');
  });

  it('非法数量给出致命错误而非吞掉', () => {
    const r = parseImportText('编号,包装,数量\nF001,bag,-1');
    expect(r.fatalErrors[0]).toContain('数量');
  });
});

describe('重复编号冲突：展示冲突，不覆盖', () => {
  it('草稿已有同编号 => 标记冲突，默认 skip，并回显现有行', () => {
    const existing: DraftLine[] = [makeLine('F001', 5, 'bag', 'old-1')];
    const parsed = parseImportText(JSON.stringify({ lines: [{ sku: 'F001', packId: 'bag', packs: 20 }] }));
    const report = reconcileImport(parsed, existing, products, 'NORTH_PLAIN');
    expect(report.conflictCount).toBe(1);
    expect(report.entries[0].decision).toBe('skip');
    expect(report.entries[0].existing).toMatchObject({ lineId: 'old-1', packs: 5 });
    // 草稿原行不被改动
    expect(existing[0].packs).toBe(5);
  });

  it('文件内重复编号 => 第二行默认跳过', () => {
    const parsed = parseImportText(
      JSON.stringify({
        lines: [
          { sku: 'T001', packId: 'piece', packs: 1 },
          { sku: 'T001', packId: 'dozen', packs: 1 },
        ],
      }),
    );
    const report = reconcileImport(parsed, [], products, 'NORTH_PLAIN');
    expect(report.entries[0].decision).toBe('add');
    expect(report.entries[1].decision).toBe('skip');
    expect(report.entries[1].issues.map((i) => i.kind)).toContain('DUPLICATE_IN_FILE');
  });

  it('未知编号与错误包装以问题形式展示，不静默加入正常项', () => {
    const parsed = parseImportText('编号,包装,数量\nX999,bag,3\nP002,carton,2');
    const report = reconcileImport(parsed, [], products, 'NORTH_PLAIN');
    expect(report.entries[0].issues.map((i) => i.kind)).toContain('UNKNOWN_SKU');
    expect(report.entries[1].issues.map((i) => i.kind)).toContain('BAD_PACK');
    // 非重复问题默认仍允许加入（加入后由资格校验标失效/待确认，由店员处理）
    expect(report.entries.every((e) => e.decision === 'add')).toBe(true);
  });

  it('禁售区域给出提示问题', () => {
    const parsed = parseImportText('编号,包装,数量\nS001,bag,1');
    const report = reconcileImport(parsed, [], products, 'NORTH_PLAIN');
    expect(report.entries[0].issues.map((i) => i.kind)).toContain('REGION_FORBIDDEN');
  });
});
