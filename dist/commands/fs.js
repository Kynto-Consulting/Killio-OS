import chalk from 'chalk';
function parsePerms(p) {
    const s = p.length === 3 ? p : (p.length === 4 ? p.substring(1) : '644');
    const map = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
    return (map[parseInt(s[0])] || '---') + (map[parseInt(s[1])] || '---') + (map[parseInt(s[2])] || '---');
}
function formatLong(n, nameOverride) {
    const type = n.type === 'directory' ? 'd' : (n.type === 'link' ? 'l' : '-');
    const perms = n.metadata?.permissions || (n.type === 'directory' ? '755' : '644');
    const mode = type + parsePerms(perms);
    const owner = n.metadata?.owner || 'root';
    const group = n.metadata?.group || 'root';
    const size = (n.metadata?.size || 0).toString().padStart(5);
    const dateObj = n.metadata?.created ? new Date(n.metadata.created) : new Date();
    const month = dateObj.toLocaleString('en-US', { month: 'short' });
    const day = dateObj.getDate().toString().padStart(2);
    const time = dateObj.getHours().toString().padStart(2, '0') + ':' + dateObj.getMinutes().toString().padStart(2, '0');
    const name = nameOverride || n.path.split('/').pop() || (n.path === '/' ? '/' : n.path);
    const displayName = n.type === 'directory' ? chalk.blue.bold(name) : name;
    return `${mode} 1 ${owner.padEnd(8)} ${group.padEnd(8)} ${size} ${month} ${day} ${time} ${displayName}`;
}
export const ls = async (args, kernel) => {
    const flags = {
        a: args.some(a => a.startsWith('-') && a.includes('a')),
        l: args.some(a => a.startsWith('-') && a.includes('l')),
        R: args.some(a => a.startsWith('-') && a.includes('R')),
        h: args.some(a => a.startsWith('-') && a.includes('h')),
    };
    const targets = args.filter(a => !a.startsWith('-'));
    if (targets.length === 0)
        targets.push('.');
    let finalOutput = '';
    const listRecursive = async (path, depth = 0) => {
        let out = '';
        try {
            const fullPath = kernel.resolvePath(path);
            let nodes = await kernel.listNodes(fullPath);
            if (flags.a) {
                const node = await kernel.getVFS().getNode(fullPath) || { path: fullPath, type: 'directory' };
                const parentPath = fullPath.split('/').slice(0, -1).join('/') || '/';
                const parentNode = await kernel.getVFS().getNode(parentPath) || { path: parentPath, type: 'directory' };
                nodes = [{ ...node, path: `${fullPath}/.` }, { ...parentNode, path: `${fullPath}/..` }, ...nodes];
            }
            else {
                nodes = nodes.filter(n => !n.path.split('/').pop()?.startsWith('.'));
            }
            if (flags.l) {
                const total = nodes.reduce((acc, n) => acc + (n.metadata?.size || 0), 0);
                out += `total ${Math.ceil(total / 1024)}\n`;
                out += nodes.map(n => formatLong(n)).join('\n') + '\n';
            }
            else {
                const names = nodes.map(n => {
                    const name = n.path.split('/').pop() || n.path;
                    return n.type === 'directory' ? chalk.blue.bold(name) : name;
                });
                out += names.join('  ') + '\n';
            }
            if (flags.R) {
                const dirs = nodes.filter(n => n.type === 'directory' && !n.path.endsWith('/.') && !n.path.endsWith('/..'));
                for (const d of dirs) {
                    out += `\n${d.path}:\n`;
                    out += await listRecursive(d.path, depth + 1);
                }
            }
        }
        catch (e) {
            out += `ls: ${e.message}\n`;
        }
        return out;
    };
    for (const target of targets) {
        if (targets.length > 1 || flags.R)
            finalOutput += `${target}:\n`;
        finalOutput += await listRecursive(target);
        if (targets.length > 1)
            finalOutput += '\n';
    }
    const hasErrors = finalOutput.includes('no such file') || finalOutput.includes('permission denied');
    return { output: finalOutput.trim(), exitCode: hasErrors ? 1 : 0 };
};
export const mkdir = async (args, kernel) => {
    const pFlag = args.includes('-p');
    const targets = args.filter(a => !a.startsWith('-'));
    if (targets.length === 0)
        return { output: 'mkdir: missing operand', exitCode: 1 };
    try {
        for (const target of targets) {
            await kernel.mkdir(target, pFlag);
        }
        return { output: '', exitCode: 0 };
    }
    catch (e) {
        return { output: `mkdir: ${e.message}`, exitCode: 1 };
    }
};
export const touch = async (args, kernel) => {
    const targets = args.filter(a => !a.startsWith('-'));
    if (targets.length === 0)
        return { output: 'touch: missing file operand', exitCode: 1 };
    try {
        for (const target of targets) {
            try {
                const content = await kernel.readFile(target);
                // If file exists, update its modified time (not implemented in metadata yet but good practice)
                await kernel.writeFile(target, content);
            }
            catch (e) {
                // If file doesn't exist, create it
                await kernel.writeFile(target, '');
            }
        }
        return { output: '', exitCode: 0 };
    }
    catch (e) {
        return { output: `touch: ${e.message}`, exitCode: 1 };
    }
};
export const write_file = async (args, kernel) => {
    const isBase64 = args.includes('--base64');
    const targets = args.filter(a => a !== '--base64');
    if (targets.length < 2)
        return { output: 'write_file: missing arguments', exitCode: 1 };
    const [path, ...contentParts] = targets;
    const content = contentParts.join(' ');
    try {
        await kernel.writeFile(path, content, { isBinary: isBase64 });
        return { output: '', exitCode: 0 };
    }
    catch (e) {
        return { output: `write_file: ${e.message}`, exitCode: 1 };
    }
};
export const cat = async (args, kernel) => {
    const showLineNumbers = args.includes('-n');
    const files = args.filter(a => a !== '-n');
    if (files.length === 0)
        return { output: 'cat: missing operand', exitCode: 1 };
    let output = '';
    try {
        for (const file of files) {
            let content = await kernel.readFile(file);
            if (showLineNumbers) {
                content = content.split('\n').map((line, i) => `${(i + 1).toString().padStart(6)}  ${line}`).join('\n');
            }
            output += content + (files.length > 1 ? '\n' : '');
        }
        return { output, exitCode: 0 };
    }
    catch (e) {
        return { output: `cat: ${e.message}`, exitCode: 1 };
    }
};
export const nano = async (args, kernel) => {
    if (!args[0])
        return { output: 'nano: filename required', exitCode: 1 };
    const path = kernel.resolvePath(args[0]);
    const fileName = args[0].split('/').pop();
    if (args[1]) {
        await kernel.writeFile(path, args[1]);
        return { output: `[ Saved ${args[0]} ]`, exitCode: 0 };
    }
    // Headless check for non-interactive environments (like tests or AI tools)
    const isInteractive = true; // For CLI
    return {
        output: '', // CLI will handle initial render
        exitCode: 0,
        metadata: {
            interactive: true,
            editor: 'nano',
            file: path
        }
    };
};
export const rm = async (args, kernel) => {
    const flags = args.filter(a => a.startsWith('-'));
    const targets = args.filter(a => !a.startsWith('-'));
    const recursive = flags.some(f => f.includes('r'));
    if (targets.length === 0)
        return { output: 'rm: missing operand', exitCode: 1 };
    try {
        for (const target of targets) {
            await kernel.unlink(target, recursive);
        }
        return { output: '', exitCode: 0 };
    }
    catch (e) {
        return { output: `rm: ${e.message}`, exitCode: 1 };
    }
};
export const cp = async (args, kernel) => {
    if (args.length < 2)
        return { output: 'cp: missing destination file operand', exitCode: 1 };
    try {
        const content = await kernel.readFile(args[0]);
        await kernel.writeFile(args[1], content);
        return { output: '', exitCode: 0 };
    }
    catch (e) {
        return { output: `cp: ${e.message}`, exitCode: 1 };
    }
};
export const mv = async (args, kernel) => {
    if (args.length < 2)
        return { output: 'mv: missing destination file operand', exitCode: 1 };
    try {
        const content = await kernel.readFile(args[0]);
        await kernel.writeFile(args[1], content);
        await kernel.unlink(args[0]);
        return { output: '', exitCode: 0 };
    }
    catch (e) {
        return { output: `mv: ${e.message}`, exitCode: 1 };
    }
};
export const stat = async (args, kernel) => {
    if (!args[0])
        return { output: 'stat: missing operand', exitCode: 1 };
    try {
        const fullPath = kernel.resolvePath(args[0]);
        const node = await kernel.getVFS().getNode(fullPath);
        if (!node)
            return { output: `stat: cannot stat '${args[0]}': No such file or directory`, exitCode: 1 };
        const output = [
            `  File: ${args[0]}`,
            `  Size: ${node.metadata?.size || 0} \tBlocks: 8 \tIO Block: 4096 \t${node.type}`,
            `Device: 1h/1d\tInode: ${node.id.substring(0, 8)}\tLinks: 1`,
            `Access: (${node.metadata?.permissions || '0644'}/${parsePerms(node.metadata?.permissions || '644')})  Uid: ( 0/    root)   Gid: ( 0/    root)`,
            `Access: ${node.metadata?.created || 'Unknown'}`,
            `Modify: ${node.metadata?.modified || node.metadata?.created || 'Unknown'}`,
            `Change: ${node.updatedAt || 'Unknown'}`,
            ` Birth: ${node.metadata?.created || 'Unknown'}`
        ].join('\n');
        return { output, exitCode: 0 };
    }
    catch (e) {
        return { output: `stat: ${e.message}`, exitCode: 1 };
    }
};
export const sed = async (args, kernel) => {
    if (args.length < 2)
        return { output: 'sed: usage: sed "s/old/new/g" <file>', exitCode: 1 };
    const expr = args[0];
    const file = args[1];
    try {
        const content = await kernel.readFile(file);
        const match = expr.match(/^s\/(.*)\/(.*)\/(g?)$/);
        if (!match)
            return { output: `sed: invalid expression: ${expr}`, exitCode: 1 };
        const [_, search, replace, flags] = match;
        const regex = new RegExp(search, flags === 'g' ? 'g' : '');
        const newContent = content.replace(regex, replace);
        if (args.includes('-i')) {
            await kernel.writeFile(file, newContent);
            return { output: '', exitCode: 0 };
        }
        return { output: newContent, exitCode: 0 };
    }
    catch (e) {
        return { output: `sed: ${e.message}`, exitCode: 1 };
    }
};
export const patch = async (args, kernel) => {
    if (args.length < 3)
        return { output: 'patch: usage: patch <file> <search> <replace>', exitCode: 1 };
    const [file, search, replace] = args;
    try {
        const content = await kernel.readFile(file);
        if (!content.includes(search))
            return { output: `patch: search string not found in ${file}`, exitCode: 1 };
        const newContent = content.replace(search, replace);
        await kernel.writeFile(file, newContent);
        return { output: `patching file ${file}`, exitCode: 0 };
    }
    catch (e) {
        return { output: `patch: ${e.message}`, exitCode: 1 };
    }
};
export const head = async (args, kernel) => {
    if (!args[0])
        return { output: 'head: missing operand', exitCode: 1 };
    let n = 10;
    let filePath = args[0];
    if (args[0] === '-n' && args[1]) {
        n = parseInt(args[1]);
        filePath = args[2] || '';
    }
    const path = kernel.resolvePath(filePath);
    const node = await kernel.getVFS().getNode(path);
    if (!node || node.type !== 'file')
        return { output: `head: ${filePath}: No such file`, exitCode: 1 };
    if (!kernel.checkPermission(node, 'r'))
        return { output: `head: ${filePath}: Permission denied`, exitCode: 1 };
    const lines = (node.content || '').split('\n');
    return { output: lines.slice(0, n).join('\n'), exitCode: 0 };
};
export const tail = async (args, kernel) => {
    if (!args[0])
        return { output: 'tail: missing operand', exitCode: 1 };
    let n = 10;
    let filePath = args[0];
    if (args[0] === '-n' && args[1]) {
        n = parseInt(args[1]);
        filePath = args[2] || '';
    }
    const path = kernel.resolvePath(filePath);
    const node = await kernel.getVFS().getNode(path);
    if (!node || node.type !== 'file')
        return { output: `tail: ${filePath}: No such file`, exitCode: 1 };
    if (!kernel.checkPermission(node, 'r'))
        return { output: `tail: ${filePath}: Permission denied`, exitCode: 1 };
    const lines = (node.content || '').split('\n');
    return { output: lines.slice(-n).join('\n'), exitCode: 0 };
};
//# sourceMappingURL=fs.js.map