import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';

async function runBashIntegrationTests() {
  const vfs = new CacheProvider();
  const kernel = new KillioKernel(vfs);
  await kernel.boot();

  console.log('=== Killio-OS Bash Integration Tests ===\n');

  // Test 1: Simple -c execution
  console.log('[Test 1] bash -c "echo testing..."');
  const res1 = await kernel.execute(['bash', '-c', 'echo testing_integration']);
  if (res1.output.includes('testing_integration') && res1.exitCode === 0) {
    console.log('✅ Passed');
  } else {
    console.log('❌ Failed:', res1.output);
  }

  // Test 2: Script file with multiple lines and comments
  console.log('\n[Test 2] Executing script file with comments');
  const scriptContent = `
# This is a comment
echo starting
mkdir /scripts
touch /scripts/run.log
echo finished
  `.trim();
  await kernel.execute(['write_file', '/test_script.sh', scriptContent]);
  const res2 = await kernel.execute(['sh', '/test_script.sh']);

  const dirExists = await kernel.getVFS().getNode('/scripts');
  if (res2.exitCode === 0 && dirExists && res2.output.includes('starting') && res2.output.includes('finished')) {
    console.log('✅ Passed');
  } else {
    console.log('❌ Failed:', res2.output);
  }

  // Test 3: Stop on error (set -e behavior)
  console.log('\n[Test 3] Script should stop on command failure');
  const failingScript = `
echo step_1
invalid_command_here
echo step_2
  `.trim();
  await kernel.execute(['write_file', '/fail.sh', failingScript]);
  const res3 = await kernel.execute(['sh', '/fail.sh']);

  if (res3.exitCode === 127 && res3.output.includes('step_1') && !res3.output.includes('step_2')) {
    console.log('✅ Passed (Stopped at error)');
  } else {
    console.log('❌ Failed: Script did not stop or output is wrong');
    console.log('Output:', res3.output);
  }

  // Test 4: Environment variables in bash
  console.log('\n[Test 4] Environment variables in scripts');
  await kernel.execute(['env', 'APP_VERSION=2.0.0']);
  const envScript = `
echo VERSION is
whoami
env
  `.trim();
  await kernel.execute(['write_file', '/env_test.sh', envScript]);
  const res4 = await kernel.execute(['bash', '/env_test.sh']);

  if (res4.output.includes('APP_VERSION=2.0.0')) {
    console.log('✅ Passed');
  } else {
    console.log('❌ Failed: Env var not found');
  }

  console.log('\n=== All Integration Tests Completed ===');
}

runBashIntegrationTests().catch(console.error);
