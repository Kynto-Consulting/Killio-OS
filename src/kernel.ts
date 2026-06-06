import { type VFSProvider } from './vfs/provider.js';
import { MountManager } from './vfs/mount_manager.js';
import { CacheProvider } from './vfs/cache.provider.js';
import { type CommandResult, type FSNode, type OSVariable } from './types/index.js';
import * as builtin from './commands/builtin.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NOOP_HANDLER: CommandHandler = async () => ({ output: '', exitCode: 0 });

export type CommandHandler = (args: string[], kernel: KillioKernel) => Promise<CommandResult>;

export class KillioKernel {
  private commands: Map<string, CommandHandler> = new Map();
  private cwd: string = '/';
  private env: Map<string, string> = new Map();
  private history: string[] = [];
  private currentUserId: string = 'agent';
  private currentGroupId: string = 'agent';
  private hostname: string = 'killio-os';
  private bootTime: number = Date.now();
  /** True when /tmp is an in-memory mount (default); false = persistent /tmp. */
  private _ephemeralTmp: boolean = true;

  private vfs: VFSProvider;

  constructor(vfs: VFSProvider) {
    this.vfs = vfs;
    this.env.set('USER', 'agent');
    this.env.set('HOME', '/home/agent');
    this.env.set('PATH', '/bin:/usr/bin');
    this.env.set('PWD', '/');
    this.env.set('USER_CLI_FORMAT', '%green%{user}%white%@%green%{hostname}%white%:%blue%{cwd}%magenta%{%git_branch%: :}%white%{prompt_char} %reset%');
  }

  registerCommand(name: string, handler: CommandHandler) {
    this.commands.set(name, handler);
  }

  /**
   * Boot the kernel.
   *
   * @param opts.ephemeralTmp  When true (default) `/tmp` is mounted to an
   *   in-memory CacheProvider — fine for a single long-lived process (CLI).
   *   In a SERVERLESS host (e.g. Vercel) each invocation can land on a fresh
   *   instance, so an in-memory `/tmp` is wiped between tool calls and files
   *   written by one call vanish before the next reads them. Pass `false` to
   *   keep `/tmp` on the persistent root provider so write→execute→read/upload
   *   chain across calls.
   */
  async boot(opts: { ephemeralTmp?: boolean } = {}) {
    const ephemeralTmp = opts.ephemeralTmp ?? true;
    this._ephemeralTmp = ephemeralTmp;
    // Register builtin commands
    this.registerCommand('ls', builtin.ls);
    this.registerCommand('mkdir', builtin.mkdir);
    this.registerCommand('write_file', builtin.write_file);
    this.registerCommand('cat', builtin.cat);
    this.registerCommand('pwd', builtin.pwd);
    this.registerCommand('cd', builtin.cd);
    this.registerCommand('env', builtin.env);
    this.registerCommand('rm', builtin.rm);
    this.registerCommand('grep', builtin.grep);
    this.registerCommand('stat', builtin.stat);
    this.registerCommand('touch', builtin.touch);
    this.registerCommand('cp', builtin.cp);
    this.registerCommand('mv', builtin.mv);
    this.registerCommand('echo', builtin.echo);
    this.registerCommand('clear', builtin.clear);
    this.registerCommand('whoami', builtin.whoami);
    this.registerCommand('hostname', builtin.hostname);
    this.registerCommand('history', builtin.history);
    this.registerCommand('uname', builtin.uname);
    this.registerCommand('uptime', builtin.uptime);
    this.registerCommand('head', builtin.head);
    this.registerCommand('tail', builtin.tail);
    this.registerCommand('help', builtin.help);
    this.registerCommand('sh', builtin.sh);
    this.registerCommand('bash', builtin.sh);
    this.registerCommand('date', builtin.date);
    this.registerCommand('ps', builtin.ps);
    this.registerCommand('free', builtin.free);
    this.registerCommand('pacman', builtin.pacman);
    this.registerCommand('node', builtin.node);
    this.registerCommand('curl', builtin.curl);
    this.registerCommand('sudo', builtin.sudo);
    this.registerCommand('df', builtin.df);
    this.registerCommand('top', builtin.top);
    this.registerCommand('ping', builtin.ping);
    this.registerCommand('ifconfig', builtin.ifconfig);
    this.registerCommand('ip', builtin.ifconfig);
    this.registerCommand('chmod', builtin.chmod);
    this.registerCommand('chown', builtin.chown);
    this.registerCommand('zip', builtin.zip);
    this.registerCommand('unzip', builtin.unzip);
    this.registerCommand('git', builtin.git);
    this.registerCommand('npm', builtin.npm);
    this.registerCommand('kpm', builtin.kpm);
    this.registerCommand('mount', builtin.mount);
    this.registerCommand('nano', builtin.nano);
    this.registerCommand('sed', builtin.sed);
    this.registerCommand('patch', builtin.patch);
    this.registerCommand('whoami', builtin.whoami);
    this.registerCommand('hostname', builtin.hostname);
    this.registerCommand('su', builtin.su);
    this.registerCommand('sudo', builtin.sudo);
    this.registerCommand('posh', builtin.posh);

    // Seed internal capabilities as root
    this.currentUserId = 'root';
    this.setEnv('USER', 'root');
    
    await this.seedInternalCapabilities();

    // Seed system files
    await this.seedSystemConfigs();
    await this.seedOMPThemes();
    
    this.currentUserId = 'agent';
    this.setEnv('USER', this.currentUserId);

    // Default env
    this.setEnv('HOME', `/home/${this.currentUserId}`);
    this.setEnv('PATH', '/bin:/usr/bin');
    this.setEnv('HOSTNAME', this.hostname);
    this.setEnv('ALIASES', 'cls=clear;');

    // Setup Mounts if not already setup. `/tmp` is mounted to an in-memory
    // CacheProvider ONLY when ephemeralTmp is on — on serverless the caller
    // passes ephemeralTmp:false so /tmp stays on the persistent root provider
    // and files survive across invocations.
    if (!(this.vfs instanceof MountManager)) {
      const root = this.vfs;
      const manager = new MountManager(root);
      if (ephemeralTmp) {
        manager.mount('/tmp', new CacheProvider(root.getOwnerId()));
      }
      this.vfs = manager;
    }

    // Ensure basic structure exists
    await this.ensureDir('/', 'root', '755');
    await this.ensureDir('/home', 'root', '755');
    await this.ensureDir('/home/agent', 'agent', '755');
    await this.ensureDir('/bin', 'root', '755');
    await this.ensureDir('/tmp', 'root', '777');
    await this.ensureDir('/etc', 'root', '755');

    // Seed mock system files to increase realism
    await this.seedMockFile('/etc/os-release', 'NAME="KillioOS"\nVERSION="1.0.0"\nID=killio\nPRETTY_NAME="KillioOS Linux"');
    await this.seedMockFile('/etc/passwd', 'root:x:0:0:root:/root:/bin/bash\nagent:x:1000:1000:Killio Agent,,,:/home/agent:/bin/bash');
    await this.seedMockFile('/etc/resolv.conf', 'nameserver 8.8.8.8\nnameserver 1.1.1.1');
    await this.seedMockFile('/etc/hosts', '127.0.0.1 localhost\n127.0.1.1 killio-os');

    // Load persisted env vars if any
    const vars = await this.vfs.listVariables('global');
    for (const v of vars) {
      this.env.set(v.key, v.value);
    }
  }

