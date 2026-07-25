import { createHash } from 'node:crypto';
import type { CommandHandler } from '../kernel.js';
import { gatherInputs } from './utils.js';

/** Read a single input body from the first file arg or stdin. */
async function oneInput(targets: string[], kernel: any, stdin?: string): Promise<string> {
  const ins = await gatherInputs(targets, kernel, stdin);
  return ins.map(i => (i.content === '\0MISSING' || i.content === '\0DIR' ? '' : i.content)).join('');
}

// ---------- wc ----------
export const wc: CommandHandler = async (args, kernel, stdin) => {
  const flags = args.filter(a => a.startsWith('-'));
  const files = args.filter(a => !a.startsWith('-'));
  const wantL = flags.some(f => f.includes('l'));
  const wantW = flags.some(f => f.includes('w'));
  const wantC = flags.some(f => f.includes('c'));
  const wantM = flags.some(f => f.includes('m'));
  const none = !wantL && !wantW && !wantC && !wantM;
  const inputs = await gatherInputs(files, kernel, stdin);
  if (inputs.length === 0) return { output: '', exitCode: 0 };
  const lines: string[] = [];
  let tl = 0, tw = 0, tc = 0;
  let err = false;
  for (const inp of inputs) {
    if (inp.content === '\0MISSING') { lines.push(`wc: ${inp.name}: No such file or directory`); err = true; continue; }
    if (inp.content === '\0DIR') { lines.push(`wc: ${inp.name}: Is a directory`); err = true; continue; }
    const text = inp.content;
    const nl = (text.match(/\n/g) || []).length;
    const nw = (text.trim().match(/\S+/g) || []).length;
    const nc = text.length;
    tl += nl; tw += nw; tc += nc;
    const cols: string[] = [];
    if (none || wantL) cols.push(String(nl).padStart(7));
    if (none || wantW) cols.push(String(nw).padStart(7));
    if (none || wantC || wantM) cols.push(String(nc).padStart(7));
    lines.push(cols.join(' ') + (files.length ? ` ${inp.name}` : ''));
  }
  if (inputs.length > 1) {
    const cols: string[] = [];
    if (none || wantL) cols.push(String(tl).padStart(7));
    if (none || wantW) cols.push(String(tw).padStart(7));
    if (none || wantC || wantM) cols.push(String(tc).padStart(7));
    lines.push(cols.join(' ') + ' total');
  }
  return { output: lines.join('\n'), exitCode: err ? 1 : 0 };
};

