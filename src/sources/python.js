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
# Ensure /tmp is in path for site-packages.
# APPEND (not insert(0)): the interpreter's native site-packages must take
# precedence, otherwise relocated copies shadow packages with compiled
# extensions (e.g. numpy) and break their dynlib linkage.
if "/tmp/site-packages" not in sys.path:
    sys.path.append("/tmp/site-packages")
`);
      
      await pyodide.loadPackage('micropip');

      // SECURITY (structural, defense-in-depth): neuter the host-JS FFI.
      // Pyodide's `import js` reflects the host global scope (js.process,
      // js.require in a Node embedding = full host reach). We replace the `js`
      // module with an empty object AFTER micropip has bound the js references
      // it needs, so package installation still works while guest `import js`
      // yields nothing --- and, crucially, this survives a guest that tries to
      // bypass the import allowlist by clearing sys.meta_path or deleting
      // sys.modules['js'] and re-importing: the empty module is returned either
      // way. This closes the interpreter-state-manipulation escape that a pure
      // import guard (reachable from within the shared interpreter) cannot.
      try { pyodide.registerJsModule('js', {}); } catch (e) {}

      // SECURITY: allowlist-based, deny-by-default import control for GUEST code.
      //
      // Rather than blocking a hand-picked set of dangerous modules (a denylist,
      // which fails open on anything we forgot), the guest import path is
      // deny-by-default: a module is importable only if (a) its top-level name is
      // on an explicit allowlist of safe standard-library modules, OR (b) it is a
      // package the user installed via pip (present under site-packages). Every
      // other import --- js (the host-JS FFI), socket, ctypes, subprocess, and
      // any module we never anticipated --- is denied structurally, because the
      // default is denial, not permission.
      //
      // A small deny-overlay covers network/host submodules of otherwise-safe
      // packages (e.g. urllib.request under the allowed urllib). micropip keeps
      // the js/pyfetch references it bound at load time, so trusted package
      // installation still works; the guard governs guest imports only.
      await pyodide.runPythonAsync(`
import sys, os

# Generous allowlist of safe stdlib top-level modules an agent legitimately uses.
_SAFE_ROOTS = {
    "os","sys","io","re","json","csv","math","cmath","statistics","random",
    "datetime","time","calendar","zoneinfo","collections","itertools","functools",
    "operator","string","textwrap","pathlib","typing","dataclasses","enum","abc",
    "copy","heapq","bisect","decimal","fractions","numbers","array","struct",
    "hashlib","hmac","base64","binascii","secrets","uuid","zlib","gzip","bz2",
    "lzma","tarfile","zipfile","configparser","argparse","glob","fnmatch",
    "tempfile","shutil","unicodedata","html","xml","email","mimetypes","pprint",
    "urllib","http","ipaddress","stringprep","quopri","uu","packaging",
    "pkg_resources","setuptools","wheel","zipp","attr","attrs","typing_extensions",
    "warnings","traceback","logging","contextlib","weakref","gc","inspect","ast",
    "dis","tokenize","keyword","builtins","__future__","encodings","codecs",
    "locale","queue","threading","asyncio","concurrent","contextvars","difflib",
    "graphlib","reprlib","types","importlib","site","sysconfig","platform",
    "pydoc","doctest","unittest","pickle","copyreg","shelve","marshal",
}
# Network/host submodules of allowed packages that must still be denied.
_DENY_PREFIXES = (
    "urllib.request","urllib.error","http.client","http.server","xmlrpc",
    "socketserver","asyncio.unix_events","asyncio.windows_events",
)
# Always-deny roots (host/network/native reach), even if present anywhere.
_DENY_ROOTS = {"js","pyodide_js","socket","_socket","ssl","ctypes","subprocess",
               "multiprocessing","signal","mmap","fcntl","termios","pty","tty","pexpect",
               "select","selectors","ftplib","smtplib","poplib","imaplib",
               "telnetlib","nntplib","asyncore","asynchat","_ctypes"}

def _site_dirs():
    return [p for p in sys.path if "site-packages" in p]

def _is_installed_pkg(root):
    for d in _site_dirs():
        try:
            if os.path.isdir(os.path.join(d, root)): return True
            if os.path.exists(os.path.join(d, root + ".py")): return True
            for f in os.listdir(d):
                if f == root or f.startswith(root + "-") or f.startswith(root + "."):
                    return True
        except Exception:
            pass
    return False

# Drop any dangerous modules already imported so cached refs cannot be reused.
for _m in list(sys.modules):
    _r = _m.split(".")[0]
    if _r in _DENY_ROOTS:
        del sys.modules[_m]

_BUILTIN = set(sys.builtin_module_names)

