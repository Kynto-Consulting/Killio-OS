import { KillioKernel } from '../../../kernel.js';
export declare const createChildProcessMock: (kernel: KillioKernel) => {
    execSync: (command: string) => never;
    exec: (command: string, callback?: (error: any, stdout: string, stderr: string) => void) => Promise<string>;
};
//# sourceMappingURL=child_process.d.ts.map