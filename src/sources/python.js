import { loadPyodide } from 'pyodide';

let pyodideInstance = null;

export async function run(args, kernel) {
  const cmdName = kernel.getEnv('CMD_NAME');
  const isPip = cmdName === 'pip' || args[0] === 'pip';
  const actualArgs = (args[0] === 'pip') ? args.slice(1) : args;

  if (!isPip && (actualArgs.includes('--version') || actualArgs.includes('-v'))) {
    return { output: 'Python 3.11.2 (Pyodide WASM)', exitCode: 0 };
  }

  let pyodide = pyodideInstance;
  if (!pyodide) {
    try {
      pyodide = await loadPyodide();
      
      // Bootstrap environment
      await pyodide.runPythonAsync(`
import sys
import os
# Ensure /tmp is in path for site-packages
if "/tmp/site-packages" not in sys.path:
    sys.path.insert(0, "/tmp/site-packages")
`);
      
      await pyodide.loadPackage('micropip');
      pyodideInstance = pyodide;
    } catch (e) {
      return { output: `Failed to load Pyodide: ${e.message}`, exitCode: 1 };
    }
  }

  const vfs = kernel.getVFS();
  
  // PROTECTED_PATHS: Paths that should NOT be synced back to the VFS at all.
  // We NO LONGER include /tmp here because /tmp is now a dedicated ephemeral CacheProvider.
  // This allows Python to write to /tmp and have it persist in memory across the session.
  const PROTECTED_PATHS = ['/dev', '/proc', '/sys', '/lib', '/home/pyodide', '/usr/lib', '/usr/local/lib'];

  async function syncToPyodide(vfsPath) {
    try {
      const node = await vfs.getNode(vfsPath);
      if (!node) return;
      if (node.type === 'directory') {
        try { pyodide.FS.mkdirTree(vfsPath); } catch (e) {}
        const children = await kernel.listNodes(vfsPath);
        for (const child of children) { await syncToPyodide(child.path); }
      } else {
        try {
          const parent = vfsPath.substring(0, vfsPath.lastIndexOf('/'));
          if (parent) { try { pyodide.FS.mkdirTree(parent); } catch (e) {} }
          const content = await kernel.readFile(node.path);
          pyodide.FS.writeFile(vfsPath, content);
        } catch (e) {}
      }
    } catch (e) {}
  }

  async function syncFromPyodide(pyPath) {
    try {
      // CRITICAL: Skip internal WASM system paths
      if (PROTECTED_PATHS.some(p => pyPath === p || pyPath.startsWith(p + '/'))) return;
      
      const stat = pyodide.FS.stat(pyPath);
      if (pyodide.FS.isDir(stat.mode)) {
        const entries = pyodide.FS.readdir(pyPath);
        for (const entry of entries) {
          if (entry === '.' || entry === '..') continue;
          await syncFromPyodide((pyPath === '/' ? '' : pyPath) + '/' + entry);
        }
      } else {
        const content = pyodide.FS.readFile(pyPath, { encoding: 'utf8' });
        await kernel.writeFile(pyPath, content);
      }
    } catch (e) {}
  }

  // Sync VFS -> Pyodide
  await syncToPyodide('/');

  let output = '';
  pyodide.setStdout({ batched: (str) => { output += str + '\n'; } });
  pyodide.setStderr({ batched: (str) => { output += 'ERR: ' + str + '\n'; } });

  try { pyodide.FS.chdir(kernel.getCWD()); } catch (e) { pyodide.FS.chdir('/'); }

  // Handle PIP
  if (isPip) {
    const subCommand = actualArgs[0];
    if (subCommand === 'install') {
      const pkg = actualArgs[1];
      if (!pkg) return { output: 'Usage: pip install <package>', exitCode: 1 };
      
      output += `Collecting ${pkg}...\n`;
      try {
        await pyodide.runPythonAsync(`
import micropip
import os
import shutil

if not os.path.exists("/tmp/site-packages"):
    os.makedirs("/tmp/site-packages")

await micropip.install('${pkg}', keep_going=True)

# Relocate from internal /lib to ephemeral /tmp
lib_path = "/lib/python3.13/site-packages"
target_path = "/tmp/site-packages"
for item in os.listdir(lib_path):
    if item == "micropip" or item.startswith("_"): continue
    src = os.path.join(lib_path, item)
    dst = os.path.join(target_path, item)
    if not os.path.exists(dst):
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
`);
        // Sync back to ephemeral VFS (/tmp)
        await syncFromPyodide('/tmp');
        
        output += `Successfully installed ${pkg} (Relocated to /tmp/site-packages).\n`;
        return { output: output.trim(), exitCode: 0 };
      } catch (e) {
        return { output: `Pip Error: ${e.message}`, exitCode: 1 };
      }
    }
    return { output: 'Killio Pip v1.2.2 (Ephemeral /tmp Relocator)\nUsage: pip install <package>', exitCode: 0 };
  }

  const scriptArg = actualArgs[0];
  if (!scriptArg) {
    return { output: 'Python 3.11.2 (Pyodide WASM)\nUsage: python <script.py> [args]', exitCode: 0 };
  }

  if (scriptArg === '-c') {
    const code = actualArgs[1];
    if (!code) return { output: 'Usage: python -c "<code>"', exitCode: 1 };
    try {
      await pyodide.runPythonAsync(code);
      await syncFromPyodide('/');
      return { output: output.trim(), exitCode: 0 };
    } catch (e) {
      return { output: `Python Error: ${e.message}\n${output.trim()}`, exitCode: 1 };
    }
  }

  try {
    const vfsScriptPath = kernel.resolvePath(scriptArg);
    const code = pyodide.FS.readFile(vfsScriptPath, { encoding: 'utf8' });
    await pyodide.runPythonAsync(code);
    await syncFromPyodide('/');
    return { output: output.trim(), exitCode: 0 };
  } catch (e) {
    return { output: `Python Error: ${e.message}\n${output.trim()}`, exitCode: 1 };
  }
}
