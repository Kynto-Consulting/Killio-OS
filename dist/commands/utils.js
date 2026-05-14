export const grep = async (args, kernel) => {
    const recursive = args.includes('-r');
    const ignoreCase = args.includes('-i');
    const showLineNumbers = args.includes('-n');
    const cleanArgs = args.filter(a => !a.startsWith('-'));
    if (cleanArgs.length < 1)
        return { output: 'grep: usage: grep [options] <pattern> [file...]', exitCode: 1 };
    const patternStr = cleanArgs[0];
    const targets = cleanArgs.slice(1);
    const pattern = new RegExp(patternStr, ignoreCase ? 'i' : '');
    const grepInFile = async (path) => {
        try {
            const content = await kernel.readFile(path);
            const lines = content.split('\n');
            const matches = lines
                .map((line, i) => ({ line, i: i + 1 }))
                .filter(item => pattern.test(item.line));
            return matches.map(m => {
                const prefix = targets.length > 1 ? `${path}:` : '';
                const lineNum = showLineNumbers ? `${m.i}:` : '';
                return `${prefix}${lineNum}${m.line}`;
            }).join('\n');
        }
        catch (e) {
            return '';
        }
    };
    if (targets.length === 0) {
        // If no targets, we'd normally read from stdin, but for now we search current dir
        targets.push('.');
    }
    let finalOutput = '';
    for (const target of targets) {
        const fullPath = kernel.resolvePath(target);
        const node = await kernel.getVFS().getNode(fullPath);
        if (!node)
            continue;
        if (node.type === 'file') {
            finalOutput += await grepInFile(fullPath) + '\n';
        }
        else if (node.type === 'directory') {
            const nodes = await kernel.listNodes(fullPath);
            for (const n of nodes) {
                if (n.type === 'file') {
                    finalOutput += await grepInFile(n.path) + '\n';
                }
            }
        }
    }
    return { output: finalOutput.trim(), exitCode: 0 };
};
export const echo = async (args) => {
    return { output: args.join(' '), exitCode: 0 };
};
export const history = async (_args, kernel) => {
    const history = kernel.getHistory ? kernel.getHistory() : [];
    return { output: history.map((cmd, i) => ` ${i + 1}  ${cmd}`).join('\n'), exitCode: 0 };
};
//# sourceMappingURL=utils.js.map