  private async ensureDir(path: string, owner: string = 'root', permissions: string = '755') {
    const node = await this.vfs.getNode(path);
    if (!node) {
      const parentPath = path === '/' ? null : path.split('/').slice(0, -1).join('/') || '/';
      await this.vfs.createNode({
        path,
        type: 'directory',
        ownerId: this.vfs.getOwnerId(),
        parentPath,
        metadata: { created: new Date().toISOString(), owner, permissions }
      });
    }
  }

  private async seedMockFile(path: string, content: string) {
    try {
      await this.writeFile(path, content, { owner: 'root', permissions: '644' });
    } catch (e) {
      // Ignore seeding errors during boot
    }
  }

  async setHostname(name: string) {
    this.hostname = name;
    this.setEnv('HOSTNAME', name);
    try {
      await this.writeFile('/etc/hostname', name, { owner: 'root', permissions: '644' });
    } catch (e) {
      console.error(`Failed to write /etc/hostname: ${e}`);
    }
  }

  // High-level VFS API
  async readFile(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    const node = await this.vfs.getNode(fullPath);
    if (!node) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    if (!this.checkPermission(node, 'r')) throw new Error(`EACCES: permission denied, open '${path}'`);
    return node.content || '';
  }

  async writeFile(path: string, content: string, options: { isBinary?: boolean, owner?: string, permissions?: string } = {}): Promise<void> {
    const fullPath = this.resolvePath(path);
    const parentPath = fullPath.split('/').slice(0, -1).join('/') || '/';

    // Auto-create parent
    await this.mkdir(parentPath, true);

    const node = await this.vfs.getNode(fullPath);
    if (node) {
      if (!this.checkPermission(node, 'w')) throw new Error(`EACCES: permission denied, open '${path}'`);
      await this.vfs.updateNode(fullPath, {
        content,
        metadata: {
          ...node.metadata,
          permissions: options.permissions || node.metadata?.permissions || '644',
          isBinary: options.isBinary ?? node.metadata?.isBinary
        }
      });
    } else {
      const parentNode = await this.vfs.getNode(parentPath);
      if (parentNode && !this.checkPermission(parentNode, 'w')) throw new Error(`EACCES: permission denied, open '${path}'`);

      await this.vfs.createNode({
        path: fullPath,
        type: 'file',
        ownerId: this.vfs.getOwnerId(),
        parentPath,
        content,
        metadata: {
          created: new Date().toISOString(),
          owner: options.owner || this.getEnv('USER') || 'agent',
          permissions: options.permissions || '644',
          isBinary: options.isBinary
        }
      });
    }
  }

  async mkdir(path: string, recursive: boolean = false): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (fullPath === '/') return;

