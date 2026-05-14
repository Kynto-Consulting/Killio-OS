import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';

async function inspectVFS() {
  const root = new CacheProvider('test-user');
  await root.init();
  const kernel = new KillioKernel(root);
  await kernel.boot();

  await kernel.execute('mkdir /home/agent/test');
  kernel.setCWD('/home/agent/test');
  await kernel.execute('git init');
  
  const nodes = (root as any).nodes;
  console.log('\n--- Inspecting .git ---');
  for (const [key, node] of nodes.entries()) {
    if (node.path.includes('.git')) {
      console.log(`Key: ${key}, Path: ${node.path}, Type: ${node.type}`);
    }
  }

  const listed = await kernel.execute('ls -la');
  console.log('\nls -la output:\n', listed.output);
}

inspectVFS().catch(console.error);
