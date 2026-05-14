import { KillioKernel } from '../../../kernel.js';
export declare const createOsMock: (kernel: KillioKernel) => {
    platform: () => string;
    arch: () => string;
    release: () => string;
    type: () => string;
    hostname: () => string;
    userInfo: () => {
        username: string;
        uid: number;
        gid: number;
        homedir: string;
        shell: string;
    };
    totalmem: () => number;
    freemem: () => number;
    cpus: () => any[];
    homedir: () => string;
    tmpdir: () => string;
};
//# sourceMappingURL=os.d.ts.map