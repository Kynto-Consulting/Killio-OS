import type { CommandHandler, KillioKernel } from '../kernel.js';
import { createNodeEnvironment } from '../utils/node/index.js';

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

      const transpiledCode = transpile(args[1]);
      const fn = new Function('console', 'require', 'fetch', 'Headers', 'Request', 'Response', 'process', '__dirname', '__filename', `
        return (async () => {
          ${transpiledCode}
        })();
      `);
      
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

      const result = await fn(
        safeConsole, 
        (p: string) => mockRequire(p, kernel.getCWD()),
        typeof fetch !== 'undefined' ? maskedFetch : undefined,
        typeof Headers !== 'undefined' ? Headers : undefined,
        typeof Request !== 'undefined' ? Request : undefined,
        typeof Response !== 'undefined' ? Response : undefined,
        processMock,
        kernel.getCWD(),
        kernel.getCWD() + '/eval.js'
      );
      let finalOut = getOutput();
      if (result !== undefined && !finalOut) finalOut += String(result);
      return { output: finalOut.trim(), exitCode: 0 };
    } catch (e: any) {
      return { output: `Uncaught SyntaxError: ${e.message}`, exitCode: 1 };
    }
  }

  try {
    const content = await kernel.readFile(args[0]!);
    const node = await kernel.getVFS().getNode(kernel.resolvePath(args[0]!));
    const { safeConsole, mockRequire, getOutput, processMock } = createNodeEnvironment(kernel);
    const transpiledCode = transpile(content);
    
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

    const fn = new Function('console', 'require', 'module', 'exports', 'fetch', 'Headers', 'Request', 'Response', 'process', '__dirname', '__filename', `
      return (async () => {
        ${transpiledCode}
      })();
    `);
    
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

    await fn(
      safeConsole, 
      (p: string) => mockRequire(p, __dirname), 
      moduleEnv, 
      moduleEnv.exports,
      typeof fetch !== 'undefined' ? maskedFetch : undefined,
      typeof Headers !== 'undefined' ? Headers : undefined,
      typeof Request !== 'undefined' ? Request : undefined,
      typeof Response !== 'undefined' ? Response : undefined,
      processMock,
      __dirname,
      __filename
    );
    return { output: getOutput(), exitCode: 0 };
  } catch (e: any) {
    if (e.message && e.message.startsWith('PROCESS_EXIT:')) {
       const code = parseInt(e.message.split(':')[1] || '0', 10);
       return { output: '', exitCode: code };
    }
    return { output: `Error: ${e.message}`, exitCode: 1 };
  }
};
