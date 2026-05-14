import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';

async function testUserManagement() {
  console.log('--- Starting User Management Tests ---');
  const provider = new CacheProvider('test-user-sys');
  await provider.init();
  const kernel = new KillioKernel(provider);
  await kernel.boot();

  console.log('\n1. Testing Default User...');
  const who1 = await kernel.execute('whoami');
  console.log('whoami:', who1.output); // agent

  console.log('\n2. Testing Hostname...');
  console.log('Current hostname:', (await kernel.execute('hostname')).output);
  await kernel.execute('hostname arubik-os');
  console.log('New hostname:', (await kernel.execute('hostname')).output);

  console.log('\n3. Testing SU (Switch User)...');
  await kernel.execute('su root');
  const who2 = await kernel.execute('whoami');
  console.log('whoami (after su root):', who2.output); // root
  console.log('CWD:', kernel.getCWD());
  console.log('HOME:', kernel.getEnv('HOME'));

  console.log('\n4. Testing SUDO...');
  await kernel.execute('su agent');
  console.log('Back to:', (await kernel.execute('whoami')).output);
  
  const sudoRes = await kernel.execute('sudo whoami');
  console.log('sudo whoami:', sudoRes.output); // root
  console.log('Back to (after sudo):', (await kernel.execute('whoami')).output); // agent

  console.log('\n4b. Testing SUDO SU...');
  await kernel.execute('sudo su root');
  console.log('User after sudo su:', (await kernel.execute('whoami')).output); // root

  console.log('\n5. Testing System Config Files...');
  const catPasswd = await kernel.execute('cat /etc/passwd');
  console.log('/etc/passwd content:\n', catPasswd.output);
  
  const catHostname = await kernel.execute('cat /etc/hostname');
  console.log('/etc/hostname content:', catHostname.output);

  console.log('\n--- User Management Tests Completed ---');
}

testUserManagement().catch(console.error);
