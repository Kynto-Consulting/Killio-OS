export interface Capability {
  name: string;
  sourcePath: string;
  version: string;
  description: string;
  type: 'wasm' | 'js';
}

export const CAPABILITY_REGISTRY: Record<string, Capability> = {
  'compress': {
    name: 'compress',
    sourcePath: 'sys/bin/compress.wasm',
    version: '1.2.0',
    description: 'High-performance WASM compression',
    type: 'wasm'
  },
  'crypt': {
    name: 'crypt',
    sourcePath: 'sys/bin/crypt.js',
    version: '1.0.5',
    description: 'Advanced JS encryption (AES/SHA)',
    type: 'js'
  },
  'python': {
    name: 'python',
    sourcePath: 'sys/bin/python.js',
    version: '3.11.2',
    description: 'Python 3.11 WASM execution engine (Pyodide)',
    type: 'js'
  },
  'py': {
    name: 'py',
    sourcePath: 'sys/bin/python.js',
    version: '3.11.2',
    description: 'Python alias',
    type: 'js'
  },
  'pip': {
    name: 'pip',
    sourcePath: 'sys/bin/python.js',
    version: '1.0.0',
    description: 'Python Package Manager (Pyodide)',
    type: 'js'
  }
};
