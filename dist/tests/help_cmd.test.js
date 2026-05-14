import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';
async function testHelpCommand() {
    const vfs = new CacheProvider();
    const kernel = new KillioKernel(vfs);
    await kernel.boot();
    console.log('--- Testing Help Command ---');
    const res = await kernel.execute(['help']);
    console.log('Output:\n', res.output);
    console.log('Exit Code:', res.exitCode);
}
testHelpCommand().catch(console.error);
//# sourceMappingURL=help_cmd.test.js.map