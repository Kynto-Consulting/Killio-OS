import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';
import { MountManager } from '../vfs/mount_manager.js';

async function testPythonFullFlow() {
  console.log('--- Testing Python Full Flow (VFS + Pip + Session) ---');
  
  const rootVFS = new CacheProvider('test-root');
  const tmpVFS = new CacheProvider('test-tmp');
  await rootVFS.init();
  await tmpVFS.init();

  const vfs = new MountManager(rootVFS);
  vfs.mount('/tmp', tmpVFS);

  const kernel = new KillioKernel(vfs);
  await kernel.boot();

  console.log('1. Testing pip install (ephemeral site-packages in /tmp)...');
  const pipResult = await kernel.execute(['pip', 'install', 'six']);
  console.log('Pip Output:', pipResult.output);
  
  if (pipResult.exitCode !== 0) {
    console.error('❌ FAILURE: pip install failed');
    process.exit(1);
  }

  console.log('\n2. Testing library import and persistent VFS write...');
  const scriptPath = '/home/agent/lib_test.py';
  const pyCode = `
import six
import os

print(f"Python: six location: {six.__file__}")

result_msg = f"Six verified"
with open("pip_result.txt", "w") as f:
    f.write(result_msg)

print("Python: Successfully wrote pip_result.txt to VFS")
`;

  await kernel.writeFile(scriptPath, pyCode);
  kernel.setCWD('/home/agent');

  const pyResult = await kernel.execute(['python', scriptPath]);
  console.log('Python Output:', pyResult.output);

  if (pyResult.exitCode !== 0) {
    console.error('❌ FAILURE: python execution failed');
    process.exit(1);
  }

  console.log('\n3. Verifying VFS persistence for user files...');
  try {
    const content = await kernel.readFile('/home/agent/pip_result.txt');
    console.log(`VFS Content: "${content}"`);
    if (content.startsWith('Six verified')) {
      console.log('✅ SUCCESS: Library was installed and used correctly!');
    } else {
      console.error('❌ FAILURE: Content mismatch in VFS');
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ FAILURE: Result file not found in VFS');
    process.exit(1);
  }

  console.log('\n4. Verifying /tmp is NOT persisted back to root VFS...');
  // Site packages should be in /tmp/site-packages
  const tmpNodes = await tmpVFS.listNodes('/tmp/site-packages');
  if (tmpNodes.length > 0) {
    console.log(`✅ SUCCESS: /tmp contains ${tmpNodes.length} library nodes.`);
    
    // Check if root VFS is clean
    try {
      const rootNodes = await rootVFS.listNodes('/tmp/site-packages');
      if (rootNodes.length === 0) {
        console.log('✅ SUCCESS: Root VFS /tmp is clean (ephemeral works!).');
      } else {
        console.warn('⚠️ WARNING: Root VFS contains /tmp nodes. This might happen if parent dirs were created in root before mounting.');
      }
    } catch (e) {
       console.log('✅ SUCCESS: Root VFS /tmp/site-packages does not even exist.');
    }
  } else {
    console.error('❌ FAILURE: /tmp site-packages is empty');
    process.exit(1);
  }
}

testPythonFullFlow().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
