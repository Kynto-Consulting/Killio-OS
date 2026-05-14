import { KillioKernel } from './src/kernel.js';
import { CacheProvider } from './src/vfs/cache.provider.js';
import gitApi from 'isomorphic-git';

(async () => {
  try {
    console.log('Booting kernel...');
    const kernel = new KillioKernel(new CacheProvider('test'));
    await kernel.boot();
    console.log('Kernel booted');
    
    const gitFs = {
      promises: {
        readFile: async (filepath: string, options?: any) => {
          console.log('readFile', filepath, options);
          const node = await kernel.getVFS().getNode(filepath);
          if (!node || node.type !== 'file') {
              const e: any = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
          }
          const buf = Buffer.from(node.content || '', node.metadata?.isBinary ? 'base64' : 'utf8');
          if (options === 'utf8' || options?.encoding === 'utf8') return buf.toString('utf8');
          return buf;
        },
        writeFile: async (filepath: string, data: Uint8Array | string) => {
          console.log('writeFile', filepath);
          const parentPath = filepath.split('/').slice(0, -1).join('/') || '/';
          const node = await kernel.getVFS().getNode(filepath);
          const content = typeof data === 'string' ? data : Buffer.from(data).toString('base64');
          if (node) {
            await kernel.getVFS().updateNode(filepath, { content, metadata: { ...node.metadata, isBinary: typeof data !== 'string' } });
          } else {
            await kernel.getVFS().createNode({
              path: filepath, type: 'file', ownerId: kernel.getVFS().getOwnerId(), parentPath, content,
              metadata: { created: new Date().toISOString(), owner: 'agent', permissions: '644', isBinary: typeof data !== 'string' }
            });
          }
        },
        unlink: async (filepath: string) => { console.log('unlink', filepath); await kernel.getVFS().deleteNode(filepath); },
        readdir: async (filepath: string) => {
          console.log('readdir', filepath);
          const nodes = await kernel.getVFS().listNodes(filepath);
          return nodes.map(n => n.path.split('/').pop());
        },
        mkdir: async (filepath: string) => {
          console.log('mkdir', filepath);
          const parentPath = filepath.split('/').slice(0, -1).join('/') || '/';
          await kernel.getVFS().createNode({
            path: filepath, type: 'directory', ownerId: kernel.getVFS().getOwnerId(), parentPath,
            metadata: { created: new Date().toISOString(), owner: 'agent', permissions: '755' }
          });
        },
        rmdir: async (filepath: string) => { console.log('rmdir', filepath); await kernel.getVFS().deleteNode(filepath); },
        stat: async (filepath: string) => {
          const node = await kernel.getVFS().getNode(filepath);
          if (!node) { const err: any = new Error('ENOENT'); err.code = 'ENOENT'; throw err; }
          const time = new Date(node.metadata?.modified || node.metadata?.created || Date.now());
          const timeMs = time.getTime();
          return {
            isDirectory: () => node.type === 'directory',
            isFile: () => node.type === 'file',
            isSymbolicLink: () => false,
            size: node.content ? Buffer.byteLength(node.content, node.metadata?.isBinary ? 'base64' : 'utf8') : 0,
            mtimeMs: timeMs,
            ctimeMs: timeMs,
            birthtimeMs: timeMs,
            mtime: time,
            ctime: time,
            birthtime: time,
            dev: 1, ino: 1, mode: node.type === 'directory' ? 0o40755 : 0o100644, uid: 1, gid: 1
          };
        },
        lstat: async (filepath: string) => gitFs.promises.stat(filepath),
        readlink: async () => { throw new Error('ENOSYS'); },
        symlink: async () => { throw new Error('ENOSYS'); },
        chmod: async () => {}
      }
    };

    const dir = '/home/agent';
    console.log('Running init...');
    await gitApi.init({ fs: gitFs, dir });
    console.log('Init done. Creating test file...');
    await kernel.execute(['write_file', '/home/agent/test.txt', 'hello']);
    console.log('Running add...');
    await gitApi.add({ fs: gitFs, dir, filepath: 'test.txt' });
    console.log('Add done. Running commit...');
    await gitApi.commit({ fs: gitFs, dir, author: { name: 'A', email: 'a@a.com' }, message: 'init' });
    console.log('Commit done!');
  } catch (e) {
    console.error('CRASHED:', e);
  }
})();
