import { KillioKernel } from '../../../kernel.js';
export const createOsMock = (kernel) => {
    return {
        platform: () => 'killio',
        arch: () => 'x64',
        release: () => '1.0.0',
        type: () => 'KillioOS',
        hostname: () => kernel.getEnv('HOSTNAME') || 'killio-os',
        userInfo: () => ({
            username: kernel.getEnv('USER') || 'agent',
            uid: 1000,
            gid: 1000,
            homedir: kernel.getEnv('HOME') || '/home/agent',
            shell: '/bin/bash'
        }),
        totalmem: () => 16384000 * 1024,
        freemem: () => 8192000 * 1024,
        cpus: () => Array(4).fill({ model: 'Killio Virtual CPU', speed: 4200 }),
        homedir: () => kernel.getEnv('HOME') || '/home/agent',
        tmpdir: () => '/tmp'
    };
};
//# sourceMappingURL=os.js.map