import { type VFSProvider } from './provider.js';
import { type FSNode, type OSVariable } from '../types/index.js';

export class MountManager implements VFSProvider {
  private mounts: Map<string, VFSProvider> = new Map();

  constructor(private rootProvider: VFSProvider) {}

  mount(path: string, provider: VFSProvider) {
    // Normalize path to not have trailing slash unless it's root
    const normalizedPath = path === '/' ? '/' : path.replace(/\/$/, '');
    this.mounts.set(normalizedPath, provider);
  }

  unmount(path: string) {
    const normalizedPath = path === '/' ? '/' : path.replace(/\/$/, '');
    this.mounts.delete(normalizedPath);
  }

  getMounts(): string[] {
    return Array.from(this.mounts.keys());
  }

  private getProviderForPath(path: string): { provider: VFSProvider; subPath: string; mountPoint: string } {
    const sortedMounts = Array.from(this.mounts.keys()).sort((a, b) => b.length - a.length);
    
    for (const mountPoint of sortedMounts) {
      if (path === mountPoint || path.startsWith(mountPoint + '/')) {
        return { 
          provider: this.mounts.get(mountPoint)!, 
          subPath: path, // We pass the full path to the provider, providers should handle absolute paths
          mountPoint 
        };
      }
    }

    return { provider: this.rootProvider, subPath: path, mountPoint: '/' };
  }

  async init(): Promise<void> {
    await this.rootProvider.init();
    for (const provider of this.mounts.values()) {
      await provider.init();
    }
  }

  getOwnerId(): string {
    return this.rootProvider.getOwnerId();
  }

  async getNode(path: string): Promise<FSNode | null> {
    const { provider } = this.getProviderForPath(path);
    return provider.getNode(path);
  }

  async listNodes(parentPath: string): Promise<FSNode[]> {
    const { provider } = this.getProviderForPath(parentPath);
    const nodes = await provider.listNodes(parentPath);
    
    // Also include mount points that are direct children of parentPath
    for (const mountPoint of this.mounts.keys()) {
      const mountParent = mountPoint.substring(0, mountPoint.lastIndexOf('/')) || '/';
      if (mountParent === parentPath && mountPoint !== '/') {
        // Only add if not already there
        if (!nodes.find(n => n.path === mountPoint)) {
          nodes.push({
            id: `mount:${mountPoint}`,
            path: mountPoint,
            type: 'directory',
            ownerId: 'root',
            parentPath,
            content: null,
            updatedAt: new Date().toISOString(),
            metadata: { created: new Date().toISOString(), permissions: '755', owner: 'root' }
          });
        }
      }
    }
    
    return nodes;
  }

  async createNode(node: Partial<FSNode>): Promise<void> {
    if (!node.path) throw new Error('Path is required to create node');
    const { provider } = this.getProviderForPath(node.path);
    return provider.createNode(node);
  }

  async updateNode(path: string, updates: Partial<FSNode>): Promise<void> {
    const { provider } = this.getProviderForPath(path);
    return provider.updateNode(path, updates);
  }

  async deleteNode(path: string): Promise<void> {
    const { provider } = this.getProviderForPath(path);
    return provider.deleteNode(path);
  }

  async searchNodes(query: string): Promise<FSNode[]> {
    const results = await this.rootProvider.searchNodes(query);
    for (const provider of this.mounts.values()) {
      const providerResults = await provider.searchNodes(query);
      results.push(...providerResults);
    }
    // De-duplicate if necessary, but paths should be unique across providers if mounted correctly
    return results;
  }

  async readFile(path: string): Promise<string> {
    const { provider } = this.getProviderForPath(path);
    return provider.readFile(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const { provider } = this.getProviderForPath(path);
    return provider.writeFile(path, content);
  }

  async getVariable(key: string): Promise<OSVariable | null> {
    // Variables are usually global/root, but we could scope them. 
    // For now, let's stick to root provider for variables.
    return this.rootProvider.getVariable(key);
  }

  async setVariable(variable: OSVariable): Promise<void> {
    return this.rootProvider.setVariable(variable);
  }

  async listVariables(scope?: string): Promise<OSVariable[]> {
    return this.rootProvider.listVariables(scope);
  }
}
