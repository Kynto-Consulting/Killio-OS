import { KillioKernel } from '../../kernel.js';
export declare const createNodeEnvironment: (kernel: KillioKernel) => {
    safeConsole: {
        log: (...msgs: any[]) => void;
        error: (...msgs: any[]) => void;
        warn: (...msgs: any[]) => void;
    };
    mockRequire: (modulePath: string, currentPath?: string) => any;
    getOutput: () => string;
    processMock: {
        env: Record<string, string>;
        cwd: () => string;
        exit: (code?: number) => never;
        stdout: {
            write: (str: string) => void;
        };
        stderr: {
            write: (str: string) => void;
        };
        platform: string;
        arch: string;
        version: string;
        versions: {
            node: string;
        };
        nextTick: (cb: (...args: any[]) => void, ...args: any[]) => NodeJS.Timeout;
    };
};
//# sourceMappingURL=index.d.ts.map