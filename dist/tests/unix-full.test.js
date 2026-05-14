import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';
async function runTest() {
    console.log('🚀 Starting Unix Command Test Suite...\n');
    const provider = new CacheProvider();
    await provider.init();
    const kernel = new KillioKernel(provider);
    await kernel.boot();
    const testSteps = [
        { cmd: ['whoami'], expected: 'agent' },
        { cmd: ['hostname'], expected: 'killio-os' },
        { cmd: ['pwd'], expected: '/' },
        { cmd: ['mkdir', '-p', '/home/agent/docs/work'], expected: '' },
        { cmd: ['cd', '/home/agent/docs'], expected: 'Changed directory to /home/agent/docs' },
        { cmd: ['pwd'], expected: '/home/agent/docs' },
        { cmd: ['touch', 'notes.txt', 'todo.md'], expected: '' },
        { cmd: ['write_file', 'notes.txt', 'Hello Killio OS!'], expected: (out) => out.includes('Updated file') || out.includes('Wrote to file') },
        { cmd: ['cat', 'notes.txt'], expected: 'Hello Killio OS!' },
        { cmd: ['ls', '-l'], expected: (out) => out.includes('notes.txt') && out.includes('todo.md') },
        { cmd: ['cp', 'notes.txt', 'backup.txt'], expected: '' },
        { cmd: ['ls'], expected: (out) => out.includes('backup.txt') },
        { cmd: ['mv', 'backup.txt', 'old_notes.txt'], expected: '' },
        { cmd: ['ls'], expected: (out) => !out.includes('backup.txt') && out.includes('old_notes.txt') },
        { cmd: ['grep', 'Killio'], expected: (out) => out.includes('Hello Killio OS!') },
        { cmd: ['echo', 'Final', 'Test'], expected: 'Final Test' },
        { cmd: ['history'], expected: (out) => out.includes('whoami') && out.includes('history') },
        { cmd: ['rm', 'old_notes.txt'], expected: '' },
        { cmd: ['ls'], expected: (out) => !out.includes('old_notes.txt') },
        { cmd: ['cd', '/'], expected: 'Changed directory to /' },
        { cmd: ['rm', '-rf', '/home/agent/docs'], expected: '' },
        { cmd: ['ls', '/home/agent'], expected: (out) => !out.includes('docs') },
    ];
    let passed = 0;
    for (const step of testSteps) {
        const result = await kernel.execute(step.cmd);
        let isOk = false;
        if (typeof step.expected === 'function') {
            isOk = step.expected(result.output);
        }
        else {
            isOk = result.output.trim() === step.expected;
        }
        if (isOk) {
            console.log(`✅ PASS: ${step.cmd.join(' ')}`);
            passed++;
        }
        else {
            console.error(`❌ FAIL: ${step.cmd.join(' ')}`);
            console.error(`   Expected: ${step.expected}`);
            console.error(`   Actual:   "${result.output}"`);
        }
    }
    console.log(`\n📊 Test Results: ${passed}/${testSteps.length} passed.`);
}
runTest().catch(console.error);
//# sourceMappingURL=unix-full.test.js.map