// ---------- sort ----------
export const sort: CommandHandler = async (args, kernel, stdin) => {
  const flags = args.filter(a => a.startsWith('-'));
  const files = args.filter(a => !a.startsWith('-'));
  const reverse = flags.some(f => f.includes('r'));
  const numeric = flags.some(f => f.includes('n'));
  const unique = flags.some(f => f.includes('u'));
  const ignoreCase = flags.some(f => f.includes('f'));
  const text = await oneInput(files, kernel, stdin);
  let lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
  lines.sort((a, b) => {
    let x = a, y = b;
    if (ignoreCase) { x = x.toLowerCase(); y = y.toLowerCase(); }
    if (numeric) return (parseFloat(x) || 0) - (parseFloat(y) || 0);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  if (reverse) lines.reverse();
  if (unique) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
  return { output: lines.join('\n'), exitCode: 0 };
};

// ---------- uniq ----------
export const uniq: CommandHandler = async (args, kernel, stdin) => {
  const flags = args.filter(a => a.startsWith('-'));
  const files = args.filter(a => !a.startsWith('-'));
  const count = flags.some(f => f.includes('c'));
  const onlyDup = flags.some(f => f.includes('d'));
  const onlyUniq = flags.some(f => f.includes('u'));
  const ic = flags.some(f => f.includes('i'));
  const text = await oneInput(files, kernel, stdin);
  let lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
  const eq = (a: string, b: string) => (ic ? a.toLowerCase() === b.toLowerCase() : a === b);
  const groups: { line: string; n: number }[] = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    if (last && eq(last.line, l)) last.n++;
    else groups.push({ line: l, n: 1 });
  }
  const out = groups
    .filter(g => (onlyDup ? g.n > 1 : true) && (onlyUniq ? g.n === 1 : true))
    .map(g => (count ? `${String(g.n).padStart(4)} ${g.line}` : g.line));
  return { output: out.join('\n'), exitCode: 0 };
};

// ---------- cut ----------
export const cut: CommandHandler = async (args, kernel, stdin) => {
  let delim = '\t', fieldsSpec = '', charsSpec = '';
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('-d')) delim = a.length > 2 ? a.slice(2) : (args[++i] || '\t');
    else if (a.startsWith('-f')) fieldsSpec = a.length > 2 ? a.slice(2) : (args[++i] || '');
    else if (a.startsWith('-c')) charsSpec = a.length > 2 ? a.slice(2) : (args[++i] || '');
    else if (!a.startsWith('-')) files.push(a);
  }
  const parseRanges = (spec: string) => spec.split(',').map(r => {
    const [a, b] = r.split('-');
    return { lo: parseInt(a || '1', 10), hi: b === '' ? Infinity : parseInt(b || a || '1', 10) };
  });
  const text = await oneInput(files, kernel, stdin);
  let lines = text.split('\n');
  const trailing = lines.length && lines[lines.length - 1] === '';
  if (trailing) lines = lines.slice(0, -1);
  const out = lines.map(line => {
    if (charsSpec) {
      const ranges = parseRanges(charsSpec);
      let s = '';
      for (let i = 1; i <= line.length; i++) if (ranges.some(r => i >= r.lo && i <= r.hi)) s += line[i - 1];
      return s;
    }
    if (fieldsSpec) {
      const parts = line.split(delim);
      if (parts.length === 1) return line; // no delim: pass through
      const ranges = parseRanges(fieldsSpec);
      const sel: string[] = [];
      for (let i = 1; i <= parts.length; i++) if (ranges.some(r => i >= r.lo && i <= r.hi)) sel.push(parts[i - 1]!);
      return sel.join(delim);
    }
    return line;
  });
  return { output: out.join('\n'), exitCode: 0 };
};

