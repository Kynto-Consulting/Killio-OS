import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';

async function runTest() {
  const kernel = new KillioKernel(new CacheProvider('test-user'));
  await kernel.boot();
  kernel.setCWD('/home/agent');
  
  console.log('--- Testing npm mock ---');
  const npmRes = await kernel.execute(['npm', 'list']);
  console.log('npm list output:\n', npmRes.output);

  const npmInstallRes = await kernel.execute(['npm', 'install', 'express']);
  console.log('npm install output:\n', npmInstallRes.output);

  console.log('\n--- Testing .env loading ---');
  await kernel.execute(['write_file', '.env', 'FOO=bar\nBAZ=qux']);
  
  const nodeRes = await kernel.execute(['node', '-e', 'console.log("FOO is", process.env.FOO); console.log("BAZ is", process.env.BAZ);']);
  console.log('node output:\n', nodeRes.output);
}

runTest();
