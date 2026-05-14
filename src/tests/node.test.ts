import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';
import assert from 'node:assert';

async function testNodeVFSResolution() {
  console.log('🤖 Starting node.ts VFS module resolution test...');
  
  const vfs = new CacheProvider('test-owner');
  const kernel = new KillioKernel(vfs);
  await kernel.boot();

  // Create a math module in the VFS
  await kernel.execute([
    'write_file', 
    '/home/agent/math.js', 
    'module.exports = { add: (a, b) => a + b, mul: (a, b) => a * b };'
  ]);

  // Create a nested module
  await kernel.execute(['mkdir', '/home/agent/utils']);
  await kernel.execute([
    'write_file', 
    '/home/agent/utils/format.js', 
    'module.exports = { bold: (str) => `**${str}**` };'
  ]);

  // Create the main app that requires both and uses fs
  const appCode = `
    const math = await require('./math');
    const format = await require('./utils/format.js');
    const fs = await require('fs');
    
    const sum = math.add(5, 7);
    const product = math.mul(3, 4);
    
    // Test the fs mock by writing and reading a file to VFS
    await fs.promises.writeFile('/home/agent/fs-test.txt', 'Hello from mocked fs!');
    const fileContent = await fs.promises.readFile('/home/agent/fs-test.txt');
    
    console.log("Sum:", sum);
    console.log("Product:", product);
    console.log("Formatted:", format.bold("Killio-OS"));
    console.log("FS Read:", fileContent);
  `;

  await kernel.execute(['write_file', '/home/agent/app.js', appCode]);

  console.log('📦 Executing app.js via mock node...');
  const result = await kernel.execute(['node', '/home/agent/app.js']);
  
  console.log('--- OUTPUT ---');
  console.log(result.output);
  console.log('--------------');

  assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
  assert.ok(result.output.includes('Sum: 12'), 'Should calculate sum correctly via math.js');
  assert.ok(result.output.includes('Product: 12'), 'Should calculate product correctly via math.js');
  assert.ok(result.output.includes('Formatted: **Killio-OS**'), 'Should resolve nested relative paths correctly');
  assert.ok(result.output.includes('FS Read: Hello from mocked fs!'), 'Should correctly write and read files via mock fs');

  console.log('✅ node.ts VFS module resolution test passed successfully!');
}

testNodeVFSResolution().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