// ---------- tr ----------
export const tr: CommandHandler = async (args, kernel, stdin) => {
  const flags = args.filter(a => a.startsWith('-') && a.length > 1);
  const sets = args.filter(a => !a.startsWith('-'));
  const del = flags.some(f => f.includes('d'));
  const squeeze = flags.some(f => f.includes('s'));
  const expand = (s: string) => s
    .replace(/a-z/g, 'abcdefghijklmnopqrstuvwxyz')
    .replace(/A-Z/g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    .replace(/0-9/g, '0123456789')
    .replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const set1 = expand(sets[0] || '');
  const set2 = expand(sets[1] || '');
  let text = stdin ?? (sets.length > 2 ? await oneInput([sets[2]!], kernel) : '');
  if (del) {
    const rm = new Set(set1.split(''));
    text = text.split('').filter(c => !rm.has(c)).join('');
  } else {
    const map = new Map<string, string>();
    for (let i = 0; i < set1.length; i++) map.set(set1[i]!, set2[Math.min(i, set2.length - 1)] ?? set1[i]!);
    text = text.split('').map(c => map.get(c) ?? c).join('');
  }
  if (squeeze) {
    const sq = new Set((del ? set1 : set2).split(''));
    let out = ''; let prev = '';
    for (const c of text) { if (sq.has(c) && c === prev) continue; out += c; prev = c; }
    text = out;
  }
  return { output: text.replace(/\n$/, ''), exitCode: 0 };
};

// ---------- tee ----------
export const tee: CommandHandler = async (args, kernel, stdin) => {
  const append = args.includes('-a');
  const files = args.filter(a => !a.startsWith('-'));
  const data = stdin ?? '';
  for (const f of files) {
    const full = kernel.resolvePath(f);
    if (append) {
      const existing = (await kernel.getVFS().getNode(full))?.content ?? '';
      await kernel.writeFile(full, existing + data);
    } else await kernel.writeFile(full, data);
  }
  return { output: data.replace(/\n$/, ''), exitCode: 0 };
};

// ---------- rev / tac / nl ----------
export const rev: CommandHandler = async (args, kernel, stdin) => {
  const text = await oneInput(args.filter(a => !a.startsWith('-')), kernel, stdin);
  const out = text.split('\n').map(l => l.split('').reverse().join('')).join('\n');
  return { output: out.replace(/\n$/, ''), exitCode: 0 };
};
export const tac: CommandHandler = async (args, kernel, stdin) => {
  const text = await oneInput(args.filter(a => !a.startsWith('-')), kernel, stdin);
  let lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
  return { output: lines.reverse().join('\n'), exitCode: 0 };
};
export const nl: CommandHandler = async (args, kernel, stdin) => {
  const text = await oneInput(args.filter(a => !a.startsWith('-')), kernel, stdin);
  let lines = text.split('\n');
  const trailing = lines.length && lines[lines.length - 1] === '';
  if (trailing) lines = lines.slice(0, -1);
  let n = 0;
  const out = lines.map(l => (l.trim() === '' ? `       \t${l}` : `${String(++n).padStart(6)}\t${l}`));
  return { output: out.join('\n'), exitCode: 0 };
};

// ---------- path helpers ----------
export const basename: CommandHandler = async (args) => {
  const p = args[0] ?? '';
  let b = p.replace(/\/+$/, '').split('/').pop() || '/';
  if (args[1] && b.endsWith(args[1])) b = b.slice(0, -args[1].length);
  return { output: b, exitCode: 0 };
};
export const dirname: CommandHandler = async (args) => {
  const p = (args[0] ?? '').replace(/\/+$/, '');
  const idx = p.lastIndexOf('/');
  return { output: idx <= 0 ? (idx === 0 ? '/' : '.') : p.slice(0, idx), exitCode: 0 };
};
export const realpath: CommandHandler = async (args, kernel) => {
  const out = (args.filter(a => !a.startsWith('-')).length ? args.filter(a => !a.startsWith('-')) : ['.'])
    .map(p => kernel.resolvePath(p));
  return { output: out.join('\n'), exitCode: 0 };
};
export const which: CommandHandler = async (args, kernel) => {
  const found: string[] = []; let missing = false;
  for (const name of args.filter(a => !a.startsWith('-'))) {
    if ((kernel as any).commands?.has?.(name) || (kernel as any).commands?.get?.(name)) {
      found.push(`/bin/${name}`);
    } else {
      const node = await kernel.getVFS().getNode(`/bin/${name}`);
      if (node) found.push(`/bin/${name}`); else missing = true;
    }
  }
  return { output: found.join('\n'), exitCode: missing ? 1 : 0 };
};

// ---------- seq / yes / sleep ----------
export const seq: CommandHandler = async (args) => {
  const nums = args.filter(a => !a.startsWith('-')).map(Number);
  let start = 1, step = 1, end = 1;
  if (nums.length === 1) { end = nums[0]!; }
  else if (nums.length === 2) { start = nums[0]!; end = nums[1]!; }
  else if (nums.length >= 3) { start = nums[0]!; step = nums[1]!; end = nums[2]!; }
  const out: string[] = [];
  if (step === 0) return { output: 'seq: zero increment', exitCode: 1 };
  for (let i = start; step > 0 ? i <= end : i >= end; i += step) out.push(String(i));
  return { output: out.join('\n'), exitCode: 0 };
};
export const yes: CommandHandler = async (args) => {
  const s = args.length ? args.join(' ') : 'y';
  return { output: Array(1000).fill(s).join('\n'), exitCode: 0 };
};
export const sleep: CommandHandler = async (args) => {
  const spec = args[0] || '0';
  const mult = spec.endsWith('m') ? 60 : spec.endsWith('h') ? 3600 : 1;
  const sec = Math.min(parseFloat(spec) || 0, 60) * mult;
  await new Promise(r => setTimeout(r, Math.min(sec * 1000, 60000)));
  return { output: '', exitCode: 0 };
};

// ---------- printf ----------
export const printf: CommandHandler = async (args) => {
  const fmt = (args[0] ?? '').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  const rest = args.slice(1);
  let i = 0;
  const out = fmt.replace(/%[-+ 0-9.]*[sdifxXec%]/g, (spec) => {
    if (spec === '%%') return '%';
    const v = rest[i++] ?? '';
    if (/[dif]$/.test(spec)) return String(parseInt(v, 10) || 0);
    if (/[xX]$/.test(spec)) return (parseInt(v, 10) || 0).toString(16);
    return String(v);
  });
  return { output: out.replace(/\n$/, ''), exitCode: 0 };
};

// ---------- true / false / test / expr ----------
export const truecmd: CommandHandler = async () => ({ output: '', exitCode: 0 });
export const falsecmd: CommandHandler = async () => ({ output: '', exitCode: 1 });

export const test: CommandHandler = async (args, kernel) => {
  let a = [...args];
  if (a[a.length - 1] === ']') a = a.slice(0, -1); // `[ ... ]`
  const truthy = async (): Promise<boolean> => {
    if (a.length === 0) return false;
    if (a.length === 1) return a[0] !== '';
    if (a.length === 2) {
      const [op, x] = a as [string, string];
      const node = await kernel.getVFS().getNode(kernel.resolvePath(x));
      if (op === '-e') return !!node;
      if (op === '-f') return node?.type === 'file';
      if (op === '-d') return node?.type === 'directory';
      if (op === '-s') return !!node && (node.content?.length ?? 0) > 0;
      if (op === '-z') return x === '';
      if (op === '-n') return x !== '';
      if (op === '!') return !(x !== '');
      return false;
    }
    const [x, op, y] = a as [string, string, string];
    switch (op) {
      case '=': case '==': return x === y;
      case '!=': return x !== y;
      case '-eq': return Number(x) === Number(y);
      case '-ne': return Number(x) !== Number(y);
      case '-lt': return Number(x) < Number(y);
      case '-le': return Number(x) <= Number(y);
      case '-gt': return Number(x) > Number(y);
      case '-ge': return Number(x) >= Number(y);
      default: return false;
    }
  };
  return { output: '', exitCode: (await truthy()) ? 0 : 1 };
};

export const expr: CommandHandler = async (args) => {
  const s = args.join(' ');
  try {
    if (/^[\d\s+\-*/%().]+$/.test(s)) {
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict";return (${s})`)();
      return { output: String(Math.trunc(v)), exitCode: v ? 0 : 1 };
    }
  } catch { /* fall through */ }
  // string ops: length STRING
  if (args[0] === 'length') return { output: String((args[1] || '').length), exitCode: 0 };
  return { output: 'expr: syntax error', exitCode: 2 };
};

// ---------- checksums ----------
function makeHash(algo: string): CommandHandler {
  return async (args, kernel, stdin) => {
    const files = args.filter(a => !a.startsWith('-'));
    const inputs = await gatherInputs(files, kernel, stdin);
    const lines: string[] = []; let err = false;
    for (const inp of inputs) {
      if (inp.content === '\0MISSING') { lines.push(`${algo}sum: ${inp.name}: No such file or directory`); err = true; continue; }
      if (inp.content === '\0DIR') { lines.push(`${algo}sum: ${inp.name}: Is a directory`); err = true; continue; }
      const h = createHash(algo).update(inp.content).digest('hex');
      lines.push(files.length ? `${h}  ${inp.name}` : h);
    }
    return { output: lines.join('\n'), exitCode: err ? 1 : 0 };
  };
}
export const md5sum = makeHash('md5');
export const sha1sum = makeHash('sha1');
export const sha256sum = makeHash('sha256');

// ---------- ln ----------
export const ln: CommandHandler = async (args, kernel) => {
  const symbolic = args.includes('-s') || args.includes('-sf') || args.includes('-fs');
  const rest = args.filter(a => !a.startsWith('-'));
  const [target, linkName] = rest;
  if (!target) return { output: 'ln: missing operand', exitCode: 1 };
  const link = linkName || (target.split('/').pop() || target);
  const linkPath = kernel.resolvePath(link);
  try {
    await kernel.getVFS().createNode({
      path: linkPath,
      type: symbolic ? 'link' : 'file',
      content: symbolic ? target : (await kernel.readFile(kernel.resolvePath(target))),
      metadata: { symlink: symbolic ? target : undefined, created: new Date().toISOString(), permissions: '777' } as any,
      parentPath: linkPath.split('/').slice(0, -1).join('/') || '/',
    });
    return { output: '', exitCode: 0 };
  } catch (e: any) { return { output: `ln: ${e.message}`, exitCode: 1 }; }
};

// ---------- diff / cmp ----------
export const diff: CommandHandler = async (args, kernel) => {
  const files = args.filter(a => !a.startsWith('-'));
  if (files.length < 2) return { output: 'diff: missing operand', exitCode: 2 };
  const read = async (p: string) => {
    const n = await kernel.getVFS().getNode(kernel.resolvePath(p));
    return n?.content ?? null;
  };
  const A = await read(files[0]!), B = await read(files[1]!);
  if (A === null) return { output: `diff: ${files[0]}: No such file or directory`, exitCode: 2 };
  if (B === null) return { output: `diff: ${files[1]}: No such file or directory`, exitCode: 2 };
  const a = A.split('\n'), b = B.split('\n');
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) out.push(`${i + 1}c${i + 1}`), out.push(`< ${a[i]}`);
      if (b[i] !== undefined) out.push(`---`), out.push(`> ${b[i]}`);
    }
  }
  return { output: out.join('\n'), exitCode: out.length ? 1 : 0 };
};
export const cmp: CommandHandler = async (args, kernel) => {
  const files = args.filter(a => !a.startsWith('-'));
  const a = (await kernel.getVFS().getNode(kernel.resolvePath(files[0] || '')))?.content ?? null;
  const b = (await kernel.getVFS().getNode(kernel.resolvePath(files[1] || '')))?.content ?? null;
  if (a === null || b === null) return { output: 'cmp: No such file or directory', exitCode: 2 };
  if (a === b) return { output: '', exitCode: 0 };
  let i = 0, line = 1;
  for (; i < Math.min(a.length, b.length); i++) { if (a[i] !== b[i]) break; if (a[i] === '\n') line++; }
  return { output: `${files[0]} ${files[1]} differ: byte ${i + 1}, line ${line}`, exitCode: 1 };
};

