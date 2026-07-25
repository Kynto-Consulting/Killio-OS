import type { CommandHandler, KillioKernel } from '../kernel.js';
import type { CommandResult, FSNode } from '../types/index.js';
import chalk from 'chalk';

function parsePerms(p: string): string {
  const s = p.length === 3 ? p : (p.length === 4 ? p.substring(1) : '644');
  const map = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  return (map[parseInt(s[0]!)] || '---') + (map[parseInt(s[1]!)] || '---') + (map[parseInt(s[2]!)] || '---');
}

function formatLong(n: FSNode, nameOverride?: string): string {
  const type = n.type === 'directory' ? 'd' : (n.type === 'link' ? 'l' : '-');
  const perms = n.metadata?.permissions || (n.type === 'directory' ? '755' : '644');
  const mode = type + parsePerms(perms);
  
  const owner = n.metadata?.owner || 'root';
  const group = n.metadata?.group || 'root';
  const size = (n.metadata?.size || 0).toString().padStart(5);
  
  const dateObj = n.metadata?.created ? new Date(n.metadata.created) : new Date();
  const month = dateObj.toLocaleString('en-US', { month: 'short' });
  const day = dateObj.getDate().toString().padStart(2);
  const time = dateObj.getHours().toString().padStart(2, '0') + ':' + dateObj.getMinutes().toString().padStart(2, '0');
  
  const name = nameOverride || n.path.split('/').pop() || (n.path === '/' ? '/' : n.path);
  const displayName = n.type === 'directory' ? chalk.blue.bold(name) : name;
  
  return `${mode} 1 ${owner.padEnd(8)} ${group.padEnd(8)} ${size} ${month} ${day} ${time} ${displayName}`;
}

/**
 * `find` — recursive VFS enumeration with machine-readable output: one absolute
 * path per line, no color codes, no section headers. This is the reliable way
 * for callers (workspace persistence, agent tooling) to discover files, because
 * `ls -R` output is human-formatted (chalk colors on directories, space-joined
 * names) and cannot be parsed robustly.
 *
 * Supports the common subset:  find [path] [-type f|d] [-name GLOB] [-maxdepth N]
 * Defaults to the current directory and prints the starting path first, POSIX-style.
 */
export const find: CommandHandler = async (args: string[], kernel) => {
  let start = '.';
  let typeFilter: 'f' | 'd' | null = null;
  let nameGlob: RegExp | null = null;
  let maxDepth = Infinity;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-type') { const v = args[++i]; typeFilter = v === 'd' ? 'd' : v === 'f' ? 'f' : null; }
    else if (a === '-name') {
      const g = args[++i] || '*';
      const re = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      nameGlob = new RegExp(`^${re}$`);
    }
    else if (a === '-maxdepth') { maxDepth = parseInt(args[++i] || '0', 10); }
    else if (!a.startsWith('-')) { start = a; }
  }

  const root = kernel.resolvePath(start);
  const lines: string[] = [];
  const emit = (path: string, type: FSNode['type']) => {
    if (typeFilter === 'f' && type !== 'file') return;
    if (typeFilter === 'd' && type !== 'directory') return;
    if (nameGlob) {
      const base = path.split('/').pop() || path;
      if (!nameGlob.test(base)) return;
    }
    lines.push(path);
  };

  const startNode = await kernel.getVFS().getNode(root);
  if (!startNode) return { output: `find: '${start}': No such file or directory`, exitCode: 1 };
  emit(root, startNode.type);

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth >= maxDepth) return;
    let children: FSNode[];
    try { children = await kernel.listNodes(dir); } catch { return; }
    // stable order so callers get deterministic listings
    children.sort((a, b) => a.path.localeCompare(b.path));
    for (const child of children) {
      const base = child.path.split('/').pop() || '';
      if (base === '.' || base === '..') continue;
      emit(child.path, child.type);
      if (child.type === 'directory') await walk(child.path, depth + 1);
    }
  };
  if (startNode.type === 'directory') await walk(root, 0);

  return { output: lines.join('\n'), exitCode: 0 };
};

