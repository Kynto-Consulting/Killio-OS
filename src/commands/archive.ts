import type { CommandHandler } from '../kernel.js';
import AdmZip from 'adm-zip';

export const zip: CommandHandler = async (args, kernel) => {
  if (args.length < 2) return { output: 'zip: usage: zip <archive.zip> <file1> <file2> ...', exitCode: 1 };
  
  const targetArchive = args[0]!;
  const files = args.slice(1);
  const zipArchive = new AdmZip();
  let added = 0;

  try {
    for (const file of files) {
      const content = await kernel.readFile(file);
      const node = await kernel.getVFS().getNode(kernel.resolvePath(file));
      zipArchive.addFile(file, Buffer.from(content, node?.metadata?.isBinary ? 'base64' : 'utf8'));
      added++;
    }

    if (added === 0) return { output: 'zip error: Nothing to do!', exitCode: 1 };

    const buffer = zipArchive.toBuffer();
    await kernel.writeFile(targetArchive, buffer.toString('base64'), { isBinary: true });
    return { output: `  adding: ${files.join(' ')} (stored 0%)`, exitCode: 0 };
  } catch (e: any) {
    return { output: `zip error: ${e.message}`, exitCode: 1 };
  }
};

export const unzip: CommandHandler = async (args, kernel) => {
  if (args.length < 1) return { output: 'unzip: usage: unzip <archive.zip>', exitCode: 1 };
  
  try {
    const content = await kernel.readFile(args[0]!);
    const buffer = Buffer.from(content, 'base64');
    const zipArchive = new AdmZip(buffer);
    const entries = zipArchive.getEntries();
    
    let output = `Archive:  ${args[0]}\n`;
    for (const entry of entries) {
      if (entry.isDirectory) {
        await kernel.mkdir(entry.entryName, true);
        continue;
      }
      
      const entryContent = entry.getData().toString('utf8');
      await kernel.writeFile(entry.entryName, entryContent);
      output += `  inflating: ${entry.entryName}\n`;
    }
    
    return { output: output.trim(), exitCode: 0 };
  } catch (e: any) {
    return { output: `unzip: error: ${e.message}`, exitCode: 1 };
  }
};
