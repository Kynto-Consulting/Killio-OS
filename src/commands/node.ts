import vm from 'node:vm';
import type { CommandHandler, KillioKernel } from '../kernel.js';
import { createNodeEnvironment } from '../utils/node/index.js';

/**
 * STRICT ISOLATION MODE (opt-in via KILLIO_JS_ISOLATION=strict).
 *
 * The default JS executor (`runInJsSandbox`, below) runs guest code in a
 * separate `node:vm` context, which closes reflection escapes but shares the
 * host V8 *isolate* --- not a memory-safe boundary for severe multi-tenant
 * isolation. Strict mode instead runs guest JS in a genuinely separate V8
 * isolate via `isolated-vm`, with a hard memory cap and wall-clock timeout, so
 * a guest cannot address host memory at all (`process`/`require` are simply
 * not defined in the isolate) and cannot exhaust host RAM. The trade-off is a
 * reduced, RPC-bridged API: console, a pure-JS `path`, a VFS-backed `fs`
 * subset, and a copied `process.env`. Deployments needing hard isolation for
 * untrusted JavaScript enable this mode; those needing the full mock API keep
 * the default. Both leave the WASM-backed Python path unchanged.
 *
 * Returns null if isolated-vm is unavailable (graceful fallback to vm mode).
 */
async function runInIsolatedVm(code: string, kernel: KillioKernel, cwd: string,
  opts: { memoryMB?: number; timeoutMs?: number } = {}): Promise<{ output: string } | null> {
  let ivm: any;
  try { ivm = (await import('isolated-vm')).default; } catch { return null; }

  const isolate = new ivm.Isolate({ memoryLimit: opts.memoryMB ?? 128 });
  try {
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set('global', jail.derefInto());

    const out: string[] = [];
    // Host bridge callbacks (each is invoked from inside the isolate).
    await jail.set('__log', new ivm.Reference((s: string) => { out.push(String(s)); }));
    await jail.set('__fs', new ivm.Reference(async (op: string, a: string, b: string) => {
      const p = a.startsWith('/') ? a : cwd.replace(/\/$/, '') + '/' + a;
      switch (op) {
        case 'writeFile': await kernel.writeFile(p, b ?? ''); return '';
        case 'readFile': return await kernel.readFile(p);
        case 'exists': return (await kernel.getVFS().getNode(kernel.resolvePath(p))) ? '1' : '';
        case 'mkdir': await kernel.execute(['mkdir', '-p', p]); return '';
        case 'unlink': await kernel.execute(['rm', p]); return '';
        default: throw new Error('fs op not supported in strict mode: ' + op);
      }
    }));
    const envCopy = new ivm.ExternalCopy({ ...(kernel.getAllEnv?.() ?? {}) }).copyInto();
    await jail.set('__env', envCopy);

    // Shim runs INSIDE the isolate: builds console/path/fs/process/require from
    // the bridged host references. path is pure JS (no RPC needed).
    const shim = `
      const console = { log:(...a)=>__log.applySync(undefined,[a.map(String).join(' ')]),
                        error:(...a)=>__log.applySync(undefined,[a.map(String).join(' ')]),
                        warn:(...a)=>__log.applySync(undefined,[a.map(String).join(' ')]) };
      const path = {
        join:(...p)=>p.join('/').replace(/\\/+/g,'/'),
        basename:(p)=>p.split('/').filter(Boolean).pop()||'',
        dirname:(p)=>{const s=p.split('/');s.pop();return s.join('/')||'/';},
        extname:(p)=>{const b=(p.split('/').pop()||'');const i=b.lastIndexOf('.');return i>0?b.slice(i):'';},
        resolve:(...p)=>p.join('/').replace(/\\/+/g,'/'), sep:'/' };
      const fs = {
        writeFileSync:(p,d)=>__fs.applySync(undefined,['writeFile',String(p),String(d)]),
        readFileSync:(p)=>__fs.applySync(undefined,['readFile',String(p)]),
        existsSync:(p)=>!!__fs.applySync(undefined,['exists',String(p)]),
        mkdirSync:(p)=>__fs.applySync(undefined,['mkdir',String(p)]),
        unlinkSync:(p)=>__fs.applySync(undefined,['unlink',String(p)]),
        promises:{
          writeFile:(p,d)=>__fs.apply(undefined,['writeFile',String(p),String(d)],{result:{promise:true}}),
          readFile:(p)=>__fs.apply(undefined,['readFile',String(p)],{result:{promise:true}}),
        } };
      const process = { env: __env, argv: ['node','script'], platform:'killio', exit:(c)=>{throw new Error('PROCESS_EXIT:'+(c||0));} };
      const require = (m)=>{ if(m==='fs')return fs; if(m==='path')return path; if(m==='process')return process;
        throw new Error("module '"+m+"' not available in strict isolation mode"); };
    `;
    await context.eval(shim, { timeout: opts.timeoutMs ?? 5000 });
    await context.eval(`(async()=>{ ${code} \n})()`, { timeout: opts.timeoutMs ?? 5000, promise: true });
    return { output: out.join('\n').trim() };
  } finally {
    try { isolate.dispose(); } catch {}
  }
}

