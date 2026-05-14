import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';
async function testShCommand() {
    const vfs = new CacheProvider();
    const kernel = new KillioKernel(vfs);
    await kernel.boot();
    console.log('--- Testing sh -c ---');
    const res1 = await kernel.execute(['sh', '-c', 'echo hello world && pwd']);
    console.log('Output:', res1.output);
    console.log('Exit Code:', res1.exitCode);
    console.log('\n--- Testing sh script.sh ---');
    await kernel.execute(['write_file', '/test.sh', 'echo line 1\necho line 2\npwd']);
    const res2 = await kernel.execute(['sh', '/test.sh']);
    console.log('Output:\n', res2.output);
    console.log('Exit Code:', res2.exitCode);
    console.log('\n--- Testing bash alias ---');
    const res3 = await kernel.execute(['bash', '-c', 'uptime']);
    console.log('Output:', res3.output);
    console.log('Exit Code:', res3.exitCode);
}
testShCommand().catch(console.error);
//# sourceMappingURL=sh_cmd.test.js.map