export const ls: CommandHandler = async (args: string[], kernel) => {
  const flags = {
    a: args.some(a => a.startsWith('-') && a.includes('a')),
    l: args.some(a => a.startsWith('-') && a.includes('l')),
    R: args.some(a => a.startsWith('-') && a.includes('R')),
    h: args.some(a => a.startsWith('-') && a.includes('h')),
  };
  const targets = args.filter(a => !a.startsWith('-'));
  if (targets.length === 0) targets.push('.');

  let finalOutput = '';

  const listRecursive = async (path: string, depth: number = 0): Promise<string> => {
    let out = '';
    try {
      const fullPath = kernel.resolvePath(path);
      let nodes = await kernel.listNodes(fullPath);

      if (flags.a) {
        const node = await kernel.getVFS().getNode(fullPath) || { path: fullPath, type: 'directory' } as any;
        const parentPath = fullPath.split('/').slice(0, -1).join('/') || '/';
        const parentNode = await kernel.getVFS().getNode(parentPath) || { path: parentPath, type: 'directory' } as any;
        nodes = [{ ...node, path: `${fullPath}/.` }, { ...parentNode, path: `${fullPath}/..` }, ...nodes];
      } else {
        nodes = nodes.filter(n => !n.path.split('/').pop()?.startsWith('.'));
      }

      if (flags.l) {
        const total = nodes.reduce((acc, n) => acc + (n.metadata?.size || 0), 0);
        out += `total ${Math.ceil(total / 1024)}\n`;
        out += nodes.map(n => formatLong(n)).join('\n') + '\n';
      } else {
        const names = nodes.map(n => {
          const name = n.path.split('/').pop() || n.path;
          return n.type === 'directory' ? chalk.blue.bold(name) : name;
        });
        out += names.join('  ') + '\n';
      }

      if (flags.R) {
        const dirs = nodes.filter(n => n.type === 'directory' && !n.path.endsWith('/.') && !n.path.endsWith('/..'));
        for (const d of dirs) {
          out += `\n${d.path}:\n`;
          out += await listRecursive(d.path, depth + 1);
        }
      }
    } catch (e: any) {
      out += `ls: ${e.message}\n`;
    }
    return out;
  };

  for (const target of targets) {
    if (targets.length > 1 || flags.R) finalOutput += `${target}:\n`;
    finalOutput += await listRecursive(target);
    if (targets.length > 1) finalOutput += '\n';
  }

  const hasErrors = finalOutput.includes('no such file') || finalOutput.includes('permission denied');
  return { output: finalOutput.trim(), exitCode: hasErrors ? 1 : 0 };
};

export const mkdir: CommandHandler = async (args: string[], kernel) => {
  const pFlag = args.includes('-p');
  const targets = args.filter(a => !a.startsWith('-'));
  if (targets.length === 0) return { output: 'mkdir: missing operand', exitCode: 1 };

  try {
    for (const target of targets) {
      await kernel.mkdir(target, pFlag);
    }
    return { output: '', exitCode: 0 };
  } catch (e: any) {
    return { output: `mkdir: ${e.message}`, exitCode: 1 };
  }
};

export const touch: CommandHandler = async (args: string[], kernel) => {
  const targets = args.filter(a => !a.startsWith('-'));
  if (targets.length === 0) return { output: 'touch: missing file operand', exitCode: 1 };

  try {
    for (const target of targets) {
      try {
        const content = await kernel.readFile(target);
        // If file exists, update its modified time (not implemented in metadata yet but good practice)
        await kernel.writeFile(target, content); 
      } catch (e) {
        // If file doesn't exist, create it
        await kernel.writeFile(target, '');
      }
    }
    return { output: '', exitCode: 0 };
  } catch (e: any) {
    return { output: `touch: ${e.message}`, exitCode: 1 };
  }
};

export const write_file: CommandHandler = async (args: string[], kernel) => {
  const isBase64 = args.includes('--base64');
  const targets = args.filter(a => a !== '--base64');
  if (targets.length < 2) return { output: 'write_file: missing arguments', exitCode: 1 };
  
  const [path, ...contentParts] = targets;
  const content = contentParts.join(' ');

  try {
    const existed = !!(await kernel.getVFS().getNode(kernel.resolvePath(path!)));
    await kernel.writeFile(path!, content, { isBinary: isBase64 });
    return { output: `${existed ? 'Updated file' : 'Wrote to file'}: ${path}`, exitCode: 0 };
  } catch (e: any) {
    return { output: `write_file: ${e.message}`, exitCode: 1 };
  }
};

