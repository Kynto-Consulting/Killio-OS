import { KillioKernel } from '../../../kernel.js';
export declare const createFsMock: (kernel: KillioKernel, eventsMock: any) => {
    readFileSync: (path: string, encoding?: string) => Promise<string | Buffer<ArrayBuffer>>;
    writeFileSync: (path: string, data: any, options?: any) => Promise<void>;
    writeFile: (path: string, data: any, options?: any) => Promise<void>;
    readFile: (path: string, encoding?: string) => Promise<string | Buffer<ArrayBuffer>>;
    existsSync: (path: string) => Promise<boolean>;
    mkdirSync: (path: string) => Promise<void>;
    promises: {
        readFile: (path: string, encoding?: string) => Promise<string | Buffer<ArrayBuffer>>;
        writeFile: (path: string, data: any, options?: any) => Promise<void>;
        readdir: (path: string) => Promise<string[]>;
    };
    createWriteStream: (path: string) => any;
};
//# sourceMappingURL=fs.d.ts.map