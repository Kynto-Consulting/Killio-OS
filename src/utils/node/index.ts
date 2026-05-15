import { KillioKernel } from '../../kernel.js';
import { createFsMock } from './modules/fs.js';
import { createPathMock } from './modules/path.js';
import { createOsMock } from './modules/os.js';
import { createChildProcessMock } from './modules/child_process.js';
import { createEventsMock } from './modules/events.js';
import { createUtilMock } from './modules/util.js';
import { createBufferMock } from './modules/buffer.js';
import { createUrlMock } from './modules/url.js';
import { createQueryStringMock } from './modules/querystring.js';
import { createHttpMock } from './modules/http.js';
import { createHttpsMock } from './modules/https.js';
import * as zlibMock from 'zlib';
import AdmZip from 'adm-zip';
import { createRequire } from 'module';

const requireHost = createRequire(import.meta.url);

// Lazy-loaded modules to avoid crashes if they are missing in the host environment (e.g. Serverless)
let docx: any;
let marked: any;
let PDFDocument: any;
let QuickChart: any;

const getDocx = () => { 
  if (!docx) {
    try { docx = requireHost('docx'); } catch(e) {
      try { docx = requireHost('../../node_modules/docx'); } catch(e2) {}
    }
    if (!docx) console.warn('[Killio-OS] docx module not found. Document generation will be disabled.');
  }
  return docx; 
};

const getMarked = () => { 
  if (!marked) {
    try { marked = requireHost('marked').marked; } catch(e) {
      try { marked = requireHost('../../node_modules/marked').marked; } catch(e2) {}
    }
    if (!marked) console.warn('[Killio-OS] marked module not found. Markdown parsing will be limited.');
  }
  return marked; 
};

const getPdfKit = () => { 
  if (!PDFDocument) {
    try { PDFDocument = requireHost('pdfkit'); } catch(e) {
      try { PDFDocument = requireHost('../../node_modules/pdfkit'); } catch(e2) {}
    }
    if (!PDFDocument) console.warn('[Killio-OS] pdfkit module not found. PDF generation will be disabled.');
  }
  return PDFDocument; 
};

const getQuickChart = () => { 
  if (!QuickChart) {
    try { QuickChart = requireHost('quickchart-js'); } catch(e) {
      try { QuickChart = requireHost('../../node_modules/quickchart-js'); } catch(e2) {}
    }
    if (!QuickChart) console.warn('[Killio-OS] quickchart-js module not found. Chart generation will be disabled.');
  }
  return QuickChart; 
};

export const createNodeEnvironment = (kernel: KillioKernel) => {
  let logOutput = "";
  const safeConsole = {
    log: (...msgs: any[]) => { logOutput += msgs.join(" ") + "\\n"; },
    error: (...msgs: any[]) => { logOutput += msgs.join(" ") + "\\n"; },
    warn: (...msgs: any[]) => { logOutput += msgs.join(" ") + "\\n"; }
  };

  const processMock = {
    env: kernel.getAllEnv(),
    cwd: () => kernel.getCWD(),
    exit: (code = 0) => { throw new Error(`PROCESS_EXIT:${code}`); },
    stdout: { write: (str: string) => { logOutput += str; } },
    stderr: { write: (str: string) => { logOutput += str; } },
    platform: 'linux',
    arch: 'x64',
    version: 'v22.0.0',
    versions: { node: '22.0.0' },
    nextTick: (cb: (...args: any[]) => void, ...args: any[]) => setTimeout(cb, 0, ...args)
  };

  const eventsMock = createEventsMock();
  const fsMock = createFsMock(kernel, eventsMock);
  const pathMock = createPathMock();
  const osMock = createOsMock(kernel);
  const childProcessMock = createChildProcessMock(kernel);
  const utilMock = createUtilMock();
  const bufferMock = createBufferMock();
  const urlMock = createUrlMock();
  const querystringMock = createQueryStringMock();
  const httpMock = createHttpMock();
  const httpsMock = createHttpsMock();

  const mockRequire = (modulePath: string, currentPath: string = kernel.getCWD()): any => {
    if (modulePath === 'fs' || modulePath === 'node:fs') return fsMock;
    if (modulePath === 'path' || modulePath === 'node:path') return pathMock;
    if (modulePath === 'os' || modulePath === 'node:os') return osMock;
    if (modulePath === 'child_process' || modulePath === 'node:child_process') return childProcessMock;
    if (modulePath === 'events' || modulePath === 'node:events') return eventsMock;
    if (modulePath === 'util' || modulePath === 'node:util') return utilMock;
    if (modulePath === 'buffer' || modulePath === 'node:buffer') return bufferMock;
    if (modulePath === 'url' || modulePath === 'node:url') return urlMock;
    if (modulePath === 'querystring' || modulePath === 'node:querystring') return querystringMock;
    if (modulePath === 'http' || modulePath === 'node:http') return httpMock;
    if (modulePath === 'https' || modulePath === 'node:https') return httpsMock;
    if (modulePath === 'zlib' || modulePath === 'node:zlib') return zlibMock;
    if (modulePath === 'adm-zip') return AdmZip;
    if (modulePath === 'docx') return getDocx();
    if (modulePath === 'marked') return { marked: getMarked() };
    if (modulePath === 'pdfkit') return getPdfKit();
    if (modulePath === 'quickchart-js') return getQuickChart();

    // For VFS modules, we still need to be async
    return (async () => {
      let resolvedPath = modulePath;
      if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
        const parts = currentPath.split('/').filter(Boolean);
        if (modulePath.startsWith('../')) {
          parts.pop();
          resolvedPath = '/' + parts.join('/') + '/' + modulePath.slice(3);
        } else {
          resolvedPath = currentPath + '/' + modulePath.slice(2);
        }
        resolvedPath = resolvedPath.replace(/\/+/g, '/');
      } else if (!modulePath.startsWith('/')) {
        resolvedPath = currentPath + '/' + modulePath;
      }

      let content = '';
      let finalResolved = resolvedPath;
      try {
        content = await kernel.readFile(resolvedPath);
      } catch (e) {
        try {
          content = await kernel.readFile(resolvedPath + '.js');
          finalResolved = resolvedPath + '.js';
        } catch (e2) {
          throw new Error(`Cannot find module '${modulePath}'`);
        }
      }

      const node = await kernel.getVFS().getNode(kernel.resolvePath(finalResolved));
      const moduleEnv = { exports: {} as any };
      const __filename = finalResolved;
      const __dirname = finalResolved.substring(0, finalResolved.lastIndexOf('/')) || '/';

      const fn = new Function('console', 'require', 'module', 'exports', 'fetch', 'Headers', 'Request', 'Response', 'process', '__dirname', '__filename', `
        return (async () => {
          ${content}
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
        (p: string) => mockRequire(p, resolvedPath.substring(0, resolvedPath.lastIndexOf('/'))),
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
      return moduleEnv.exports;
    })();
  };

  return {
    safeConsole,
    mockRequire,
    getOutput: () => logOutput.trim(),
    processMock
  };
};
