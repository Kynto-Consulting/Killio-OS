// Advanced Cryptography Tool for Killio-OS
import CryptoJS from 'crypto-js';

export default async function run(args, kernel) {
  const [op, text, key] = args;

  if (!op || !text) {
    return { 
      output: 'Usage: crypt [hash|encrypt|decrypt] [text] [key?]', 
      exitCode: 1 
    };
  }

  try {
    const vfs = kernel.getVFS();

    switch (op) {
      case 'hash':
        const hash = CryptoJS.SHA256(text).toString();
        return { output: `SHA256: ${hash}`, exitCode: 0 };
      
      case 'encrypt':
        if (!key) return { output: 'Encryption requires a key', exitCode: 1 };
        const encrypted = CryptoJS.AES.encrypt(text, key).toString();
        return { output: `Encrypted: ${encrypted}`, exitCode: 0 };

      case 'decrypt':
        if (!key) return { output: 'Decryption requires a key', exitCode: 1 };
        const bytes = CryptoJS.AES.decrypt(text, key);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (!decrypted) throw new Error('Invalid key or corrupted data');
        return { output: `Decrypted: ${decrypted}`, exitCode: 0 };

      case 'file-encrypt': {
        const filePath = kernel.resolvePath(text);
        const node = await vfs.getNode(filePath);
        if (!node || node.type !== 'file') return { output: `File not found: ${text}`, exitCode: 1 };
        if (!key) return { output: 'Encryption requires a key', exitCode: 1 };
        
        const encryptedFile = CryptoJS.AES.encrypt(node.content || '', key).toString();
        await vfs.createNode({
          path: `${filePath}.enc`,
          type: 'file',
          ownerId: 'agent',
          parentPath: filePath.substring(0, filePath.lastIndexOf('/')),
          content: encryptedFile,
          metadata: { created: new Date().toISOString() }
        });
        return { output: `File encrypted to ${text}.enc`, exitCode: 0 };
      }

      default:
        return { output: `Unknown operation: ${op}`, exitCode: 1 };
    }
  } catch (e) {
    return { output: `Crypt Error: ${e.message}`, exitCode: 1 };
  }
}