export const cat: CommandHandler = async (args: string[], kernel, stdin?: string) => {
  const flags = args.filter(a => a.startsWith('-') && a.length > 1);
  const number = flags.some(f => f.includes('n'));
  const numberNonBlank = flags.some(f => f.includes('b'));
  const showEnds = flags.some(f => f.includes('E')) || flags.some(f => f === '-A');
  const squeeze = flags.some(f => f.includes('s'));
  const files = args.filter(a => !(a.startsWith('-') && a.length > 1));

  // No file operands (or `-`): read stdin, echoing it through (POSIX cat).
  const bodies: string[] = [];
  let err = false;
  if (files.length === 0) {
    bodies.push(stdin ?? '');
  } else {
    for (const file of files) {
      if (file === '-') { bodies.push(stdin ?? ''); continue; }
      try { bodies.push(await kernel.readFile(file!)); }
      catch (e: any) { bodies.push(`\0ERR${e.message}`); err = true; }
    }
  }

  let joined = bodies.map(b => (b.startsWith('\0ERR') ? '' : b)).join('');
  const errMsgs = bodies.filter(b => b.startsWith('\0ERR')).map(b => `cat: ${b.slice(4)}`);

  if (squeeze) joined = joined.replace(/\n{3,}/g, '\n\n');
  if (showEnds) joined = joined.split('\n').map(l => l + '$').join('\n');
  if (number || numberNonBlank) {
    let n = 0;
    joined = joined.split('\n').map((line) => {
      if (numberNonBlank && line.trim() === '') return line;
      return `${(++n).toString().padStart(6)}\t${line}`;
    }).join('\n');
  }
  const out = [joined, ...errMsgs].filter(Boolean).join('\n');
  return { output: out, exitCode: err ? 1 : 0 };
};

export const nano: CommandHandler = async (args: string[], kernel) => {
  if (!args[0]) return { output: 'nano: filename required', exitCode: 1 };
  const path = kernel.resolvePath(args[0]);
  const fileName = args[0].split('/').pop();
  
  if (args[1]) {
    await kernel.writeFile(path, args[1]);
    return { output: `[ Saved ${args[0]} ]`, exitCode: 0 };
  }

  // Headless check for non-interactive environments (like tests or AI tools)
  const isInteractive = true; // For CLI

  return {
    output: '', // CLI will handle initial render
    exitCode: 0,
    metadata: {
      interactive: true,
      editor: 'nano',
      file: path
    }
  };
};

export const rm: CommandHandler = async (args: string[], kernel) => {
  const flags = args.filter(a => a.startsWith('-'));
  const targets = args.filter(a => !a.startsWith('-'));
  const recursive = flags.some(f => f.includes('r'));

  if (targets.length === 0) return { output: 'rm: missing operand', exitCode: 1 };
  try {
    for (const target of targets) {
      await kernel.unlink(target, recursive);
    }
    return { output: '', exitCode: 0 };
  } catch (e: any) {
    return { output: `rm: ${e.message}`, exitCode: 1 };
  }
};

export const cp: CommandHandler = async (args: string[], kernel) => {
  if (args.length < 2) return { output: 'cp: missing destination file operand', exitCode: 1 };
  try {
    const content = await kernel.readFile(args[0]!);
    await kernel.writeFile(args[1]!, content);
    return { output: '', exitCode: 0 };
  } catch (e: any) {
    return { output: `cp: ${e.message}`, exitCode: 1 };
  }
};

export const mv: CommandHandler = async (args: string[], kernel) => {
  if (args.length < 2) return { output: 'mv: missing destination file operand', exitCode: 1 };
  try {
    const content = await kernel.readFile(args[0]!);
    await kernel.writeFile(args[1]!, content);
    await kernel.unlink(args[0]!);
    return { output: '', exitCode: 0 };
  } catch (e: any) {
    return { output: `mv: ${e.message}`, exitCode: 1 };
  }
};

export const stat: CommandHandler = async (args: string[], kernel) => {
  if (!args[0]) return { output: 'stat: missing operand', exitCode: 1 };
  try {
    const fullPath = kernel.resolvePath(args[0]);
    const node = await kernel.getVFS().getNode(fullPath);
    if (!node) return { output: `stat: cannot stat '${args[0]}': No such file or directory`, exitCode: 1 };

    const typeLabel = node.type === 'directory' ? 'directory' : node.type === 'link' ? 'symbolic link' : 'file';
    const output = [
      `  File: ${args[0]}`,
      `  Type: ${typeLabel}`,
      `  Size: ${node.metadata?.size || (node.content?.length ?? 0)} \tBlocks: 8 \tIO Block: 4096 \t${typeLabel}`,
      `Device: 1h/1d\tInode: ${node.id.substring(0, 8)}\tLinks: 1`,
      `Access: (${node.metadata?.permissions || '0644'}/${parsePerms(node.metadata?.permissions || '644')})  Uid: ( 0/    root)   Gid: ( 0/    root)`,
      `Access: ${node.metadata?.created || 'Unknown'}`,
      `Modify: ${node.metadata?.modified || node.metadata?.created || 'Unknown'}`,
      `Change: ${node.updatedAt || 'Unknown'}`,
      ` Birth: ${node.metadata?.created || 'Unknown'}`
    ].join('\n');
    return { output, exitCode: 0 };
  } catch (e: any) {
    return { output: `stat: ${e.message}`, exitCode: 1 };
  }
};

