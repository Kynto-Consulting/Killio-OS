import { KillioKernel } from '../../../kernel.js';
export const createChildProcessMock = (kernel) => {
    return {
        execSync: (command) => {
            // Since our kernel is async but execSync is supposed to be sync,
            // in a mocked async environment we might have to throw or return a placeholder if we strictly adhere to sync.
            // However, we can expose it as an async-compatible wrapper or just throw.
            throw new Error('execSync is not supported in Killio-OS Node runtime. Use await exec() instead.');
        },
        exec: async (command, callback) => {
            try {
                const tokens = command.split(' ').filter(Boolean);
                const result = await kernel.execute(tokens);
                if (callback) {
                    if (result.exitCode !== 0) {
                        callback(new Error(`Command failed with exit code ${result.exitCode}: ${result.output}`), result.output, '');
                    }
                    else {
                        callback(null, result.output, '');
                    }
                }
                return result.output;
            }
            catch (err) {
                if (callback)
                    callback(err, '', err.message);
                throw err;
            }
        }
    };
};
//# sourceMappingURL=child_process.js.map