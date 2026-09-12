import { describe, expect, it } from 'vitest';
import { buildBill } from '../lib/bill';
import type { OrderHeader } from '../types';
import { makeCtx, makeLine, products } from './helpers';

const header: OrderHeader = {
  farmerName: '测试农户',
  phone: '13800000000',
  region: 'NORTH_PLAIN',
  crop: '水稻',
  date: '2026-09-12',
};

describe('打印清单：有效项 / 待确认项 / 失效项与金额来源', () => {
  it('三类分组正确，金额来源包含促销、阶梯与方案选择说明', () => {
    const lines = [
      makeLine('P001', 1, 'bottle', 'ok'), // 水稻+北方 => 有效
      makeLine('F002', 1, 'bag', 'pending'), // 禁售高原？北方可售；作物番茄/玉米，水稻 => 待确认
      makeLine('S001', 1, 'bag', 'bad'), // 北方禁售 => 失效
    ];
    const bill = buildBill(header, lines, products, makeCtx({ region: 'NORTH_PLAIN', crop: '水稻' }));
    expect(bill.valid.map((v) => v.line.id)).toEqual(['ok']);
    expect(bill.pending.map((v) => v.line.id)).toEqual(['pending']);
    expect(bill.invalid.map((v) => v.line.id)).toEqual(['bad']);

    expect(bill.valid[0].breakdown).not.toBeNull();
    expect(bill.pending[0].breakdown).not.toBeNull(); // 待确认仍暂计价
    expect(bill.invalid[0].breakdown).toBeNull();

    const sources = bill.amountSources.join('\n');
    expect(sources).toContain('P001');
    expect(sources).toContain('采用');
    expect(sources).toContain('decimal.js');
    expect(bill.listTotal).not.toBe('0.00');
  });
});
