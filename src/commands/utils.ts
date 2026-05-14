import type { CommandHandler } from '../kernel.js';

export const grep: CommandHandler = async (args: string[], kernel) => {
  const recursive = args.includes('-r');
  const ignoreCase = args.includes('-i');
  const showLineNumbers = args.includes('-n');
  
  const cleanArgs = args.filter(a => !a.startsWith('-'));
  if (cleanArgs.length < 1) return { output: 'grep: usage: grep [options] <pattern> [file...]', exitCode: 1 };
  
  const patternStr = cleanArgs[0]!;
  const targets = cleanArgs.slice(1);
  const pattern = new RegExp(patternStr, ignoreCase ? 'i' : '');

  const grepInFile = async (path: string): Promise<string> => {
    try {
      const content = await kernel.readFile(path);
      const lines = content.split('\n');
      const matches = lines
        .map((line, i) => ({ line, i: i + 1 }))
        .filter(item => pattern.test(item.line));
      
      return matches.map(m => {
        const prefix = targets.length > 1 ? `${path}:` : '';
        const lineNum = showLineNumbers ? `${m.i}:` : '';
        return `${prefix}${lineNum}${m.line}`;
      }).join('\n');
    } catch (e) {
      return '';
    }
  };

  if (targets.length === 0) {
    // If no targets, we'd normally read from stdin, but for now we search current dir
    targets.push('.');
  }

  let finalOutput = '';
  for (const target of targets) {
    const fullPath = kernel.resolvePath(target);
    const node = await kernel.getVFS().getNode(fullPath);
    if (!node) continue;

    if (node.type === 'file') {
      finalOutput += await grepInFile(fullPath) + '\n';
    } else if (node.type === 'directory') {
      const nodes = await kernel.listNodes(fullPath);
      for (const n of nodes) {
        if (n.type === 'file') {
          finalOutput += await grepInFile(n.path) + '\n';
        }
      }
    }
  }

  return { output: finalOutput.trim(), exitCode: 0 };
};

export const echo: CommandHandler = async (args: string[]) => {
  return { output: args.join(' '), exitCode: 0 };
};

export const history: CommandHandler = async (_args: string[], kernel) => {
  const history = (kernel as any).getHistory ? (kernel as any).getHistory() : [];
  return { output: history.map((cmd: string, i: number) => ` ${i + 1}  ${cmd}`).join('\n'), exitCode: 0 };
};