export const sed: CommandHandler = async (args: string[], kernel) => {
  if (args.length < 2) return { output: 'sed: usage: sed "s/old/new/g" <file>', exitCode: 1 };
  const expr = args[0]!;
  const file = args[1]!;

  try {
    const content = await kernel.readFile(file);
    const match = expr.match(/^s\/(.*)\/(.*)\/(g?)$/);
    if (!match) return { output: `sed: invalid expression: ${expr}`, exitCode: 1 };

    const [_, search, replace, flags] = match;
    const regex = new RegExp(search!, flags === 'g' ? 'g' : '');
    const newContent = content.replace(regex, replace!);

    if (args.includes('-i')) {
       await kernel.writeFile(file, newContent);
       return { output: '', exitCode: 0 };
    }
    return { output: newContent, exitCode: 0 };
  } catch (e: any) {
    return { output: `sed: ${e.message}`, exitCode: 1 };
  }
};

export const patch: CommandHandler = async (args: string[], kernel) => {
  if (args.length < 3) return { output: 'patch: usage: patch <file> <search> <replace>', exitCode: 1 };
  const [file, search, replace] = args;
  try {
    const content = await kernel.readFile(file!);
    if (!content.includes(search!)) return { output: `patch: search string not found in ${file}`, exitCode: 1 };
    
    const newContent = content.replace(search!, replace!);
    await kernel.writeFile(file!, newContent);
    return { output: `patching file ${file}`, exitCode: 0 };
  } catch (e: any) {
    return { output: `patch: ${e.message}`, exitCode: 1 };
  }
};

/** Shared parse for head/tail: -n N, -nN, -c N (bytes), file operand or stdin. */
function parseHeadTail(args: string[]): { n: number; bytes: boolean; files: string[] } {
  let n = 10, bytes = false;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-n') { n = parseInt(args[++i] || '10', 10); }
    else if (a === '-c') { n = parseInt(args[++i] || '10', 10); bytes = true; }
    else if (/^-n\d+$/.test(a)) { n = parseInt(a.slice(2), 10); }
    else if (/^-c\d+$/.test(a)) { n = parseInt(a.slice(2), 10); bytes = true; }
    else if (/^-\d+$/.test(a)) { n = parseInt(a.slice(1), 10); }
    else if (!a.startsWith('-')) files.push(a);
  }
  return { n, bytes, files };
}

export const head: CommandHandler = async (args: string[], kernel, stdin?: string) => {
  const { n, bytes, files } = parseHeadTail(args);
  const content = files.length
    ? await (async () => {
        const node = await kernel.getVFS().getNode(kernel.resolvePath(files[0]!));
        if (!node || node.type !== 'file') throw new Error(`${files[0]}: No such file or directory`);
        return node.content || '';
      })().catch((e) => { throw e; })
    : (stdin ?? '');
  try {
    const body = await Promise.resolve(content);
    if (bytes) return { output: body.slice(0, n), exitCode: 0 };
    return { output: body.split('\n').slice(0, n).join('\n'), exitCode: 0 };
  } catch (e: any) { return { output: `head: ${e.message}`, exitCode: 1 }; }
};

export const tail: CommandHandler = async (args: string[], kernel, stdin?: string) => {
  const { n, bytes, files } = parseHeadTail(args);
  try {
    let body: string;
    if (files.length) {
      const node = await kernel.getVFS().getNode(kernel.resolvePath(files[0]!));
      if (!node || node.type !== 'file') return { output: `tail: ${files[0]}: No such file or directory`, exitCode: 1 };
      body = node.content || '';
    } else body = stdin ?? '';
    if (bytes) return { output: body.slice(-n), exitCode: 0 };
    let lines = body.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
    return { output: lines.slice(-n).join('\n'), exitCode: 0 };
  } catch (e: any) { return { output: `tail: ${e.message}`, exitCode: 1 }; }
};

