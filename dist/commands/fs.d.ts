import type { CommandHandler } from '../kernel.js';
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
export declare const find: CommandHandler;
export declare const ls: CommandHandler;
export declare const mkdir: CommandHandler;
export declare const touch: CommandHandler;
export declare const write_file: CommandHandler;
export declare const cat: CommandHandler;
export declare const nano: CommandHandler;
export declare const rm: CommandHandler;
export declare const cp: CommandHandler;
export declare const mv: CommandHandler;
export declare const stat: CommandHandler;
export declare const sed: CommandHandler;
export declare const patch: CommandHandler;
export declare const head: CommandHandler;
export declare const tail: CommandHandler;
//# sourceMappingURL=fs.d.ts.map