// ---------- du / tree ----------
export const du: CommandHandler = async (args, kernel) => {
  const human = args.includes('-h');
  const summary = args.includes('-s');
  const start = args.filter(a => !a.startsWith('-'))[0] || '.';
  const fmt = (bytes: number) => human
    ? (bytes >= 1024 ? (bytes / 1024).toFixed(1) + 'K' : bytes + 'B')
    : String(Math.ceil(bytes / 1024) || 0);
  const lines: string[] = [];
  const walk = async (p: string): Promise<number> => {
    const full = kernel.resolvePath(p);
    const node = await kernel.getVFS().getNode(full);
    if (!node) return 0;
    if (node.type !== 'directory') return node.content?.length ?? 0;
    let total = 0;
    for (const child of await kernel.listNodes(full)) total += await walk(child.path);
    if (!summary) lines.push(`${fmt(total)}\t${full}`);
    return total;
  };
  const total = await walk(start);
  if (summary) lines.push(`${fmt(total)}\t${kernel.resolvePath(start)}`);
  return { output: lines.join('\n'), exitCode: 0 };
};

export const tree: CommandHandler = async (args, kernel, _stdin) => {
  const start = args.filter(a => !a.startsWith('-'))[0] || '.';
  let dirs = 0, filesN = 0;
  const lines: string[] = [];
  const walk = async (p: string, prefix: string) => {
    const kids = (await kernel.listNodes(kernel.resolvePath(p))).sort((a, b) => a.path.localeCompare(b.path));
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]!;
      const name = k.path.split('/').pop()!;
      if (name.startsWith('.')) continue;
      const last = i === kids.length - 1;
      lines.push(prefix + (last ? '└── ' : '├── ') + name);
      if (k.type === 'directory') { dirs++; await walk(k.path, prefix + (last ? '    ' : '│   ')); }
      else filesN++;
    }
  };
  lines.push(kernel.resolvePath(start));
  try { await walk(start, ''); } catch { /* empty */ }
  lines.push('', `${dirs} directories, ${filesN} files`);
  return { output: lines.join('\n'), exitCode: 0 };
};

// ---------- paste / comm ----------
export const paste: CommandHandler = async (args, kernel, stdin) => {
  let delim = '\t';
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('-d')) delim = a.length > 2 ? a.slice(2) : (args[++i] || '\t');
    else if (!a.startsWith('-')) files.push(a);
  }
  const cols = await Promise.all(files.map(async f => {
    if (f === '-') return (stdin ?? '').split('\n');
    const n = await kernel.getVFS().getNode(kernel.resolvePath(f));
    return (n?.content ?? '').replace(/\n$/, '').split('\n');
  }));
  const rows = Math.max(...cols.map(c => c.length), 0);
  const out: string[] = [];
  for (let r = 0; r < rows; r++) out.push(cols.map(c => c[r] ?? '').join(delim));
  return { output: out.join('\n'), exitCode: 0 };
};