/**
 * Run guest JavaScript inside a dedicated V8 context (node:vm), not in the host
 * global scope. This is a structural upgrade over `new Function(...)`, which
 * executes in the host realm and lets guest code escape via
 * `this.constructor.constructor("return process")()` or any literal's
 * constructor chain. In a separate context those chains resolve to the
 * sandbox's own global (which holds only the ported API), never the host's.
 *
 * The host-provided API (console, require, process, fetch, ...) is "ported"
 * into the context: every function is re-wrapped by context-native code and
 * every object is recursively rebuilt from primitives, so guest reflection on
 * any API member (e.g. `console.log.constructor`) resolves to the sandbox
 * realm's Function, not the host's. Return values from `require` are ported
 * too, so a mock module cannot be used as a bridge back to the host realm.
 *
 * Caveat (documented in the paper): a vm context shares the host V8 *isolate*;
 * this closes the reflection-based escapes an injected script actually uses,
 * but is not a memory-safe boundary. Hard isolation runs guest JS in a
 * separate isolate (isolated-vm) or a WASM-hosted engine (QuickJS) --- future
 * work. The Python path already has the WASM boundary.
 */
async function runInJsSandbox(body: string, api: Record<string, any>, timeoutMs = 5000): Promise<any> {
  const ctx: any = vm.createContext(Object.create(null));
  ctx.__api = api;
  // Prelude executes IN the context; rebuilds each API member context-natively so
  // that guest reflection resolves to the sandbox realm. `port` preserves method
  // receivers (so fs.promises.writeFile still has its `this`) and thenables (so
  // `await require(...)` still works), while functions and their return values
  // are re-wrapped context-side, closing the host-Function-constructor vector.
  vm.runInContext(`(function(){
    var A = __api;
    var seen = new WeakMap();
    function port(v, thisArg){
      if (v === null || typeof v === 'undefined') return v;
      var t = typeof v;
      if (t === 'function'){
        return function(){
          var recv = (this && this.__host) ? this.__host : thisArg;
          return port(v.apply(recv, Array.prototype.slice.call(arguments)));
        };
      }
      if (t === 'object'){
        if (typeof v.then === 'function'){ return Promise.resolve(v).then(function(r){ return port(r); }); }
        if (seen.has(v)) return seen.get(v);
        var o = Array.isArray(v) ? [] : {};
        seen.set(v, o);
        try { Object.defineProperty(o, '__host', { value: v, enumerable: false }); } catch(e){}
        for (var k in v){ try { o[k] = port(v[k], v); } catch(e){} }
        return o;
      }
      return v;
    }
    for (var k in A){ globalThis[k] = port(A[k]); }
    delete globalThis.__api;
  })();`, ctx);
  const runner = vm.runInContext(`(async function(){ ${body} })`, ctx, { timeout: timeoutMs });
  return await runner();
}

function transpile(code: string): string {
  return code
    .replace(/^\s*import\s+([\w\d_$]+)\s+from\s+['"]([^'"]+)['"]/gm, "const $1 = require('$2')")
    .replace(/^\s*import\s+\*\s+as\s+([\w\d_$]+)\s+from\s+['"]([^'"]+)['"]/gm, "const $1 = require('$2')")
    .replace(/^\s*import\s+\{\s*([\w\d_$,\s]+)\s*\}\s+from\s+['"]([^'"]+)['"]/gm, "const { $1 } = require('$2')")
    .replace(/^\s*import\s+['"]([^'"]+)['"]/gm, "require('$1')");
}

