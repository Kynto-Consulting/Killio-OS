import type { CommandHandler } from '../kernel.js';
import gitApi from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

export const git: CommandHandler = async (args, kernel) => {
  if (args.length === 0) {
    return { output: 'usage: git [--version] [--help] <command> [<args>]', exitCode: 1 };
  }

  const subcommand = args[0];

  if (subcommand === 'clone' || subcommand === 'pull' || subcommand === 'fetch') {
    return { output: 'fatal: git pull/clone/fetch is disabled to preserve VFS storage. Use push only.', exitCode: 1 };
  }

  const gitFs = {
    promises: {
      readFile: async (filepath: string, options?: any) => {
        try {
          const content = await kernel.readFile(filepath);
          const node = await kernel.getVFS().getNode(kernel.resolvePath(filepath));
          const buf = Buffer.from(content, node?.metadata?.isBinary ? 'base64' : 'utf8');
          if (options === 'utf8' || options?.encoding === 'utf8') return buf.toString('utf8');
          return buf;
        } catch (e: any) {
          const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
        }
      },
      writeFile: async (filepath: string, data: Uint8Array | string, options?: any) => {
        try {
          const content = typeof data === 'string' ? data : Buffer.from(data).toString('base64');
          let permissions = '644';
          if (options && options.mode) permissions = options.mode.toString(8);
          else if (typeof options === 'number') permissions = options.toString(8);

          await kernel.writeFile(filepath, content, {
            isBinary: typeof data !== 'string',
            permissions
          });
        } catch (e: any) {
          const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
        }
      },
      unlink: async (filepath: string) => {
        try {
          await kernel.unlink(filepath);
        } catch (e: any) {
          const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
        }
      },
      readdir: async (filepath: string, options?: any) => {
        try {
          const nodes = await kernel.listNodes(filepath);
          return nodes.map(n => n.path.split('/').pop()!).filter(Boolean);
        } catch (e: any) {
          const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
        }
      },
      mkdir: async (filepath: string, options?: any) => {
        try {
          await kernel.mkdir(filepath, true);
        } catch (e: any) {
          const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
        }
      },
      rmdir: async (filepath: string) => {
        try {
          // isomorphic-git uses rmdir to clean up empty dirs.
          // We can use unlink or a dedicated rmdir if we want to be strict.
          await kernel.unlink(filepath);
        } catch (e: any) {
          const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
        }
      },
      stat: async (filepath: string, options?: any) => {
        try {
          const fullPath = kernel.resolvePath(filepath);
          const node = await kernel.getVFS().getNode(fullPath);
          if (!node) { const err: any = new Error('ENOENT'); err.code = 'ENOENT'; throw err; }

          return {
            ctimeMs: new Date(node.metadata?.created || 0).getTime(),
            mtimeMs: new Date(node.metadata?.updated || node.metadata?.created || 0).getTime(),
            dev: 1,
            ino: 1,
            mode: node.type === 'directory' ? 0o40755 : 0o100644,
            nlink: 1,
            uid: 1,
            gid: 1,
            rdev: 0,
            size: node.content ? Buffer.byteLength(node.content, node.metadata?.isBinary ? 'base64' : 'utf8') : 0,
            blksize: 4096,
            blocks: 1,
            isDirectory: () => node.type === 'directory',
            isFile: () => node.type === 'file',
            isSymbolicLink: () => false,
          } as any;
        } catch (e: any) {
          const err: any = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
        }
      },
      lstat: async (filepath: string, options?: any) => {
        return (gitFs.promises as any).stat(filepath, options);
      },
      readlink: async () => { throw new Error('ENOSYS'); },
      symlink: async () => { throw new Error('ENOSYS'); },
      chmod: async (filepath: string, mode: number) => {
        try {
          const octal = mode.toString(8);
          await kernel.chmod(filepath, octal);
        } catch (e: any) {
          const err: any = new Error(e.message.split(':')[0]); err.code = err.message; throw err;
        }
      }
    }
  };
  
  const token = kernel.getEnv('GITHUB_TOKEN');
  const onAuth = () => {
    if (!token) return undefined;
    return { username: 'x-access-token', password: token }; 
  };

  const dir = kernel.getCWD();

  try {
    switch (subcommand) {
      case 'init': {
        await gitApi.init({ fs: gitFs, dir });
        return { output: `Initialized empty Git repository in ${dir}/.git/`, exitCode: 0 };
      }
      case 'status': {
        const currentBranch = await gitApi.currentBranch({ fs: gitFs, dir }) || 'DETACHED';
        const status = await gitApi.statusMatrix({ fs: gitFs, dir });
        const untracked = status.filter(row => row[1] === 0 && row[2] === 2 && row[3] === 0).map(row => row[0]);
        const modified = status.filter(row => row[1] === 1 && row[2] === 2 && row[3] === 1).map(row => row[0]);
        const staged = status.filter(row => row[2] === 2 && row[3] === 2 && (row[1] as number) !== row[2]).map(row => row[0]);

        let out = `On branch ${currentBranch}\n`;
        if (staged.length > 0) out += `\nChanges to be committed:\n${staged.map(f => `  staged: ${f}`).join('\n')}\n`;
        if (modified.length > 0) out += `\nChanges not staged for commit:\n${modified.map(f => `  modified: ${f}`).join('\n')}\n`;
        if (untracked.length > 0) out += `\nUntracked files:\n${untracked.map(f => `  ${f}`).join('\n')}\n`;
        if (untracked.length === 0 && modified.length === 0 && staged.length === 0) out += '\nnothing to commit, working tree clean';
        return { output: out.trim(), exitCode: 0 };
      }
      case 'branch': {
        if (args.length === 1) {
          const branches = await gitApi.listBranches({ fs: gitFs, dir });
          const current = await gitApi.currentBranch({ fs: gitFs, dir });
          return { output: branches.map(b => (b === current ? '* ' : '  ') + b).join('\n'), exitCode: 0 };
        }
        await gitApi.branch({ fs: gitFs, dir, ref: args[1]! });
        return { output: '', exitCode: 0 };
      }
      case 'checkout': {
        const ref = args[1];
        if (!ref) return { output: 'fatal: branch name or reference required', exitCode: 1 };
        
        if (args.includes('-b')) {
          const newBranch = args[args.indexOf('-b') + 1];
          if (!newBranch) return { output: 'fatal: branch name required for -b', exitCode: 1 };
          await gitApi.branch({ fs: gitFs, dir, ref: newBranch });
          await gitApi.checkout({ fs: gitFs, dir, ref: newBranch });
          return { output: `Switched to a new branch '${newBranch}'`, exitCode: 0 };
        }
        await gitApi.checkout({ fs: gitFs, dir, ref });
        return { output: `Switched to branch '${ref}'`, exitCode: 0 };
      }
      case 'add': {
        if (!args[1]) return { output: 'nothing specified, nothing added.', exitCode: 0 };
        const file = args[1] === '.' ? '.' : kernel.resolvePath(args[1]!).replace(dir + '/', '');
        if (file === '.') {
          const status = await gitApi.statusMatrix({ fs: gitFs, dir });
          for (const row of status) {
            if (row[2] !== row[3]) await gitApi.add({ fs: gitFs, dir, filepath: row[0] });
          }
        } else {
          await gitApi.add({ fs: gitFs, dir, filepath: file });
        }
        return { output: '', exitCode: 0 };
      }
      case 'commit': {
        const mIndex = args.indexOf('-m');
        const message = mIndex !== -1 ? args[mIndex + 1] : undefined;
        if (!message && mIndex !== -1) return { output: 'error: switch `m` requires a value', exitCode: 1 };
        
        const finalMessage = message || 'update';
        const currentBranch = await gitApi.currentBranch({ fs: gitFs, dir }) || 'main';
        const sha = await gitApi.commit({
          fs: gitFs,
          dir,
          author: { name: 'Killio Agent', email: 'agent@killio.local' },
          message: finalMessage
        });
        return { output: `[${currentBranch} ${sha.substring(0, 7)}] ${finalMessage}`, exitCode: 0 };
      }
      case 'log': {
        const commits = await gitApi.log({ fs: gitFs, dir, depth: 5 });
        const out = commits.map(c => `commit ${c.oid}\nAuthor: ${c.commit.author.name} <${c.commit.author.email}>\nDate:   ${new Date(c.commit.author.timestamp * 1000).toUTCString()}\n\n    ${c.commit.message}`).join('\n\n');
        return { output: out, exitCode: 0 };
      }
      case 'remote': {
        const op = args[1];
        if (op === 'add') {
          const name = args[2];
          const url = args[3];
          if (!name || !url) return { output: 'usage: git remote add <name> <url>', exitCode: 1 };
          await gitApi.addRemote({ fs: gitFs, dir, remote: name, url });
          return { output: '', exitCode: 0 };
        }
        const remotes = await gitApi.listRemotes({ fs: gitFs, dir });
        return { output: remotes.map(r => `${r.remote}\t${r.url}`).join('\n'), exitCode: 0 };
      }
      case 'push': {
        const remote = args[1] || 'origin';
        const ref = args[2];
        await gitApi.push({ 
          fs: gitFs, 
          http,
          dir, 
          remote, 
          ref,
          onAuth,
          force: args.includes('-f') || args.includes('--force')
        });
        return { output: `Everything up-to-date`, exitCode: 0 };
      }
      default:
        return { output: `git: '${subcommand}' is not a git command. See 'git --help'.`, exitCode: 1 };
    }
  } catch (e: any) {
    console.error('[GIT-ERROR]', e);
    if (e.message.includes('not a git command')) return { output: e.message, exitCode: 1 };
    // If it's a known isomorphic-git error, show it
    if (e.code || e.name === 'GitError') {
      return { output: `fatal: ${e.message}`, exitCode: 128 };
    }
    return { output: `fatal: ${e.message}`, exitCode: 128 };
  }
};
