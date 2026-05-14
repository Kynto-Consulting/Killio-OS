# Killio-OS 🚀

Killio-OS is a lightweight, kernel-based virtual operating system designed specifically for AI agents and autonomous workflows. It provides a secure, sandboxed environment with a POSIX-like virtual filesystem, persistent storage, and built-in essential utilities.

## Features ✨

- **Virtual Filesystem (VFS)**: POSIX-compliant filesystem with support for files, directories, symlinks, and permissions.
- **Python WASM (Pyodide)**: High-performance Python 3.11 execution engine integrated directly into the kernel.
- **Native VFS Bridge**: Python scripts can natively `open()`, `read()`, and `write()` to the virtual filesystem using standard library functions.
- **`pip` Package Manager**: Install and use popular libraries like `numpy`, `pandas`, `requests`, and `matplotlib` dynamically.
- **Ephemeral Library System**: Reserved `/tmp` mount using `CacheProvider` ensures that library installations and temporary files are in-memory only and never bloat your persistent database.
- **Git Integration**: Full local version control support powered by `isomorphic-git`.
- **Persistence Providers**:
  - **Turso (LibSQL)**: Cloud-native persistent storage with multi-tenant support via `ownerId`.
  - **Memory/Cache**: Fast, ephemeral storage for stateless operations.
  - **MountManager**: Advanced path-based mounting for hybrid storage (e.g., persistent `/home` + ephemeral `/tmp`).
- **Essential Utilities**: Built-in commands like `ls`, `mkdir`, `rm`, `mv`, `cp`, `cat`, `grep`, `zip`, `unzip`, and professional-grade `npm`/`kpm` discovery.
- **Visual CLI**: Enhanced prompt support with `oh-my-posh` JSON theme compatibility.
- **Node.js Execution**: Execute JavaScript files directly within the virtual environment.
- **Rich Library Support**: Pre-loaded with `docx`, `pdfkit`, `marked`, `quickchart-js`, and `adm-zip` for advanced document generation.
- **Extensible Architecture**: Easily add custom commands and filesystem providers.

## Installation 📦

```bash
npm install killio-os
```

## Quick Start 🚀

```typescript
import { KillioKernel, TursoProvider } from 'killio-os';

// 1. Initialize a provider (e.g., Turso for persistent storage)
const provider = new TursoProvider(
  process.env.TURSO_URL,
  process.env.TURSO_AUTH_TOKEN,
  'my-agent-session'
);

// 2. Instantiate and boot the kernel
const kernel = new KillioKernel(provider);
await kernel.boot();

// 3. Execute commands
const result = await kernel.execute(['write_file', 'hello.txt', 'Hello from Killio-OS!']);
console.log(result.output); // File written successfully

const readRes = await kernel.execute(['read_file', 'hello.txt']);
console.log(readRes.output); // Hello from Killio-OS!

// 4. Run complex workflows (like Git)
await kernel.execute(['git', 'init']);
await kernel.execute(['git', 'add', '.']);
await kernel.execute(['git', 'commit', '-m', 'Initial commit']);
```

## Architecture 🏗️

### Kernel
The heart of the system. It handles command routing, environment variables, path resolution, and bridges the VFS with the execution layer.

### VFS (Virtual Filesystem)
Abstracts storage logic. You can swap providers without changing your code.
- `TursoProvider`: Uses a remote SQLite database for persistence.
- `CacheProvider`: In-memory storage.

### Commands
Each command is a discrete module. Killio-OS includes a set of `builtin` commands, but you can register your own via `kernel.registerCommand()`.

## Security 🛡️
Killio-OS is designed to be a "closed system". Network-dependent git operations like `clone` or `pull` are blocked by default to maintain environment integrity, while local version control remains fully functional.

## License 📄
MIT