export const node: CommandHandler = async (args: string[], kernel: KillioKernel) => {
  if (args.length === 0) {
    return { output: 'Welcome to Node.js v22.0.0.\nType ".help" for more information.', exitCode: 0 };
  }

  if (args[0] === '-e' && args[1]) {
    try {
      const transpiledCode = transpile(args[1]);
      // Strict isolation mode: run in a separate V8 isolate with a memory cap.
      if (process.env.KILLIO_JS_ISOLATION === 'strict') {
        const strict = await runInIsolatedVm(transpiledCode, kernel, kernel.getCWD());
        if (strict) return { output: strict.output, exitCode: 0 };
      }
      const { safeConsole, mockRequire, getOutput, processMock } = createNodeEnvironment(kernel);

      // Load .env if exists in CWD
      try {
        const envContent = await kernel.readFile(kernel.getCWD() + '/.env');
        const lines = envContent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const [k, ...v] = trimmed.split('=');
          if (k && v) processMock.env[k.trim()] = v.join('=').trim();
        }
      } catch (e) {} // Ignore if .env doesn't exist

      const maskedFetch = async (input: any, init?: any) => {
        const defaultHeaders = {
          'User-Agent': 'KillioOS/1.0 (Agent)',
          'X-Forwarded-For': '10.0.0.5',
          'Via': '1.1 killio-os'
        };
        const options = init || {};
        options.headers = { ...defaultHeaders, ...(options.headers || {}) };
        return typeof fetch !== 'undefined' ? fetch(input, options) : undefined;
      };

      const result = await runInJsSandbox(transpiledCode, {
        console: safeConsole,
        require: (p: string) => mockRequire(p, kernel.getCWD()),
        fetch: typeof fetch !== 'undefined' ? maskedFetch : undefined,
        process: processMock,
        __dirname: kernel.getCWD(),
        __filename: kernel.getCWD() + '/eval.js',
      });
      let finalOut = getOutput();
      if (result !== undefined && !finalOut) finalOut += String(result);
      return { output: finalOut.trim(), exitCode: 0 };
    } catch (e: any) {
      if (e.message && e.message.startsWith('PROCESS_EXIT:')) {
        const code = parseInt(e.message.split(':')[1] || '0', 10);
        return { output: '', exitCode: code };
      }
      return { output: `Uncaught SyntaxError: ${e.message}`, exitCode: 1 };
    }
  }

  try {
    const content = await kernel.readFile(args[0]!);
    const node = await kernel.getVFS().getNode(kernel.resolvePath(args[0]!));
    const transpiledCode = transpile(content);

    // Strict isolation mode: separate V8 isolate with a memory cap.
    if (process.env.KILLIO_JS_ISOLATION === 'strict') {
      const dir = kernel.resolvePath(args[0]!).replace(/\/[^/]*$/, '') || '/';
      const strict = await runInIsolatedVm(transpiledCode, kernel, dir);
      if (strict) return { output: strict.output, exitCode: 0 };
    }

    const { safeConsole, mockRequire, getOutput, processMock } = createNodeEnvironment(kernel);

    const __filename = kernel.resolvePath(args[0]!);
    const __dirname = __filename.substring(0, __filename.lastIndexOf('/')) || '/';

    // Load .env if exists in script directory
    try {
      const envContent = await kernel.readFile(__dirname + '/.env');
      const lines = envContent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        if (k && v) processMock.env[k.trim()] = v.join('=').trim();
      }
    } catch (e) {}

    const moduleEnv = { exports: {} };

    const maskedFetch = async (input: any, init?: any) => {
      const defaultHeaders = {
        'User-Agent': 'KillioOS/1.0 (Agent)',
        'X-Forwarded-For': '10.0.0.5',
        'Via': '1.1 killio-os'
      };
      const options = init || {};
      options.headers = { ...defaultHeaders, ...(options.headers || {}) };
      return typeof fetch !== 'undefined' ? fetch(input, options) : undefined;
    };

    await runInJsSandbox(transpiledCode, {
      console: safeConsole,
      require: (p: string) => mockRequire(p, __dirname),
      module: moduleEnv,
      exports: moduleEnv.exports,
      fetch: typeof fetch !== 'undefined' ? maskedFetch : undefined,
      process: processMock,
      __dirname,
      __filename,
    });
    return { output: getOutput(), exitCode: 0 };
  } catch (e: any) {
    if (e.message && e.message.startsWith('PROCESS_EXIT:')) {
       const code = parseInt(e.message.split(':')[1] || '0', 10);
       return { output: '', exitCode: code };
    }
    return { output: `Error: ${e.message}`, exitCode: 1 };
  }
};