    if (recursive) {
      const parts = fullPath.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        const existing = await this.vfs.getNode(current);
        if (!existing) {
          const parentPath = current.substring(0, current.lastIndexOf('/')) || '/';
          const parentNode = await this.vfs.getNode(parentPath);
          if (parentNode && !this.checkPermission(parentNode, 'w')) throw new Error(`EACCES: permission denied, mkdir '${current}'`);

          await this.vfs.createNode({
            path: current,
            type: 'directory',
            ownerId: this.vfs.getOwnerId(),
            parentPath,
            metadata: { created: new Date().toISOString(), owner: this.getEnv('USER') || 'agent', permissions: '755' }
          });
        }
      }
    } else {
      const existing = await this.vfs.getNode(fullPath);
      if (existing) return;
      const parentPath = fullPath.split('/').slice(0, -1).join('/') || '/';
      const parentNode = await this.vfs.getNode(parentPath);
      if (parentNode && !this.checkPermission(parentNode, 'w')) throw new Error(`EACCES: permission denied, mkdir '${path}'`);

      await this.vfs.createNode({
        path: fullPath,
        type: 'directory',
        ownerId: this.vfs.getOwnerId(),
        parentPath,
        metadata: { created: new Date().toISOString(), owner: this.getEnv('USER') || 'agent', permissions: '755' }
      });
    }
  }

  async unlink(path: string, recursive: boolean = false): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (fullPath === '/' || fullPath === '/home/agent' || fullPath === '/bin') {
      throw new Error(`EACCES: cannot remove root or critical system directory: ${fullPath}`);
    }

    const node = await this.vfs.getNode(fullPath);
    if (!node) throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);

    const parentPath = fullPath.split('/').slice(0, -1).join('/') || '/';
    const parentNode = await this.vfs.getNode(parentPath);
    if (parentNode && !this.checkPermission(parentNode, 'w')) throw new Error(`EACCES: permission denied, unlink '${path}'`);

    if (node.type === 'directory') {
      if (!recursive) throw new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`);

      const children = await this.vfs.listNodes(fullPath);
      for (const child of children) {
        await this.unlink(child.path, true);
      }
    }

    await this.vfs.deleteNode(fullPath);
  }

  async listNodes(path: string): Promise<FSNode[]> {
    const fullPath = this.resolvePath(path);
    const node = await this.vfs.getNode(fullPath);
    if (!node) throw new Error(`ENOENT: no such file or directory, ls '${path}'`);
    if (!this.checkPermission(node, 'r')) throw new Error(`EACCES: permission denied, ls '${path}'`);
    return await this.vfs.listNodes(fullPath);
  }

  async chmod(path: string, mode: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    const node = await this.vfs.getNode(fullPath);
    if (!node) throw new Error(`ENOENT: no such file or directory, chmod '${path}'`);
    if (!this.checkPermission(node, 'w')) throw new Error(`EACCES: permission denied, chmod '${path}'`);
    await this.vfs.updateNode(fullPath, { metadata: { ...node.metadata, permissions: mode } });
  }

  async stat(path: string): Promise<FSNode> {
    const fullPath = this.resolvePath(path);
    const node = await this.vfs.getNode(fullPath);
    if (!node) throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    if (!this.checkPermission(node, 'r')) throw new Error(`EACCES: permission denied, stat '${path}'`);
    return node;
  }

  async chown(path: string, owner: string, group?: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    const node = await this.vfs.getNode(fullPath);
    if (!node) throw new Error(`ENOENT: no such file or directory, chown '${path}'`);
    // Only root or owner can chown? For now, standard permission check
    if (!this.checkPermission(node, 'w')) throw new Error(`EACCES: permission denied, chown '${path}'`);
    await this.vfs.updateNode(fullPath, { metadata: { ...node.metadata, owner, group } });
  }

  checkPermission(node: FSNode | null | undefined, access: 'r' | 'w' | 'x'): boolean {
    if (!node) return true; // if node doesn't exist, permission implies parent check later
    const currentUser = this.getEnv('USER') || 'agent';
    if (currentUser === 'root') return true;

    const owner = node.metadata?.owner || 'root';
    const perms = String(node.metadata?.permissions || '644').padStart(3, '0');

    let targetDigit;
    if (currentUser === owner) {
      targetDigit = parseInt(perms[0] || '0', 10);
    } else {
      targetDigit = parseInt(perms[2] || '0', 10); // Treating group same as others for simplicity
    }

    if (access === 'r') return (targetDigit & 4) !== 0;
    if (access === 'w') return (targetDigit & 2) !== 0;
    if (access === 'x') return (targetDigit & 1) !== 0;

    return false;
  }

  expandVars(text: string): string {
    return text.replace(/\$([\w\d_$]+)/g, (_, name) => this.getEnv(name) || '');
  }

  /**
   * Pre-process bash heredoc syntax (`<< DELIMITER … DELIMITER`) before normal tokenisation.
   *
   * Handles all common variants:
   *   cat > /tmp/file << 'EOF'    → writes heredoc body to file
   *   cat >> /tmp/file << EOF     → appends heredoc body to file
   *   cat << EOF                  → returns heredoc body as output
   *   node << EOF                 → writes body to a temp file, executes it
   *   <<- MARKER                  → same but strips leading tabs from each line
   *
   * Returns a CommandResult when the heredoc is fully handled, or `null` to
   * fall through to the normal execution path.
   */
  private async executeHeredoc(rawCommand: string): Promise<CommandResult | null> {
    // Regex breakdown:
    //   ([\s\S]*?)        → prefix (everything before <<, including optional redirect)
    //   <<(-?)            → heredoc operator, optional strip flag
    //   \s*['"]?(\w+)['"]?[ \t]*\n   → delimiter (quoted or bare), then newline
    //   ([\s\S]*?)        → heredoc body (lazy)
    //   \n[ \t]*\3[ \t]*  → closing delimiter on its own line
    //   (?:[\s\S]*)?$     → anything after the closing delimiter
    const re = /^([\s\S]*?)<<(-?)\s*['"]?(\w+)['"]?[ \t]*\n([\s\S]*?)\n[ \t]*\3[ \t]*(?:[\s\S]*)?$/;
    const match = rawCommand.match(re);
    if (!match) return null;

    const prefix  = match[1] ?? '';
    const stripFlag = match[2] ?? '';
    const rawBody   = match[4] ?? '';

    const body: string = stripFlag === '-'
      ? rawBody.split('\n').map((l: string) => l.replace(/^\t+/, '')).join('\n')
      : rawBody;

    const prefixClean = prefix.trimEnd();

    // ── Redirect in prefix? (`> file` or `>> file`) ──────────────────────────
    const redirMatch = prefixClean.match(/(.*?)\s*(>>?)\s*(\S+)\s*$/);
    if (redirMatch) {
      const op         = redirMatch[2] as string;
      const targetFile = redirMatch[3] as string;
      const resolved   = this.resolvePath(targetFile);
      if (op === '>>') {
        let existing = '';
        try { existing = await this.readFile(resolved); } catch { /* file may not exist */ }
        await this.writeFile(resolved, existing ? `${existing}\n${body}` : body);
      } else {
        await this.writeFile(resolved, body);
      }
      return { output: '', exitCode: 0 };
    }

    // ── No redirect ───────────────────────────────────────────────────────────
    const tokens  = this.parseCommand(prefixClean);
    const cmdName = (tokens[0] ?? '').toLowerCase();

    // `cat <<` with no redirect just prints the heredoc body
    if (!cmdName || cmdName === 'cat') {
      return { output: body, exitCode: 0 };
    }

    // Script runners: write body to a temp file then execute it
    if (['node', 'bash', 'sh', 'python', 'py'].includes(cmdName)) {
      const ext     = cmdName === 'node' ? 'js' : (cmdName === 'python' || cmdName === 'py') ? 'py' : 'sh';
      const tmpPath = `/tmp/_hd_${Date.now()}.${ext}`;
      await this.writeFile(tmpPath, body);
      return this.execute([cmdName, tmpPath, ...tokens.slice(1)]);
    }

    // Fallback: pass content as the last positional argument
    return this.execute([...tokens, body]);
  }

  async execute(command: string | string[]): Promise<CommandResult> {
    // ── Heredoc pre-processing ────────────────────────────────────────────────
    if (typeof command === 'string' && command.includes('<<')) {
      try {
        const heredocResult = await this.executeHeredoc(command);
        if (heredocResult !== null) return heredocResult;
      } catch (err: any) {
        return { output: `heredoc error: ${err?.message ?? err}`, exitCode: 1 };
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const rawTokens = typeof command === 'string' ? this.parseCommand(command) : command;
    if (rawTokens.length === 0) {
      return { output: '', exitCode: 0 };
    }

    // Glob expansion (*)
    const fullCommand: string[] = [];
    for (const token of rawTokens) {
      if (token.includes('*') && !token.startsWith('$')) {
        const nodes = await this.vfs.listNodes(this.cwd);
        const pattern = new RegExp('^' + token.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        const matches = nodes
          .map(n => n.path.split('/').pop()!)
          .filter(name => name.match(pattern));

        if (matches.length > 0) {
          fullCommand.push(...matches.sort());
        } else {
          fullCommand.push(token);
        }
      } else {
        fullCommand.push(token);
      }
    }

    this.history.push(fullCommand.join(' '));

    // Support for basic chaining: ; and &&
    // This is a naive implementation that splits the array by tokens
    const expandedCommand = fullCommand.map(arg => this.expandVars(arg));
    const commands: string[][] = [];
    let current: string[] = [];
    const separators: string[] = [];

    for (const part of expandedCommand) {
      if (part === ';' || part === '&&' || part === '||' || part === '&') {
        commands.push(current);
        separators.push(part);
        current = [];
      } else {
        current.push(part);
      }
    }
    commands.push(current);

    let lastResult: CommandResult = { output: '', exitCode: 0 };
    let finalOutput = '';

    for (let i = 0; i < commands.length; i++) {
      let cmd = commands[i]!;
      const sep = separators[i - 1]; // separator before this command

      if (cmd.length === 0) continue;

      // Conditional execution logic
      if (sep === '&&' && lastResult.exitCode !== 0) break;
      if (sep === '||' && lastResult.exitCode === 0) break;

      // Handle Redirection: > and >>
      let redirectFile: string | null = null;
      let append = false;
      let redirectIdx = -1;

      // Find redirection operator: must be a separate token
      for (let j = 0; j < cmd.length; j++) {
        if (cmd[j] === '>') {
          redirectIdx = j;
          append = false;
          break;
        } else if (cmd[j] === '>>') {
          redirectIdx = j;
          append = true;
          break;
        }
      }

      if (redirectIdx !== -1 && redirectIdx < cmd.length - 1) {
        redirectFile = cmd[redirectIdx + 1]!;
        cmd = cmd.slice(0, redirectIdx);
      }

      let [cmdName, ...args] = cmd;

      // Alias expansion
      const aliases = this.getEnv('ALIASES');
      if (aliases && cmdName) {
        const aliasList = aliases.split(';').filter(Boolean);
        for (const entry of aliasList) {
          const [aliasName, ...cmdValueParts] = entry.split('=');
          const cmdValue = cmdValueParts.join('=');
          if (aliasName === cmdName) {
            const expanded = cmdValue.split(' ');
            cmdName = expanded[0]!;
            args = [...expanded.slice(1), ...args];
            break;
          }
        }
      }

      let handler = this.commands.get(cmdName!);

      if (!handler) {
        const resolved = await this.resolveCommand(cmdName!);
        if (resolved) {
          const result = resolved.type === 'capability'
            ? await this.executeCapability(resolved, args)
            : await this.executeScript(resolved, args);

          lastResult = result || { output: 'Internal execution error', exitCode: 1 };
          handler = NOOP_HANDLER;
        }
      }

      if (!handler) {
        lastResult = {
          output: `killio-os: command not found: ${cmdName}`,
          exitCode: 127
        };
      } else if (handler !== NOOP_HANDLER) {
        try {
          if (sep === '&') {
            handler(args, this).catch(e => console.error(`Background error: ${e}`));
            lastResult = { output: `[1] running ${cmdName} &`, exitCode: 0 };
          } else {
            const result = await handler(args, this);
            lastResult = result || { output: '', exitCode: 0 };
          }
        } catch (error: any) {
          lastResult = {
            output: `killio-os: error executing ${cmdName}: ${error.message}`,
            exitCode: 1
          };
        }
      }

      // Process redirection if any
      if (redirectFile && lastResult.output) {
        const resolvedPath = this.resolvePath(redirectFile);
        const content = lastResult.output;
        try {
          if (append) {
            const existing = await this.vfs.getNode(resolvedPath);
            const existingContent = existing?.content || '';
            const newContent = existingContent ? existingContent + '\n' + content : content;
            await this.execute(['write_file', resolvedPath, newContent]);
          } else {
            await this.execute(['write_file', resolvedPath, content]);
          }
          lastResult.output = ""; // Clear output since it was redirected
        } catch (error: any) {
          lastResult = {
            output: `killio-os: redirection error: ${error.message}`,
            exitCode: 1
          };
        }
      }

      if (finalOutput && lastResult.output) finalOutput += '\n';
      finalOutput += lastResult.output;

      if (sep === '&') continue; // Don't block on background
    }

    return {
      output: finalOutput.trim(),
      exitCode: lastResult.exitCode,
      metadata: lastResult.metadata
    };
  }

  getBootTime(): number {
    return this.bootTime;
  }

  getHostname(): string {
    return this.hostname;
  }

  async setUser(userId: string): Promise<void> {
    // In a real OS, we'd verify password here against /etc/shadow
    this.currentUserId = userId;
    this.setEnv('USER', userId);
    this.setEnv('HOME', userId === 'root' ? '/root' : `/home/${userId}`);
  }

  getCurrentUser(): string {
    return this.currentUserId;
  }

  getVFS(): VFSProvider {
    return this.vfs;
  }

  getCWD(): string {
    return this.cwd;
  }

  setCWD(path: string) {
    this.cwd = path;
  }

  getEnv(key: string): string | undefined {
    return this.env.get(key);
  }

  setEnv(key: string, value: string) {
    this.env.set(key, value);
  }

  getAllEnv(): Record<string, string> {
    return Object.fromEntries(this.env.entries());
  }

  getHistory(): string[] {
    return this.history;
  }

  resolvePath(filepath: string): string {
    if (filepath === '.') return this.cwd;
    let resolved = filepath.startsWith('/') ? filepath : `${this.cwd === '/' ? '' : this.cwd}/${filepath}`;

    // Normalize path
    const parts = resolved.split('/');
    const finalParts: string[] = [];
    for (const part of parts) {
      if (part === '.' || part === '') continue;
      if (part === '..') finalParts.pop();
      else finalParts.push(part);
    }
    return '/' + finalParts.join('/');
  }

  private async resolveCommand(name: string): Promise<FSNode | null> {
    const pathEnv = this.getEnv('PATH') || '/bin:/usr/bin';
    const paths = pathEnv.split(':');

    for (const p of paths) {
      const fullPath = this.resolvePath(`${p}/${name}`);
      const node = await this.vfs.getNode(fullPath);
      if (node && (node.type === 'capability' || node.type === 'file' || node.type === 'link')) {
        return node;
      }
    }
    return null;
  }

  private async executeCapability(node: FSNode, args: string[]): Promise<CommandResult> {
    const sourcePath = node.metadata?.sourcePath || '';
    const type = node.metadata?.capabilityType || 'wasm';
    const name = node.metadata?.name || node.path.split('/').pop() || 'unknown';

    const fileName = sourcePath.split('/').pop() || '';
    const internalPath = join(__dirname, 'sources', fileName);

    if (!existsSync(internalPath)) {
      return { output: `Capability source not found: ${fileName} at ${internalPath}`, exitCode: 1 };
    }

    if (type === 'js') {
      try {
        const oldCmdName = this.getEnv('CMD_NAME');
        this.env.set('CMD_NAME', name);
        
        // Use dynamic import for self-contained JS tools
        const fileUrl = pathToFileURL(internalPath).href;
        const module = await import(fileUrl);
        const runFn = module.default || module.run;

        if (typeof runFn !== 'function') {
          return { output: 'JS Capability Error: Module did not export a function (default or run)', exitCode: 1 };
        }
        const result = await runFn(args, this);
        
        if (oldCmdName) this.env.set('CMD_NAME', oldCmdName);
        else this.env.delete('CMD_NAME');
        
        return result;
      } catch (e: any) {
        return { output: `JS Capability Error: ${e.message}`, exitCode: 1 };
      }
    }

    if (type === 'wasm') {
      try {
        const wasmBuffer = readFileSync(internalPath);
        console.log(`[WASM-LOADER] Loading ${internalPath}, length: ${wasmBuffer.length}`);

        // VFS Bridge for WASM (ABI v1)
        const memory = new WebAssembly.Memory({ initial: 256 });
        const importObject = {
          env: {
            memory,
            // Returns file size or -1 if error
            vfs_get_size: (pathPtr: number, pathLen: number) => {
              const path = this.readStringFromMemory(memory, pathPtr, pathLen);
              const resolved = this.resolvePath(path);

              // We use a trick: WASM tools in Killio-OS are expected to be 
              // used with the Ephemeral Cache or we handle the sync/async bridge
              let size = -1;
              // Synchronous check if possible (for CacheProvider)
              const node = (this.vfs as any).nodes?.get ? (this.vfs as any).nodes.get(resolved) : null;
              if (node && node.type === 'file') {
                size = node.content?.length || 0;
              }

              return size;
            },
            vfs_read: (pathPtr: number, pathLen: number, bufPtr: number) => {
              const path = this.readStringFromMemory(memory, pathPtr, pathLen);
              const resolved = this.resolvePath(path);

              const node = (this.vfs as any).nodes?.get ? (this.vfs as any).nodes.get(resolved) : null;
              if (node && node.type === 'file') {
                const bytes = new TextEncoder().encode(node.content || '');
                const view = new Uint8Array(memory.buffer, bufPtr, bytes.length);
                view.set(bytes);
                return bytes.length;
              }
              return -1;
            },
            vfs_write: (pathPtr: number, pathLen: number, contentPtr: number, contentLen: number) => {
              const path = this.readStringFromMemory(memory, pathPtr, pathLen);
              const content = this.readStringFromMemory(memory, contentPtr, contentLen);
              const resolved = this.resolvePath(path);

              // Actually write to VFS
              this.vfs.createNode({
                path: resolved,
                type: 'file',
                ownerId: 'agent',
                parentPath: resolved.substring(0, resolved.lastIndexOf('/')) || '/',
                content: content,
                metadata: { created: new Date().toISOString() }
              }).catch(e => console.error(`WASM Bridge Write Error: ${e.message}`));
              return 0;
            },
            vfs_log: (ptr: number, len: number) => {
              console.log(`[WASM-TOOL] ${this.readStringFromMemory(memory, ptr, len)}`);
            }
          }
        };

        const { instance } = await (globalThis as any).WebAssembly.instantiate(wasmBuffer, importObject);
        const run = instance.exports.run as Function;
        if (typeof run !== 'function') {
          return { output: 'WASM Capability Error: "run" export not found', exitCode: 1 };
        }

        const result = run();
        return {
          output: `[WASM Output] Result Code: ${result}\nStatus: VFS-Aware Bridge Active`,
          exitCode: 0
        };
      } catch (e: any) {
        return { output: `WASM Capability Error: ${e.message}`, exitCode: 1 };
      }
    }

    return { output: `Unknown capability type: ${type}`, exitCode: 1 };
  }

  private readStringFromMemory(memory: WebAssembly.Memory, ptr: number, len: number): string {
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
  }

  private async executeScript(node: FSNode, args: string[]): Promise<CommandResult> {
    // If it's a JS file, we can run it via the 'node' builtin logic
    if (node.path.endsWith('.js')) {
      const nodeHandler = this.commands.get('node');
      if (nodeHandler) {
        return nodeHandler([node.path, ...args], this);
      }
    }

    // Otherwise try to run as shell script
    const shHandler = this.commands.get('sh');
    if (shHandler) {
      return shHandler([node.path, ...args], this);
    }

    return { output: `killio-os: cannot execute file: ${node.path}`, exitCode: 126 };
  }

  private async seedSystemConfigs() {
    await this.ensureDir('/etc', 'root', '755');
    await this.ensureDir('/usr', 'root', '755');
    await this.ensureDir('/usr/lib', 'root', '755');
    await this.ensureDir('/lib', 'root', '755');
    await this.ensureDir('/var', 'root', '755');
    await this.ensureDir('/var/log', 'root', '755');
    await this.ensureDir('/run', 'root', '755');

    // Arch Linux style configs
    await this.seedMockFile('/etc/os-release', 'NAME="Arch Linux"\nPRETTY_NAME="Arch Linux"\nID=arch\nBUILD_ID=rolling\nANSI_COLOR="38;2;23;147;209"\nHOME_URL="https://archlinux.org/"\nDOCUMENTATION_URL="https://wiki.archlinux.org/"\nSUPPORT_URL="https://bbs.archlinux.org/"\nBUG_REPORT_URL="https://bugs.archlinux.org/"\nPRIVACY_POLICY_URL="https://terms.archlinux.org/docs/privacy-policy/"');
    await this.seedMockFile('/etc/arch-release', '');
    await this.seedMockFile('/etc/pacman.conf', '[options]\nHoldPkg = pacman glibc\nArchitecture = auto\n\n[core]\nInclude = /etc/pacman.d/mirrorlist\n\n[extra]\nInclude = /etc/pacman.d/mirrorlist');
    await this.seedMockFile('/etc/fstab', '# /etc/fstab: static file system information.\n# <file system> <mount point>   <type>  <options>       <dump>  <pass>\n/dev/sda1       /               ext4    defaults        0       1');
    await this.seedMockFile('/etc/group', 'root:x:0:\nwheel:x:10:agent\nusers:x:100:agent\nagent:x:1000:');

    // /etc/passwd: user:id:gid:home:shell
    await this.seedMockFile('/etc/passwd', 'root:0:0:/root:/bin/bash\nagent:1000:1000:/home/agent:/bin/bash');
    await this.seedMockFile('/etc/hostname', this.hostname);
    await this.seedMockFile('/etc/resolv.conf', 'nameserver 1.1.1.1\nnameserver 8.8.8.8');

    // Mock libraries
    await this.seedMockFile('/usr/lib/libc.so.6', '/* Mock GLIBC */');
    await this.seedMockFile('/usr/lib/libm.so.6', '/* Mock LIB M */');
  }

  private async seedInternalCapabilities() {
    await this.ensureDir('/sys', 'root', '755');
    await this.ensureDir('/sys/bin', 'root', '755');

    // Seed a mock JS binary
    const jsPath = '/sys/bin/crypt.js';
    const jsNode = await this.vfs.getNode(jsPath);
    if (!jsNode) {
      await this.vfs.createNode({
        path: jsPath,
        type: 'file',
        ownerId: 'root',
        parentPath: '/sys/bin',
        content: 'console.log("Crypt Tool Initialized")',
        metadata: { created: new Date().toISOString(), owner: 'root', permissions: '755' }
      });
    }

    // Seed a mock WASM binary (header only)
    const wasmPath = '/sys/bin/compress.wasm';
    const wasmNode = await this.vfs.getNode(wasmPath);
    if (!wasmNode) {
      await this.vfs.createNode({
        path: wasmPath,
        type: 'file',
        ownerId: 'root',
        parentPath: '/sys/bin',
        content: 'WASM_BINARY_DATA',
        metadata: { created: new Date().toISOString(), owner: 'root', permissions: '755', isBinary: true }
      });
    }

    // Auto-install python and py from registry if not exists
    const pythonPath = '/bin/python';
    if (!(await this.vfs.getNode(pythonPath))) {
      await this.vfs.createNode({
        path: pythonPath,
        type: 'file',
        parentPath: '/bin',
        metadata: {
          name: 'python',
          sourcePath: 'sys/bin/python.js',
          version: '3.11.2',
          capabilityType: 'js',
          created: new Date().toISOString(),
          owner: 'root',
          permissions: '755'
        }
      });
    }

    const pyPath = '/bin/py';
    if (!(await this.vfs.getNode(pyPath))) {
      await this.vfs.createNode({
        path: pyPath,
        type: 'file',
        parentPath: '/bin',
        metadata: {
          name: 'py',
          sourcePath: 'sys/bin/python.js',
          version: '3.11.2',
          capabilityType: 'js',
          created: new Date().toISOString(),
          owner: 'root',
          permissions: '755'
        }
      });
    }

    const pipPath = '/bin/pip';
    if (!(await this.vfs.getNode(pipPath))) {
      await this.vfs.createNode({
        path: pipPath,
        type: 'file',
        parentPath: '/bin',
        metadata: {
          name: 'pip',
          sourcePath: 'sys/bin/python.js',
          version: '1.0.0',
          capabilityType: 'js',
          created: new Date().toISOString(),
          owner: 'root',
          permissions: '755'
        }
      });
    }
  }

  private parseCommand(command: string): string[] {
    const tokens: string[] = [];
    let currentToken = '';
    let inQuotes = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (escaped) {
        currentToken += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if ((char === '"' || char === "'") && !escaped) {
        if (inQuotes) {
          if (char === quoteChar) {
            inQuotes = false;
            quoteChar = '';
          } else {
            currentToken += char;
          }
        } else {
          inQuotes = true;
          quoteChar = char;
        }
        continue;
      }

      if (char === ' ' && !inQuotes) {
        if (currentToken.length > 0) {
          tokens.push(currentToken);
          currentToken = '';
        }
        continue;
      }

      currentToken += char;
    }

    if (currentToken.length > 0) {
      tokens.push(currentToken);
    }

    return tokens;
  }

  private async seedOMPThemes() {
    const themeDir = '/etc/oh-my-posh/themes';
    if (!(await this.vfs.getNode(themeDir))) {
      await this.mkdir(themeDir, true);
    }

    const themes: Record<string, any> = {
      'dracula.omp.json': {
        blocks: [{
          type: "prompt",
          alignment: "left",
          segments: [
            { background: "#6272a4", foreground: "#f8f8f2", leading_diamond: "\ue0b6", style: "diamond", template: "{{ .UserName }} ", type: "session" },
            { background: "#bd93f9", foreground: "#f8f8f2", powerline_symbol: "\ue0b0", style: "powerline", template: " {{ .Path }} ", type: "path" },
            { background: "#ffb86c", foreground: "#f8f8f2", powerline_symbol: "\ue0b0", style: "powerline", template: " {{ .HEAD }} ", type: "git" },
            { background: "#ff79c6", foreground: "#f8f8f2", style: "diamond", template: " \u2665 ", trailing_diamond: "\ue0b0", type: "text" }
          ]
        }],
        final_space: true,
        version: 4
      },
      'agnoster.omp.json': {
        blocks: [{
          type: "prompt",
          alignment: "left",
          segments: [
            { background: "#ffffff", foreground: "#100e23", powerline_symbol: "\ue0b0", style: "powerline", template: " {{ .UserName }}@{{ .HostName }} ", type: "session" },
            { background: "#91ddff", foreground: "#100e23", powerline_symbol: "\ue0b0", style: "powerline", template: " {{ .Path }} ", type: "path" },
            { background: "#95ffa4", foreground: "#193549", powerline_symbol: "\ue0b0", style: "powerline", template: " {{ .HEAD }} ", type: "git" }
          ]
        }],
        final_space: true,
        version: 4
      },
      'jandedobbeleer.omp.json': {
        blocks: [{
          type: "prompt",
          alignment: "left",
          segments: [
            { background: "#c386f1", foreground: "#ffffff", leading_diamond: "\ue0b6", style: "diamond", template: " {{ .UserName }} ", trailing_diamond: "\ue0b0", type: "session" },
            { background: "#ff479c", foreground: "#ffffff", powerline_symbol: "\ue0b0", style: "powerline", template: " {{ .Path }} ", type: "path" },
            { background: "#fffb38", foreground: "#193549", powerline_symbol: "\ue0b0", style: "powerline", template: " {{ .HEAD }} ", type: "git" }
          ]
        }],
        final_space: true,
        version: 4
      },
      'custom.omp.json': {
        palette: { "blue": "#89B4FA", "lavender": "#B4BEFE", "os": "#ACB0BE", "pink": "#F5C2E7" },
        blocks: [{
          type: "prompt",
          alignment: "left",
          segments: [
            { template: "\uF303 ", foreground: "p:os", type: "text", style: "plain" },
            { template: "{{ .UserName }}@{{ .HostName }} ", foreground: "p:blue", type: "session", style: "plain" },
            { template: "{{ .Path }} ", foreground: "p:pink", type: "path", style: "plain" },
            { template: "{{ .HEAD }} ", foreground: "p:lavender", type: "git", style: "plain" },
            { template: "\uf105", foreground: "p:os", type: "text", style: "plain" }
          ]
        }],
        final_space: true,
        version: 4
      },
      'robbyrussell.omp.json': {
        blocks: [{
          alignment: "left",
          segments: [
            { foreground: "#98C379", style: "plain", template: "\u279c", type: "text" },
            { foreground: "#56B6C2", style: "plain", template: "  {{ .Path }}", type: "path" },
            { foreground: "#D0666F", style: "plain", template: " <#5FAAE8>git:(</>{{ .HEAD }}<#5FAAE8>)</>", type: "git" }
          ],
          type: "prompt"
        }],
        final_space: true,
        version: 4
      },
      'pure.omp.json': {
        blocks: [
          {
            alignment: "left",
            segments: [
              { foreground: "#BF616A", style: "plain", template: "{{ .UserName }} ", type: "session" },
              { foreground: "#81A1C1", style: "plain", template: "{{ .Path }} ", type: "path" }
            ],
            type: "prompt"
          },
          {
            alignment: "left",
            segments: [{ foreground: "#6C6C6C", style: "plain", template: "{{ .UpstreamIcon }}{{ .HEAD }} ", type: "git" }],
            type: "prompt"
          },
          {
            alignment: "left",
            newline: true,
            segments: [{ foreground: "#B48EAD", style: "plain", template: "\u276f ", type: "status" }],
            type: "prompt"
          }
        ],
        final_space: true,
        version: 4
      },
      'tokyo.omp.json': {
        blocks: [
          {
            alignment: "left",
            leading_diamond: "<#7eb8da>\u250f</>",
            segments: [
              { foreground: "#7eb8da", style: "plain", template: "[ {{ .UserName }} :: {{ .HostName }} ]", type: "session" }
            ],
            type: "prompt"
          },
          {
            alignment: "left",
            newline: true,
            leading_diamond: "<#7eb8da>\u2523</>",
            segments: [
              { foreground: "#7eb8da", style: "plain", template: "[ {{ .Path }} ]", type: "path" },
              { foreground: "#ffa5d8", style: "plain", template: "[ {{ .HEAD }} ]", type: "git" }
            ],
            type: "prompt"
          },
          {
            alignment: "left",
            newline: true,
            leading_diamond: "<#7eb8da>\u2514\u2500</>",
            segments: [{ style: "plain", template: ">", type: "text" }],
            type: "prompt"
          }
        ],
        final_space: true,
        version: 4
      }
    };

    for (const [name, content] of Object.entries(themes)) {
      const path = `${themeDir}/${name}`;
      if (!(await this.vfs.getNode(path))) {
        await this.writeFile(path, JSON.stringify(content, null, 2), { owner: 'root', permissions: '644' });
      }
    }
  }
}
