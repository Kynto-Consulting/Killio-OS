import { KillioKernel } from '../../../kernel.js';

export const createFsMock = (kernel: KillioKernel, eventsMock: any) => {
  const writeFileSync = async (path: string, data: any, options?: any) => {
    try {
      const content = Buffer.isBuffer(data) ? data.toString('base64') : String(data);
      let permissions = '644';
      if (options && options.mode) permissions = options.mode.toString(8);
      else if (typeof options === 'number') permissions = options.toString(8);

      await kernel.writeFile(path, content, { 
        isBinary: Buffer.isBuffer(data),
        permissions
      });
    } catch (e: any) {
      const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
    }
  };

  const readFileSync = async (path: string, encoding?: string) => {
    try {
      const content = await kernel.readFile(path);
      const node = await kernel.getVFS().getNode(kernel.resolvePath(path));
      const buf = Buffer.from(content, node?.metadata?.isBinary ? 'base64' : 'utf8');
      return encoding ? buf.toString(encoding as any) : buf;
    } catch (e: any) {
      const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
    }
  };

  return {
    readFileSync,
    writeFileSync,
    writeFile: writeFileSync,
    readFile: readFileSync,
    existsSync: async (path: string) => {
      try {
        const node = await kernel.getVFS().getNode(kernel.resolvePath(path));
        return !!node;
      } catch (e) { return false; }
    },
    mkdirSync: async (path: string) => {
       await kernel.mkdir(path, true);
    },
    promises: {
      readFile: readFileSync,
      writeFile: writeFileSync,
      readdir: async (path: string) => {
        const nodes = await kernel.listNodes(path);
        return nodes.map(n => n.path.split('/').pop()!).filter(Boolean);
      }
    },
    // Simple Stream-like bridge for libraries like pdfkit
    createWriteStream: (path: string) => {
      const chunks: any[] = [];
      const { EventEmitter } = eventsMock;
      const stream = new EventEmitter() as any;
      
      stream.writable = true;
      stream.write = (chunk: any) => {
        chunks.push(chunk);
        return true;
      };
      
      stream.end = async (chunk?: any) => {
        if (chunk) chunks.push(chunk);
        const finalBuffer = Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c)));
        await writeFileSync(path, finalBuffer);
        stream.emit('finish');
        stream.emit('close');
        stream.writable = false;
      };

      return stream;
    }
  };
};
