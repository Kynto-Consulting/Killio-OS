import { KillioKernel, CacheProvider } from './src/index.js';
import dotenv from 'dotenv';

async function test() {
  const provider = new CacheProvider();
  await provider.init();
  
  const kernel = new KillioKernel(provider);
  await kernel.boot();

  console.log('--- Testing Killio-OS ---');

  // Test 1: pwd
  const res1 = await kernel.execute(['pwd']);
  console.log('pwd:', res1.output);

  // Test 2: mkdir
  const res2 = await kernel.execute(['mkdir', '/home/agent/workspace']);
  console.log('mkdir:', res2.output);

  // Test 3: write_file
  const res3 = await kernel.execute(['write_file', '/home/agent/workspace/hello.txt', 'Hello from Killio-OS Kernel!']);
  console.log('write_file:', res3.output);

  // Test 4: ls
  const res4 = await kernel.execute(['ls', '/home/agent/workspace']);
  console.log('ls workspace:\n', res4.output);

  // Test 5: cat
  const res5 = await kernel.execute(['cat', '/home/agent/workspace/hello.txt']);
  console.log('cat hello.txt:', res5.output);

  // Test 6: env
  const res6 = await kernel.execute(['env', 'OS_VERSION=1.0.0-alpha']);
  console.log('env set:', res6.output);
  
  const res7 = await kernel.execute(['env']);
  console.log('env list:\n', res7.output);

  // Test 7: cd
  const res8 = await kernel.execute(['cd', '/home/agent/workspace']);
  console.log('cd:', res8.output);
  
  const res9 = await kernel.execute(['pwd']);
  console.log('pwd after cd:', res9.output);

  console.log('--- Test Completed ---');
}

test().catch(console.error);