class _AllowlistImporter:
    # When trusted is True (only while the embedder's own pip handler runs),
    # imports pass through so micropip can pull its dependencies. Guest code
    # never sets this. (In a shared interpreter this flag, like any in-Python
    # guard, is reachable by a guest that rewrites the import machinery; hard
    # isolation runs Pyodide in a scope-restricted worker, see the paper.)
    trusted = False
    def find_spec(self, name, path=None, target=None):
        if type(self).trusted:
            return None
        root = name.split(".")[0]
        # Deny overlay first: dangerous roots and network/host submodules.
        if root in _DENY_ROOTS or any(name == p or name.startswith(p + ".") for p in _DENY_PREFIXES):
            raise ImportError(f"import of '{name}' denied by sandbox allowlist policy")
        # Allow: safe stdlib, interpreter builtins, C-accelerator/internal
        # underscore modules (the dangerous ones are already denied above),
        # and user-installed packages. Everything else is denied by default.
        if (root in _SAFE_ROOTS or root in _BUILTIN or root.startswith("_")
                or _is_installed_pkg(root)):
            return None
        raise ImportError(
            f"import of '{name}' denied: not on the sandbox allowlist "
            f"(deny-by-default). Install it with pip to use it."
        )

if not any(type(f).__name__ == "_AllowlistImporter" for f in sys.meta_path):
    sys.meta_path.insert(0, _AllowlistImporter())

# SECURITY (critical): neuter the host-command-execution functions on the
# otherwise-allowed 'os' module. In a Node embedding, Pyodide's Emscripten
# system()/exec()/popen() shell out to the REAL host shell (verified: os.system
# creates files on the host filesystem). Agents need os.path/os.getcwd/os.listdir,
# so we keep 'os' on the allowlist but replace every shell-out entry point with a
# thrower. subprocess/multiprocessing are already import-denied.
import os as _os
def _blocked_exec(*a, **k):
    raise OSError("host command execution is disabled in this sandbox (closed by construction)")
for _n in ("system","popen","execv","execve","execvp","execvpe","execl","execle",
           "execlp","execlpe","spawnv","spawnve","spawnvp","spawnvpe","spawnl",
           "spawnle","spawnlp","spawnlpe","posix_spawn","posix_spawnp","startfile",
           "fork","forkpty","exec","kill","killpg"):
    if hasattr(_os, _n):
        try: setattr(_os, _n, _blocked_exec)
        except Exception: pass
`);

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
        // Binary artifacts (WASM dynlibs, wheels) cannot round-trip through a
        // utf8 string VFS write; skip them rather than persist corrupt copies.
        if (/\.(so|pyd|dylib|whl|a|wasm)$/.test(pyPath)) return;
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
import sys

# TRUSTED path: flip the allowlist guard into trusted mode BEFORE importing
# micropip (whose import chain pulls in pyodide.http, which the guard would
# otherwise deny). Guest execution never enters trusted mode; only the
# embedder's pip handler does. Restored in the finally clause.
for _f in sys.meta_path:
    if type(_f).__name__ == "_AllowlistImporter":
        type(_f).trusted = True

try:
    import micropip
    import os
    import shutil
    import sysconfig

    if not os.path.exists("/tmp/site-packages"):
        os.makedirs("/tmp/site-packages")

    await micropip.install('${pkg}', keep_going=True)

    # Relocate pure-Python distributions from internal /lib to ephemeral /tmp.
    # Packages with compiled (WASM) extension modules must NOT be copied: the
    # copy breaks their dynlib linkage and the broken copy would shadow the
    # working install. They stay in the interpreter's own site-packages (also
    # in-memory, never synced to the VFS) and are recorded in a manifest so a
    # fresh interpreter can reinstall them.
    lib_path = sysconfig.get_paths()["purelib"]
    target_path = "/tmp/site-packages"
    BINARY_EXTS = (".so", ".pyd", ".dylib")

    def _has_binary(path):
        if not os.path.isdir(path):
            return path.endswith(BINARY_EXTS)
        for root, dirs, files in os.walk(path):
            if any(f.endswith(BINARY_EXTS) for f in files):
                return True
        return False

    for item in os.listdir(lib_path):
        if item == "micropip" or item.startswith("_"): continue
        src = os.path.join(lib_path, item)
        dst = os.path.join(target_path, item)
        if os.path.exists(dst):
            continue
        if _has_binary(src):
            if not item.endswith(".dist-info"):
                with open(os.path.join(target_path, ".compiled-packages"), "a") as m:
                    m.write(item + "\\n")
            continue
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
finally:
    # Leave trusted mode and drop any host/network modules micropip pulled into
    # sys.modules, so guest code cannot reuse a cached reference to them.
    for _f in sys.meta_path:
        if type(_f).__name__ == "_AllowlistImporter":
            type(_f).trusted = False
    for _m in ("js", "socket", "_socket", "ssl", "ipaddress"):
        sys.modules.pop(_m, None)
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
