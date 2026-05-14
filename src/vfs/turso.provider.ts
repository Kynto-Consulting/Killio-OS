import { createClient, type Client } from '@libsql/client';
import { type VFSProvider } from './provider.js';
import { type FSNode, type OSVariable } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class TursoProvider implements VFSProvider {
  private client: Client;

  constructor(url?: string, authToken?: string, private ownerId: string = 'default') {
    this.client = createClient({ url: url || process.env.TURSO_URL!, authToken: authToken || process.env.TURSO_AUTH_TOKEN! });
  }

  getOwnerId(): string {
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
    } catch (e) {}

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
    } catch (e) {}
  }

  async getNode(path: string): Promise<FSNode | null> {
    const res = await this.client.execute({
      sql: 'SELECT * FROM fs_nodes WHERE path = ? AND owner_id = ?',
      args: [path, this.ownerId]
    });
    if (res.rows.length === 0) return null;
    return this.mapRowToNode(res.rows[0]);
  }

  async listNodes(parentPath: string): Promise<FSNode[]> {
    const res = await this.client.execute({
      sql: 'SELECT * FROM fs_nodes WHERE parent_path = ? AND owner_id = ?',
      args: [parentPath, this.ownerId]
    });
    return res.rows.map(row => this.mapRowToNode(row));
  }

  async createNode(node: Partial<FSNode>): Promise<void> {
    const id = node.id || uuidv4();
    await this.client.execute({
      sql: `INSERT INTO fs_nodes (id, path, owner_id, type, content, metadata, parent_path) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        node.path!,
        this.ownerId,
        node.type!,
        node.content || null,
        JSON.stringify(node.metadata || {}),
        node.parentPath || null
      ]
    });
  }

  async updateNode(path: string, updates: Partial<FSNode>): Promise<void> {
    const fields: string[] = [];
    const args: any[] = [];
    if (updates.content !== undefined) { fields.push('content = ?'); args.push(updates.content); }
    if (updates.metadata !== undefined) { fields.push('metadata = ?'); args.push(JSON.stringify(updates.metadata)); }
    fields.push('updated_at = CURRENT_TIMESTAMP');

    args.push(path);
    args.push(this.ownerId);
    await this.client.execute({
      sql: `UPDATE fs_nodes SET ${fields.join(', ')} WHERE path = ? AND owner_id = ?`,
      args
    });
  }

  async deleteNode(path: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM fs_nodes WHERE path = ? AND owner_id = ?',
      args: [path, this.ownerId]
    });
  }

  async searchNodes(query: string): Promise<FSNode[]> {
    const res = await this.client.execute({
      sql: 'SELECT * FROM fs_nodes WHERE (path LIKE ? OR content LIKE ?) AND owner_id = ?',
      args: [`%${query}%`, `%${query}%`, this.ownerId]
    });
    return res.rows.map(row => this.mapRowToNode(row));
  }

  async readFile(path: string): Promise<string> {
    const node = await this.getNode(path);
    if (!node || node.type !== 'file') throw new Error(`File not found: ${path}`);
    return node.content || '';
  }

  async writeFile(path: string, content: string): Promise<void> {
    const node = await this.getNode(path);
    if (node) {
      await this.updateNode(path, { content });
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
    const res = await this.client.execute({
      sql: 'SELECT * FROM os_variables WHERE key = ? AND owner_id = ?',
      args: [key, this.ownerId]
    });
    if (res.rows.length === 0) return null;
    return this.mapRowToVar(res.rows[0]);
  }

  async setVariable(variable: OSVariable): Promise<void> {
    await this.client.execute({
      sql: 'INSERT OR REPLACE INTO os_variables (key, owner_id, value, scope) VALUES (?, ?, ?, ?)',
      args: [variable.key, this.ownerId, variable.value, variable.scope]
    });
  }

  async listVariables(scope?: string): Promise<OSVariable[]> {
    let sql = 'SELECT * FROM os_variables WHERE owner_id = ?';
    const args: any[] = [this.ownerId];
    if (scope) {
      sql += ' AND scope = ?';
      args.push(scope);
    }
    const res = await this.client.execute({ sql, args });
    return res.rows.map(row => this.mapRowToVar(row));
  }

  private mapRowToNode(row: any): FSNode {
    return {
      id: row.id as string,
      path: row.path as string,
      ownerId: row.owner_id as string,
      type: row.type as any,
      content: row.content as string,
      metadata: JSON.parse((row.metadata as string) || '{}'),
      parentPath: row.parent_path as string,
      updatedAt: row.updated_at as string
    };
  }

  private mapRowToVar(row: any): OSVariable {
    return {
      key: row.key as string,
      value: row.value as string,
      scope: row.scope as any,
      ownerId: row.owner_id as string
    };
  }
}
