import { type VFSProvider } from './provider.js';
import { type FSNode, type OSVariable } from '../types/index.js';
export declare class MountManager implements VFSProvider {
    private rootProvider;
    private mounts;
    constructor(rootProvider: VFSProvider);
    mount(path: string, provider: VFSProvider): void;
    unmount(path: string): void;
    getMounts(): string[];
    private getProviderForPath;
    init(): Promise<void>;
    getOwnerId(): string;
    getNode(path: string): Promise<FSNode | null>;
    listNodes(parentPath: string): Promise<FSNode[]>;
    createNode(node: Partial<FSNode>): Promise<void>;
    updateNode(path: string, updates: Partial<FSNode>): Promise<void>;
    deleteNode(path: string): Promise<void>;
    searchNodes(query: string): Promise<FSNode[]>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    getVariable(key: string): Promise<OSVariable | null>;
    setVariable(variable: OSVariable): Promise<void>;
    listVariables(scope?: string): Promise<OSVariable[]>;
}
//# sourceMappingURL=mount_manager.d.ts.map