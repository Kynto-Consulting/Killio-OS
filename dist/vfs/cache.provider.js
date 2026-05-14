import {} from './provider.js';
import { v4 as uuidv4 } from 'uuid';
export class CacheProvider {
    ownerId;
    nodes = new Map();
    variables = new Map();
    constructor(ownerId = 'default') {
        this.ownerId = ownerId;
    }
    getOwnerId() {
        return this.ownerId;
    }
    async init() {
        // In-memory provider doesn't need much initialization
    }
    async getNode(path) {
        const node = this.nodes.get(`${this.ownerId}:${path}`);
        return node || null;
    }
    async listNodes(parentPath) {
        const all = Array.from(this.nodes.values());
        const filtered = all.filter(n => n.parentPath === parentPath && n.ownerId === this.ownerId);
        // console.log(`[CacheProvider] listNodes(${parentPath}): total=${all.length}, filtered=${filtered.length}`);
        return filtered;
    }
    async createNode(node) {
        if (!node.path)
            throw new Error('Path is required');
        const fullNode = node;
        fullNode.ownerId = this.ownerId;
        if (!fullNode.id)
            fullNode.id = uuidv4();
        this.nodes.set(`${this.ownerId}:${node.path}`, fullNode);
    }
    async updateNode(path, updates) {
        const key = `${this.ownerId}:${path}`;
        const existing = this.nodes.get(key);
        if (!existing)
            throw new Error('Node not found');
        this.nodes.set(key, { ...existing, ...updates, ownerId: this.ownerId });
    }
    async deleteNode(path) {
        const key = `${this.ownerId}:${path}`;
        this.nodes.delete(key);
        // Recursively delete children
        for (const [nodeKey, node] of this.nodes.entries()) {
            if (node.ownerId === this.ownerId && node.path.startsWith(path + '/')) {
                this.nodes.delete(nodeKey);
            }
        }
    }
    async searchNodes(query) {
        return Array.from(this.nodes.values()).filter(n => n.ownerId === this.ownerId && (n.path.includes(query) || (n.content && n.content.includes(query))));
    }
    async readFile(path) {
        const node = this.nodes.get(`${this.ownerId}:${path}`);
        if (!node || node.type !== 'file')
            throw new Error(`File not found: ${path}`);
        return node.content || '';
    }
    async writeFile(path, content) {
        const key = `${this.ownerId}:${path}`;
        const existing = this.nodes.get(key);
        if (existing) {
            existing.content = content;
            existing.metadata = { ...existing.metadata, modified: new Date().toISOString() };
        }
        else {
            await this.createNode({
                path,
                type: 'file',
                content,
                parentPath: path.substring(0, path.lastIndexOf('/')) || '/'
            });
        }
    }
    async getVariable(key) {
        const variable = this.variables.get(`${this.ownerId}:${key}`);
        return variable || null;
    }
    async setVariable(variable) {
        const fullVar = { ...variable, ownerId: this.ownerId };
        this.variables.set(`${this.ownerId}:${variable.key}`, fullVar);
    }
    async listVariables(scope) {
        const all = Array.from(this.variables.values()).filter(v => v.ownerId === this.ownerId);
        if (scope)
            return all.filter(v => v.scope === scope);
        return all;
    }
}
//# sourceMappingURL=cache.provider.js.map