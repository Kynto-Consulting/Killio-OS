import { type VFSProvider } from './provider.js';
import type { FSNode, OSVariable } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class CacheProvider implements VFSProvider {
  private nodes: Map<string, FSNode> = new Map();
  private variables: Map<string, OSVariable> = new Map();

  constructor(private ownerId: string = 'default') {}

  getOwnerId(): string {
    return this.ownerId;
  }

  async init(): Promise<void> {
    // In-memory provider doesn't need much initialization
  }

  async getNode(path: string): Promise<FSNode | null> {
    const node = this.nodes.get(`${this.ownerId}:${path}`);
    return node || null;
  }

  async listNodes(parentPath: string): Promise<FSNode[]> {
    const all = Array.from(this.nodes.values());
    const filtered = all.filter(n => n.parentPath === parentPath && n.ownerId === this.ownerId);
    // console.log(`[CacheProvider] listNodes(${parentPath}): total=${all.length}, filtered=${filtered.length}`);
    return filtered;
  }

  async createNode(node: Partial<FSNode>): Promise<void> {
    if (!node.path) throw new Error('Path is required');
    const fullNode = node as FSNode;
    fullNode.ownerId = this.ownerId;
    if (!fullNode.id) fullNode.id = uuidv4();
    this.nodes.set(`${this.ownerId}:${node.path}`, fullNode);
  }

  async updateNode(path: string, updates: Partial<FSNode>): Promise<void> {
    const key = `${this.ownerId}:${path}`;
    const existing = this.nodes.get(key);
    if (!existing) throw new Error('Node not found');
    this.nodes.set(key, { ...existing, ...updates, ownerId: this.ownerId });
  }

  async deleteNode(path: string): Promise<void> {
    const key = `${this.ownerId}:${path}`;
    this.nodes.delete(key);
    // Recursively delete children
    for (const [nodeKey, node] of this.nodes.entries()) {
      if (node.ownerId === this.ownerId && node.path.startsWith(path + '/')) {
        this.nodes.delete(nodeKey);
      }
    }
  }

  async searchNodes(query: string): Promise<FSNode[]> {
    return Array.from(this.nodes.values()).filter(n =>
      n.ownerId === this.ownerId && (n.path.includes(query) || (n.content && n.content.includes(query)))
    );
  }

  async readFile(path: string): Promise<string> {
    const node = this.nodes.get(`${this.ownerId}:${path}`);
    if (!node || node.type !== 'file') throw new Error(`File not found: ${path}`);
    return node.content || '';
  }

  async writeFile(path: string, content: string): Promise<void> {
    const key = `${this.ownerId}:${path}`;
    const existing = this.nodes.get(key);
    if (existing) {
      existing.content = content;
      existing.metadata = { ...existing.metadata, modified: new Date().toISOString() };
    } else {
      await this.createNode({
        path,
        type: 'file',
        content,
        parentPath: path.substring(0, path.lastIndexOf('/')) || '/'
      });
    }
  }

  async getVariable(key: string): Promise<OSVariable | null> {
    const variable = this.variables.get(`${this.ownerId}:${key}`);
    return variable || null;
  }

  async setVariable(variable: OSVariable): Promise<void> {
    const fullVar = { ...variable, ownerId: this.ownerId };
    this.variables.set(`${this.ownerId}:${variable.key}`, fullVar);
  }

  async listVariables(scope?: string): Promise<OSVariable[]> {
    const all = Array.from(this.variables.values()).filter(v => v.ownerId === this.ownerId);
    if (scope) return all.filter(v => v.scope === scope);
    return all;
  }
}
