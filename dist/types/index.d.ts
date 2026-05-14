export type NodeType = 'file' | 'directory' | 'link' | 'capability';
export interface FSNode {
    id: string;
    path: string;
    type: NodeType;
    ownerId: string;
    content: string | null;
    metadata: Record<string, any>;
    parentPath: string | null;
    updatedAt: string;
}
export interface OSVariable {
    key: string;
    value: string;
    scope: 'session' | 'global';
    ownerId: string;
}
export interface CommandResult {
    output: string;
    exitCode: number;
    metadata?: Record<string, any> | undefined;
}
//# sourceMappingURL=index.d.ts.map