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
const docx = requireHost('docx');
const { marked } = requireHost('marked');
const PDFDocument = requireHost('pdfkit');
const QuickChart = requireHost('quickchart-js');
export const createNodeEnvironment = (kernel) => {
    let logOutput = "";
    const safeConsole = {
        log: (...msgs) => { logOutput += msgs.join(" ") + "\\n"; },
        error: (...msgs) => { logOutput += msgs.join(" ") + "\\n"; },
        warn: (...msgs) => { logOutput += msgs.join(" ") + "\\n"; }
    };
    const processMock = {
        env: kernel.getAllEnv(),
        cwd: () => kernel.getCWD(),
        exit: (code = 0) => { throw new Error(`PROCESS_EXIT:${code}`); },
        stdout: { write: (str) => { logOutput += str; } },
        stderr: { write: (str) => { logOutput += str; } },
        platform: 'linux',
        arch: 'x64',
        version: 'v22.0.0',
        versions: { node: '22.0.0' },
        nextTick: (cb, ...args) => setTimeout(cb, 0, ...args)
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
    const mockRequire = (modulePath, currentPath = kernel.getCWD()) => {
        if (modulePath === 'fs' || modulePath === 'node:fs')
            return fsMock;
        if (modulePath === 'path' || modulePath === 'node:path')
            return pathMock;
        if (modulePath === 'os' || modulePath === 'node:os')
            return osMock;
        if (modulePath === 'child_process' || modulePath === 'node:child_process')
            return childProcessMock;
        if (modulePath === 'events' || modulePath === 'node:events')
            return eventsMock;
        if (modulePath === 'util' || modulePath === 'node:util')
            return utilMock;
        if (modulePath === 'buffer' || modulePath === 'node:buffer')
            return bufferMock;
        if (modulePath === 'url' || modulePath === 'node:url')
            return urlMock;
        if (modulePath === 'querystring' || modulePath === 'node:querystring')
            return querystringMock;
        if (modulePath === 'http' || modulePath === 'node:http')
            return httpMock;
        if (modulePath === 'https' || modulePath === 'node:https')
            return httpsMock;
        if (modulePath === 'zlib' || modulePath === 'node:zlib')
            return zlibMock;
        if (modulePath === 'adm-zip')
            return AdmZip;
        if (modulePath === 'docx')
            return docx;
        if (modulePath === 'marked')
            return { marked };
        if (modulePath === 'pdfkit')
            return PDFDocument;
        if (modulePath === 'quickchart-js')
            return QuickChart;
        // For VFS modules, we still need to be async
        return (async () => {
            let resolvedPath = modulePath;
            if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
                const parts = currentPath.split('/').filter(Boolean);
                if (modulePath.startsWith('../')) {
                    parts.pop();
                    resolvedPath = '/' + parts.join('/') + '/' + modulePath.slice(3);
                }
                else {
                    resolvedPath = currentPath + '/' + modulePath.slice(2);
                }
                resolvedPath = resolvedPath.replace(/\/+/g, '/');
            }
            else if (!modulePath.startsWith('/')) {
                resolvedPath = currentPath + '/' + modulePath;
            }
            let content = '';
            let finalResolved = resolvedPath;
            try {
                content = await kernel.readFile(resolvedPath);
            }
            catch (e) {
                try {
                    content = await kernel.readFile(resolvedPath + '.js');
                    finalResolved = resolvedPath + '.js';
                }
                catch (e2) {
                    throw new Error(`Cannot find module '${modulePath}'`);
                }
            }
            const node = await kernel.getVFS().getNode(kernel.resolvePath(finalResolved));
            const moduleEnv = { exports: {} };
            const __filename = finalResolved;
            const __dirname = finalResolved.substring(0, finalResolved.lastIndexOf('/')) || '/';
            const fn = new Function('console', 'require', 'module', 'exports', 'fetch', 'Headers', 'Request', 'Response', 'process', '__dirname', '__filename', `
        return (async () => {
          ${content}
        })();
      `);
            const maskedFetch = async (input, init) => {
                const defaultHeaders = {
                    'User-Agent': 'KillioOS/1.0 (Agent)',
                    'X-Forwarded-For': '10.0.0.5',
                    'Via': '1.1 killio-os'
                };
                const options = init || {};
                options.headers = { ...defaultHeaders, ...(options.headers || {}) };
                return typeof fetch !== 'undefined' ? fetch(input, options) : undefined;
            };
            await fn(safeConsole, (p) => mockRequire(p, resolvedPath.substring(0, resolvedPath.lastIndexOf('/'))), moduleEnv, moduleEnv.exports, typeof fetch !== 'undefined' ? maskedFetch : undefined, typeof Headers !== 'undefined' ? Headers : undefined, typeof Request !== 'undefined' ? Request : undefined, typeof Response !== 'undefined' ? Response : undefined, processMock, __dirname, __filename);
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
//# sourceMappingURL=index.js.map