import { type VFSProvider } from './provider.js';
import type { FSNode, OSVariable } from '../types/index.js';
export declare class CacheProvider implements VFSProvider {
    private ownerId;
    private nodes;
    private variables;
    constructor(ownerId?: string);
    getOwnerId(): string;
    init(): Promise<void>;
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
//# sourceMappingURL=cache.provider.d.ts.map