import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';
async function testChaining() {
    const vfs = new CacheProvider();
    const kernel = new KillioKernel(vfs);
    await kernel.boot();
    console.log('--- Testing Semicolon Chaining ---');
    const res1 = await kernel.execute(['echo', 'hello', ';', 'echo', 'world']);
    console.log('Result:', res1.output);
    if (res1.output === 'hello\nworld') {
        console.log('✅ Semicolon test passed');
    }
    else {
        console.log('❌ Semicolon test failed');
    }
    console.log('\n--- Testing Double Ampersand (Success) ---');
    const res2 = await kernel.execute(['echo', 'first', '&&', 'echo', 'second']);
    console.log('Result:', res2.output);
    if (res2.output === 'first\nsecond') {
        console.log('✅ && Success test passed');
    }
    else {
        console.log('❌ && Success test failed');
    }
    console.log('\n--- Testing Double Ampersand (Failure) ---');
    const res3 = await kernel.execute(['ls', 'non-existent', '&&', 'echo', 'should-not-see']);
    console.log('Result:', res3.output);
    if (!res3.output.includes('should-not-see')) {
        console.log('✅ && Failure test passed');
    }
    else {
        console.log('❌ && Failure test failed');
    }
    console.log('\n--- Testing Double Pipe (Failure then Success) ---');
    const res4 = await kernel.execute(['ls', 'non-existent', '||', 'echo', 'recovered']);
    console.log('Result:', res4.output);
    if (res4.output.includes('recovered')) {
        console.log('✅ || test passed');
    }
    else {
        console.log('❌ || test failed');
    }
    console.log('\n--- Testing head and tail ---');
    await kernel.execute(['cd', '/home/agent']); // root '/' is read-only; write in HOME
    await kernel.execute(['write_file', 'test.txt', 'line1\nline2\nline3\nline4\nline5']);
    const res5 = await kernel.execute(['head', '-n', '2', 'test.txt']);
    console.log('Head result:', res5.output);
    if (res5.output === 'line1\nline2') {
        console.log('✅ head test passed');
    }
    else {
        console.log('❌ head test failed');
    }
    const res6 = await kernel.execute(['tail', '-n', '2', 'test.txt']);
    console.log('Tail result:', res6.output);
    if (res6.output === 'line4\nline5') {
        console.log('✅ tail test passed');
    }
    else {
        console.log('❌ tail test failed');
    }
    console.log('\n--- Testing stat ---');
    const res7 = await kernel.execute(['stat', 'test.txt']);
    console.log('Stat result:\n', res7.output);
    if (res7.output.includes('File: test.txt') && res7.output.includes('Type: file')) {
        console.log('✅ stat test passed');
    }
    else {
        console.log('❌ stat test failed');
    }
}
testChaining().catch(console.error);
//# sourceMappingURL=chaining.test.js.map