import { type VFSProvider } from './vfs/provider.js';
import { type CommandResult, type FSNode } from './types/index.js';
export type CommandHandler = (args: string[], kernel: KillioKernel) => Promise<CommandResult>;
export declare class KillioKernel {
    private commands;
    private cwd;
    private env;
    private history;
    private currentUserId;
    private currentGroupId;
    private hostname;
    private bootTime;
    private vfs;
    constructor(vfs: VFSProvider);
    registerCommand(name: string, handler: CommandHandler): void;
    boot(): Promise<void>;
    private ensureDir;
    private seedMockFile;
    setHostname(name: string): Promise<void>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string, options?: {
        isBinary?: boolean;
        owner?: string;
        permissions?: string;
    }): Promise<void>;
    mkdir(path: string, recursive?: boolean): Promise<void>;
    unlink(path: string, recursive?: boolean): Promise<void>;
    listNodes(path: string): Promise<FSNode[]>;
    chmod(path: string, mode: string): Promise<void>;
    stat(path: string): Promise<FSNode>;
    chown(path: string, owner: string, group?: string): Promise<void>;
    checkPermission(node: FSNode | null | undefined, access: 'r' | 'w' | 'x'): boolean;
    expandVars(text: string): string;
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
    private executeHeredoc;
    execute(command: string | string[]): Promise<CommandResult>;
    getBootTime(): number;
    getHostname(): string;
    setUser(userId: string): Promise<void>;
    getCurrentUser(): string;
    getVFS(): VFSProvider;
    getCWD(): string;
    setCWD(path: string): void;
    getEnv(key: string): string | undefined;
    setEnv(key: string, value: string): void;
    getAllEnv(): Record<string, string>;
    getHistory(): string[];
    resolvePath(filepath: string): string;
    private resolveCommand;
    private executeCapability;
    private readStringFromMemory;
    private executeScript;
    private seedSystemConfigs;
    private seedInternalCapabilities;
    private parseCommand;
    private seedOMPThemes;
}
//# sourceMappingURL=kernel.d.ts.map