import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';
import { MountManager } from '../vfs/mount_manager.js';

async function testKpmAndMount() {
  console.log('--- Starting KPM and Mount Tests ---');
  
  const rootProvider = new CacheProvider('test-owner');
  await rootProvider.init();
  
  const kernel = new KillioKernel(rootProvider);
  await kernel.boot();

  console.log('\n1. Testing Mounts...');
  const mountRes = await kernel.execute('mount');
  console.log(mountRes.output);

  console.log('\n2. Testing /tmp Ephemerality...');
  await kernel.execute('write_file /tmp/test.txt "hello tmp"');
  const lsTmp = await kernel.execute('ls /tmp');
  console.log('ls /tmp:', lsTmp.output);

  console.log('\n3. Testing KPM Search...');
  const searchRes = await kernel.execute('kpm search tool');
  console.log(searchRes.output);

  console.log('\n4. Testing KPM Install...');
  await kernel.execute('kpm install compress');
  const installRes = await kernel.execute('kpm install crypt');
  console.log(installRes.output);

  console.log('\n5. Testing Command Resolution ($PATH) & Real Logic...');
  const runResWasm = await kernel.execute('compress some large data');
  console.log('WASM (Compress) Output:', runResWasm.output);
  
  const runResHash = await kernel.execute('crypt hash killio-os');
  console.log('JS (Crypt Hash) Output:', runResHash.output);

  const runResEnc = await kernel.execute('crypt encrypt "hello world" my-secret-key');
  console.log('JS (Crypt Encrypt) Output:', runResEnc.output);
  
  const encText = runResEnc.output.split(': ')[1];
  const runResDec = await kernel.execute(`crypt decrypt ${encText} my-secret-key`);
  console.log('JS (Crypt Decrypt) Output:', runResDec.output);

  console.log('\n5b. Testing VFS-Aware File Encryption...');
  await kernel.execute('write_file /home/secret.txt "this is a top secret message"');
  const fileEncRes = await kernel.execute('crypt file-encrypt /home/secret.txt my-password');
  console.log(fileEncRes.output);
  
  const lsHome = await kernel.execute('ls /home');
  console.log('ls /home:', lsHome.output);

  console.log('\n6. Testing KPM List...');
  const listRes = await kernel.execute('kpm list');
  console.log(listRes.output);

  console.log('\n--- Tests Completed ---');
}

testKpmAndMount().catch(console.error);
