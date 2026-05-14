import type { CommandHandler } from '../kernel.js';
import { MountManager } from '../vfs/mount_manager.js';
import { CAPABILITY_REGISTRY } from '../registry.js';
import * as dns from 'dns';
import * as os from 'os';
import chalk from 'chalk';

export const pwd: CommandHandler = async (_, kernel) => {
  return { output: kernel.getCWD(), exitCode: 0 };
};

export const cd: CommandHandler = async (args: string[], kernel) => {
  const path = kernel.resolvePath(args[0] || '/home/agent');
  try {
    const node = await kernel.getVFS().getNode(path);
    if (!node || node.type !== 'directory') {
      return { output: `cd: ${args[0] || ''}: No such directory`, exitCode: 1 };
    }
    kernel.setCWD(path);
    kernel.setEnv('PWD', path);
    return { output: `Changed directory to ${path}`, exitCode: 0 };
  } catch (e: any) {
    return { output: `cd: ${e.message}`, exitCode: 1 };
  }
};

export const env: CommandHandler = async (args: string[], kernel) => {
  if (args.length > 0) {
    const raw = args![0]!;
    const [key, value] = raw.split('=');
    if (value && key) {
      kernel.setEnv(key!, value!);
      await kernel.getVFS().setVariable({ key, value, scope: 'global', ownerId: kernel.getVFS().getOwnerId() });
      return { output: `${key}=${value}`, exitCode: 0 };
    }
  }

  const all = kernel.getAllEnv();
  const output = Object.entries(all).map(([k, v]) => `${k}=${v}`).join('\n');
  return { output, exitCode: 0 };
};

export const uname: CommandHandler = async (args: string[], kernel) => {
  if (args.includes('-a')) {
    const release = os.release();
    const arch = os.arch();
    return { output: `KillioOS ${kernel.getHostname()} ${release} Killio-Kernel ${arch} GNU/Linux`, exitCode: 0 };
  }
  if (args.includes('-r')) return { output: os.release(), exitCode: 0 };
  return { output: 'KillioOS', exitCode: 0 };
};

export const uptime: CommandHandler = async (_, kernel) => {
  const uptimeMs = Date.now() - kernel.getBootTime();
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const timeStr = `${hours % 24}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  return {
    output: ` ${timeStr} up ${days} days, ${hours % 24}:${(minutes % 60).toString().padStart(2, '0')}, 1 user, load average: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}`,
    exitCode: 0
  };
};

export const help: CommandHandler = async (args, kernel) => {
  const commands = Array.from((kernel as any).commands.keys()).sort();
  return {
    output: `Available commands:\n${commands.join(', ')}`,
    exitCode: 0
  };
};

export const sh: CommandHandler = async (args, kernel) => {
  if (args.length === 0) {
    return { output: 'sh: interactive mode not supported yet', exitCode: 1 };
  }

  // Handle -c "command string"
  if (args[0] === '-c' && args[1]) {
    const fullCmd = args[1]!.split(/\s+/).filter(Boolean);
    return await kernel.execute(fullCmd);
  }

  // Handle script file
  try {
    const content = await kernel.readFile(args[0]!);
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

    let lastOutput = '';
    let lastExitCode = 0;

    for (const line of lines) {
      const cmdTokens = line.trim().split(/\s+/).filter(Boolean);
      const result = await kernel.execute(cmdTokens);
      if (lastOutput) lastOutput += '\n';
      lastOutput += result.output;
      lastExitCode = result.exitCode;
      if (lastExitCode !== 0 && !line.includes('||')) break;
    }

    return { output: lastOutput, exitCode: lastExitCode };
  } catch (e: any) {
    return { output: `sh: ${e.message}`, exitCode: 1 };
  }
};

export const date: CommandHandler = async (_, kernel) => {
  return { output: new Date().toString(), exitCode: 0 };
};

export const ps: CommandHandler = async (_, kernel) => {
  const output = `  PID TTY          TIME CMD
    1 pts/0    00:00:00 init
   10 pts/0    00:00:00 bash
   42 pts/0    00:00:00 ps`;
  return { output, exitCode: 0 };
};

export const free: CommandHandler = async (_, kernel) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(0).padStart(11);

  const output = `               total        used        free      shared  buff/cache   available
Mem:   ${toMB(totalMem)}${toMB(usedMem)}${toMB(freeMem)}          0          0${toMB(freeMem)}
Swap:          0          0          0`;
  return { output, exitCode: 0 };
};

export const pacman: CommandHandler = async (args, kernel) => {
  if (args.includes('-Syu')) {
    const output = `:: Synchronizing package databases...
 core is up to date
 extra is up to date
 killio-repo is up to date
