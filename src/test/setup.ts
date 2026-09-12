import 'fake-indexeddb/auto';

// Node 环境下的 localStorage 垫片，供 db.ts 的 seed 标记使用。
const mem = new Map<string, string>();
(globalThis as { localStorage: Storage }).localStorage = {
  get length() {
    return mem.size;
  },
  clear: () => mem.clear(),
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  key: (i: number) => [...mem.keys()][i] ?? null,
  removeItem: (k: string) => void mem.delete(k),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
};
