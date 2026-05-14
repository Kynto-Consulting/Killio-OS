import { createClient } from '@libsql/client';
import {} from './provider.js';
import {} from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
export class TursoProvider {
    ownerId;
    client;
    constructor(url, authToken, ownerId = 'default') {
        this.ownerId = ownerId;
        this.client = createClient({ url: url || process.env.TURSO_URL, authToken: authToken || process.env.TURSO_AUTH_TOKEN });
    }
    getOwnerId() {
        return this.ownerId;
    }
    async init() {
        await this.client.execute(`
      CREATE TABLE IF NOT EXISTS fs_nodes (
        id TEXT PRIMARY KEY,
        path TEXT,
        owner_id TEXT DEFAULT 'default',
        type TEXT CHECK(type IN ('file', 'directory', 'link', 'capability')),
        content TEXT,
        metadata TEXT, -- Stored as JSON string
        parent_path TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(path, owner_id)
      )
    `);
        try {
            // Attempt to add column for existing db
            await this.client.execute(`ALTER TABLE fs_nodes ADD COLUMN owner_id TEXT DEFAULT 'default'`);
        }
        catch (e) { }
        await this.client.execute(`
      CREATE TABLE IF NOT EXISTS os_variables (
        key TEXT,
        owner_id TEXT DEFAULT 'default',
        value TEXT,
        scope TEXT,
        PRIMARY KEY (key, owner_id)
      )
    `);
        try {
            // Attempt to add column for existing db
            await this.client.execute(`ALTER TABLE os_variables ADD COLUMN owner_id TEXT DEFAULT 'default'`);
        }
        catch (e) { }
    }
    async getNode(path) {
        const res = await this.client.execute({
            sql: 'SELECT * FROM fs_nodes WHERE path = ? AND owner_id = ?',
            args: [path, this.ownerId]
        });
        if (res.rows.length === 0)
            return null;
        return this.mapRowToNode(res.rows[0]);
    }
    async listNodes(parentPath) {
        const res = await this.client.execute({
            sql: 'SELECT * FROM fs_nodes WHERE parent_path = ? AND owner_id = ?',
            args: [parentPath, this.ownerId]
        });
        return res.rows.map(row => this.mapRowToNode(row));
    }
    async createNode(node) {
        const id = node.id || uuidv4();
        await this.client.execute({
            sql: `INSERT INTO fs_nodes (id, path, owner_id, type, content, metadata, parent_path) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                node.path,
                this.ownerId,
                node.type,
                node.content || null,
                JSON.stringify(node.metadata || {}),
                node.parentPath || null
            ]
        });
    }
    async updateNode(path, updates) {
        const fields = [];
        const args = [];
        if (updates.content !== undefined) {
            fields.push('content = ?');
            args.push(updates.content);
        }
        if (updates.metadata !== undefined) {
            fields.push('metadata = ?');
            args.push(JSON.stringify(updates.metadata));
        }
        fields.push('updated_at = CURRENT_TIMESTAMP');
        args.push(path);
        args.push(this.ownerId);
        await this.client.execute({
            sql: `UPDATE fs_nodes SET ${fields.join(', ')} WHERE path = ? AND owner_id = ?`,
            args
        });
    }
    async deleteNode(path) {
        await this.client.execute({
            sql: 'DELETE FROM fs_nodes WHERE path = ? AND owner_id = ?',
            args: [path, this.ownerId]
        });
    }
    async searchNodes(query) {
        const res = await this.client.execute({
            sql: 'SELECT * FROM fs_nodes WHERE (path LIKE ? OR content LIKE ?) AND owner_id = ?',
            args: [`%${query}%`, `%${query}%`, this.ownerId]
        });
        return res.rows.map(row => this.mapRowToNode(row));
    }
    async readFile(path) {
        const node = await this.getNode(path);
        if (!node || node.type !== 'file')
            throw new Error(`File not found: ${path}`);
        return node.content || '';
    }
    async writeFile(path, content) {
        const node = await this.getNode(path);
        if (node) {
            await this.updateNode(path, { content });
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
        const res = await this.client.execute({
            sql: 'SELECT * FROM os_variables WHERE key = ? AND owner_id = ?',
            args: [key, this.ownerId]
        });
        if (res.rows.length === 0)
            return null;
        return this.mapRowToVar(res.rows[0]);
    }
    async setVariable(variable) {
        await this.client.execute({
            sql: 'INSERT OR REPLACE INTO os_variables (key, owner_id, value, scope) VALUES (?, ?, ?, ?)',
            args: [variable.key, this.ownerId, variable.value, variable.scope]
        });
    }
    async listVariables(scope) {
        let sql = 'SELECT * FROM os_variables WHERE owner_id = ?';
        const args = [this.ownerId];
        if (scope) {
            sql += ' AND scope = ?';
            args.push(scope);
        }
        const res = await this.client.execute({ sql, args });
        return res.rows.map(row => this.mapRowToVar(row));
    }
    mapRowToNode(row) {
        return {
            id: row.id,
            path: row.path,
            ownerId: row.owner_id,
            type: row.type,
            content: row.content,
            metadata: JSON.parse(row.metadata || '{}'),
            parentPath: row.parent_path,
            updatedAt: row.updated_at
        };
    }
    mapRowToVar(row) {
        return {
            key: row.key,
            value: row.value,
            scope: row.scope,
            ownerId: row.owner_id
        };
    }
}
//# sourceMappingURL=turso.provider.js.map