:: Starting full system upgrade...
resolving dependencies...
looking for conflicting packages...

Packages (3) killio-core-1.2.4-1  linux-killio-6.10.2-1  nodejs-22.0.0-1

Total Download Size:   142.50 MiB
Total Installed Size:  450.20 MiB
Net Upgrade Size:       12.05 MiB

:: Proceed with installation? [Y/n] y
(3/3) checking keys in keyring                     [######################] 100%
(3/3) checking package integrity                   [######################] 100%
(3/3) loading package files                        [######################] 100%
(3/3) checking for file conflicts                  [######################] 100%
(3/3) checking available disk space                [######################] 100%
:: Processing package changes...
(1/3) upgrading killio-core                        [######################] 100%
(2/3) upgrading linux-killio                       [######################] 100%
(3/3) upgrading nodejs                             [######################] 100%
:: Running post-transaction hooks...
(1/1) Updating system configuration...
Done.`;
    return { output, exitCode: 0 };
  } else if (args.includes('-S')) {
    const pkg = args[args.indexOf('-S') + 1] || args[args.length - 1];
    return {
      output: `resolving dependencies...\nlooking for conflicting packages...\n\nPackages (1) ${pkg}-1.0.0-1\n\n:: Proceed with installation? [Y/n] y\n(1/1) installing ${pkg}... [######################] 100%\nDone.`,
      exitCode: 0
    };
  } else if (args.includes('-Q') || args.includes('-Ql')) {
    return {
      output: `base 1.0.0-1\nlinux-killio 1.0.0-1\nbash 5.1.16-1\ncoreutils 9.1-1\ncurl 7.81.0-1\nnodejs 22.0.0-1\nzip 3.0-1\nunzip 6.0-1\ngit 2.34.1-1\npython 3.10.12-1`,
      exitCode: 0
    };
  }
  return {
    output: `usage:  pacman <operation> [...]\noperations:\n  pacman {-S --sync}\n  pacman {-R --remove}\n  pacman {-U --upgrade}\n  pacman {-Q --query}`,
    exitCode: 1
  };
};

export const df: CommandHandler = async (_, kernel) => {
  // Simulate disk usage based on VFS nodes
  const nodes = await kernel.getVFS().listNodes('/');
  const used = nodes.length * 4; // Mock 4KB per node
  const total = 100 * 1024 * 1024; // 100GB mock

  const output = `Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/vda1      ${total} ${used} ${total - used}   1% /
tmpfs            1638400    1200   1637200   1% /run
/tmp             1024000      ${used / 10}   1023000   1% /tmp`;
  return { output, exitCode: 0 };
};

export const top: CommandHandler = async () => {
  const output = `top - 00:15:00 up 10 days, 20 min,  1 user,  load average: 0.05, 0.02, 0.01
Tasks: 120 total,   1 running, 119 sleeping,   0 stopped,   0 zombie
%Cpu(s):  1.5 us,  0.5 sy,  0.0 ni, 98.0 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st
MiB Mem :  16000.0 total,   8000.0 free,   4000.0 used,   4000.0 buff/cache
MiB Swap:   4096.0 total,   4096.0 free,      0.0 used.  11000.0 avail Mem 

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
      1 root      20   0  165000  10000   8000 S   0.0   0.1   0:10.00 init
     10 root      20   0   15000   5000   4000 S   0.0   0.0   0:00.50 bash
     42 agent     20   0   12000   4000   3000 R   0.0   0.0   0:00.01 top`;
  return { output, exitCode: 0 };
};

export const ping: CommandHandler = async (args) => {
  if (args.length === 0) return { output: 'ping: usage error: Destination address required', exitCode: 1 };
  const target = args[0]!;

  let fakeIp = "104.21.42.5";
  let latency = 12.0;

  try {
    const start = Date.now();
    await dns.promises.lookup(target);
    latency = Math.max(1, Date.now() - start + Math.random() * 5);
  } catch (e: any) {
    if (!target.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) {
      return { output: `ping: ${target}: Name or service not known`, exitCode: 2 };
    }
  }

  if (target.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) {
    fakeIp = target;
  } else {
    let hash = 0;
    for (let i = 0; i < target.length; i++) hash = ((hash << 5) - hash) + target.charCodeAt(i);
    const a = Math.abs(hash) % 254 + 1;
    const b = Math.abs(hash >> 8) % 254 + 1;
    fakeIp = `172.64.${a}.${b}`;
  }

  const output = `PING ${target} (${fakeIp}) 56(84) bytes of data.
64 bytes from ${fakeIp}: icmp_seq=1 ttl=115 time=${(latency).toFixed(2)} ms
64 bytes from ${fakeIp}: icmp_seq=2 ttl=115 time=${(latency - 0.2).toFixed(2)} ms
64 bytes from ${fakeIp}: icmp_seq=3 ttl=115 time=${(latency + 0.3).toFixed(2)} ms
64 bytes from ${fakeIp}: icmp_seq=4 ttl=115 time=${(latency - 0.1).toFixed(2)} ms

--- ${target} ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3004ms
rtt min/avg/max/mdev = ${(latency - 0.2).toFixed(3)}/${(latency).toFixed(3)}/${(latency + 0.3).toFixed(3)}/0.038 ms`;
  return { output, exitCode: 0 };
};

export const ifconfig: CommandHandler = async () => {
  const nets = os.networkInterfaces();
  let output = '';

  for (const [name, info] of Object.entries(nets)) {
    if (!info) continue;
    const details = info[0]!;
    output += `${name}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n`;
    output += `        inet ${details.address}  netmask ${details.netmask}  broadcast 10.0.0.255\n`;
    output += `        ether ${details.mac}  txqueuelen 1000  (Ethernet)\n\n`;
  }

  return { output: output.trim(), exitCode: 0 };
};

export const chmod: CommandHandler = async (args, kernel) => {
  if (args.length < 2) return { output: 'chmod: missing operand', exitCode: 1 };
  try {
    await kernel.chmod(args[1]!, args[0]!);
    return { output: '', exitCode: 0 };
  } catch (e: any) {
    return { output: `chmod: ${e.message}`, exitCode: 1 };
  }
};

export const chown: CommandHandler = async (args, kernel) => {
  if (args.length < 2) return { output: 'chown: missing operand', exitCode: 1 };
  try {
    const ownerString = args[0]!;
    let owner = ownerString;
    let group = '';
    if (ownerString.includes(':')) {
      const parts = ownerString.split(':');
      owner = parts[0] || owner;
      group = parts[1] || group;
    }
    await kernel.chown(args[1]!, owner, group);
    return { output: '', exitCode: 0 };
  } catch (e: any) {
    return { output: `chown: ${e.message}`, exitCode: 1 };
  }
};

export const npm: CommandHandler = async (args, kernel) => {
  const op = args[0];

  if (args.includes('-v') || args.includes('--version')) {
    return { output: '10.9.2', exitCode: 0 };
  }

  if (!op || op === 'list' || op === 'ls') {
    return {
      output: `killio-os@1.1.4 ${kernel.getCWD()}\n` +
        `├── docx@8.5.0\n` +
        `├── pdfkit@0.15.0\n` +
        `├── marked@12.0.1\n` +
        `├── quickchart-js@3.1.3\n` +
        `├── adm-zip@0.5.12\n` +
        `└── killio-os-core@1.1.0`,
      exitCode: 0
    };
  }

  if (op === 'help' || op === '-h' || op === '--help') {
    return {
      output: `npm <command>\n\nUsage:\n\nnpm install        install all the dependencies in your project\nnpm install <foo>  add the <foo> dependency to your project\nnpm test           run this project's tests\nnpm run <foo>      run the script named <foo>\nnpm <command> -h   quick help on <command>\nnpm -l             display usage info for all commands\nnpm help <term>    search for help on <term> (in a browser)\nnpm help npm       more involved overview (in a browser)\n\nAll commands:\n\n    access, adduser, audit, bugs, cache, ci,\n    completion, config, dedupe, deprecate, diff,\n    dist-tag, docs, doctor, edit, exec, explain,\n    explore, find-dupes, fund, get, help, help-search,\n    hook, init, install, install-ci-test, install-test,\n    link, ll, login, logout, ls, org, outdated, owner,\n    pack, ping, pkg, prefix, profile, prune, publish,\n    query, rebuild, repo, restart, root, run-script,\n    sbom, search, set, shrinkwrap, star, stars, start,\n    stop, team, test, token, uninstall, unpublish,\n    unstar, update, version, view, whoami\n\nnpm@10.9.2 /usr/local/lib/node_modules/npm`,
      exitCode: 0
    };
  }

  if (op === 'install' || op === 'i' || op === 'add') {
    return {
      output: `npm ERR! code ENOTFOUND\nnpm ERR! syscall getaddrinfo\nnpm ERR! errno ENOTFOUND\nnpm ERR! network request to https://registry.npmjs.org/ failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org\nnpm ERR! network This is a problem related to network connectivity.\nnpm ERR! network In most cases you are behind a proxy or have bad network settings.\nnpm ERR! network \nnpm ERR! network If you are behind a proxy, please make sure that the\nnpm ERR! network 'proxy' config is set properly.  See: 'npm help config'`,
      exitCode: 1
    };
  }

  return { output: `npm <command>\n\nUsage: npm <command> [args]\n\nTry "npm help" for more information.`, exitCode: 1 };
};

export const kpm: CommandHandler = async (args, kernel) => {
  const op = args[0];
  if (!op || op === 'help') {
    return { output: 'Usage: kpm [install|list|search] <package>', exitCode: 0 };
  }

  if (op === 'list' || op === 'ls') {
    try {
      const binNodes = await kernel.listNodes('/bin');
      const installed = binNodes.filter(n => n.type === 'capability' || (n.type === 'file' && n.metadata?.capabilityType));

      if (installed.length === 0) return { output: 'No capabilities installed via kpm.', exitCode: 0 };

      const output = installed.map(n => {
        const meta = n.metadata || {};
        return `${chalk.green(n.path.split('/').pop())} - ${meta.version} (${meta.capabilityType})`;
      }).join('\n');

      return { output: `Installed capabilities:\n${output}`, exitCode: 0 };
    } catch (e: any) {
      return { output: `kpm: ${e.message}`, exitCode: 1 };
    }
  }

  if (op === 'search') {
    const query = args[1] || '';
    const results = Object.keys(CAPABILITY_REGISTRY).filter(name => name.includes(query));

    if (results.length === 0) return { output: `kpm: no matches found for "${query}"`, exitCode: 0 };

    const output = results.map(name => {
      const cap = CAPABILITY_REGISTRY[name]!;
      return `${chalk.yellow(name.padEnd(15))} | ${cap.version.padEnd(8)} | ${cap.description}`;
    }).join('\n');

    return { output: `NAME            | VERSION  | DESCRIPTION\n${'-'.repeat(50)}\n${output}`, exitCode: 0 };
  }

  if (op === 'install' || op === 'i') {
    const toolName = args[1];
    if (!toolName) return { output: 'kpm install: package name required', exitCode: 1 };

    const cap = CAPABILITY_REGISTRY[toolName];
    if (!cap) return { output: `kpm: package not found in registry: ${toolName}`, exitCode: 1 };

    try {
      const targetPath = `/bin/${toolName}`;
      const existing = await kernel.getVFS().getNode(targetPath);
      if (existing) return { output: `kpm: ${toolName} is already installed`, exitCode: 0 };

      await kernel.getVFS().createNode({
        path: targetPath,
        type: 'file',
        parentPath: '/bin',
        metadata: {
          ...cap,
          created: new Date().toISOString(),
          owner: 'root',
          permissions: '755'
        }
      });

      return { output: `Successfully installed ${toolName}@${cap.version}`, exitCode: 0 };
    } catch (e: any) {
      return { output: `kpm: ${e.message}`, exitCode: 1 };
    }
  }

  return { output: 'Usage: kpm [install|list|search]', exitCode: 1 };
};

export const mount: CommandHandler = async (args, kernel) => {
  const vfs = kernel.getVFS();
  if (vfs instanceof MountManager) {
    const mounts = vfs.getMounts();
    return { output: `Active mounts:\n${mounts.join('\n')}`, exitCode: 0 };
  }
  return { output: '/ on CacheProvider', exitCode: 0 };
};

export const clear: CommandHandler = async (args, kernel) => {
  return { output: '\x1Bc', exitCode: 0 };
};

export const whoami: CommandHandler = async (args, kernel) => {
  return { output: kernel.getCurrentUser(), exitCode: 0 };
};

export const hostname: CommandHandler = async (args, kernel) => {
  if (args.length === 0) {
    return { output: kernel.getHostname(), exitCode: 0 };
  }
  const newName = args[0]!;
  await kernel.setHostname(newName);
  return { output: `Hostname changed to ${newName}`, exitCode: 0 };
};

export const su: CommandHandler = async (args, kernel) => {
  const targetUser = args[0] || 'root';
  await kernel.setUser(targetUser);
  return { output: `Switched to user ${targetUser}`, exitCode: 0 };
};

export const sudo: CommandHandler = async (args, kernel) => {
  if (args.length === 0) {
    return { output: 'usage: sudo <command>', exitCode: 1 };
  }

  const currentUser = kernel.getCurrentUser();
  await kernel.setUser('root');

  try {
    const result = await kernel.execute(args);
    // If the command was 'su', we keep the new user
    if (args[0] === 'su') {
      return result;
    }
    // Otherwise revert
    await kernel.setUser(currentUser);
    return result;
  } catch (e: any) {
    await kernel.setUser(currentUser);
    return { output: `sudo error: ${e.message}`, exitCode: 1 };
  }
};
