import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';

async function testGlobbing() {
  console.log('--- Starting Globbing Tests ---');
  const provider = new CacheProvider('test-glob');
  await provider.init();
  const kernel = new KillioKernel(provider);
  await kernel.boot();

  await kernel.execute('touch file1.txt file2.txt notes.md');
  console.log('Files created: file1.txt, file2.txt, notes.md');

  console.log('\n0. Testing ls -la /...');
  const res0 = await kernel.execute('ls -la /');
  console.log('ls -la /:\n', res0.output);

  console.log('\n1. Testing * expansion...');
  const res1 = await kernel.execute('echo *');
  console.log('echo *:', res1.output); 

  console.log('\n2. Testing file*.txt expansion...');
  const res2 = await kernel.execute('echo file*.txt');
  console.log('echo file*.txt:', res2.output); 

  console.log('\n3. Testing ls / listing mount points...');
  const res3 = await kernel.execute('ls /');
  console.log('ls /:\n', res3.output); // Should show /bin, /home, /etc, /tmp

  console.log('\n--- Globbing Tests Completed ---');
}

testGlobbing().catch(console.error);
