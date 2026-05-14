export interface Capability {
    name: string;
    sourcePath: string;
    version: string;
    description: string;
    type: 'wasm' | 'js';
}
export declare const CAPABILITY_REGISTRY: Record<string, Capability>;
//# sourceMappingURL=registry.d.ts.map