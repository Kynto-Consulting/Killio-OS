/** Collect input lines from file args, or from stdin when no file args. */
async function gatherInputs(targets, kernel, stdin) {
    if (targets.length === 0) {
        return stdin !== undefined ? [{ name: '(standard input)', content: stdin }] : [];
    }
    const out = [];
    for (const t of targets) {
        if (t === '-') {
            out.push({ name: '(standard input)', content: stdin ?? '' });
            continue;
        }
        const full = kernel.resolvePath(t);
        const node = await kernel.getVFS().getNode(full);
        if (!node) {
            out.push({ name: t, content: '\0MISSING' });
            continue;
        }
        if (node.type === 'directory') {
            out.push({ name: t, content: '\0DIR' });
            continue;
        }
        out.push({ name: t, content: await kernel.readFile(full) });
    }
    return out;
}
export const grep = async (args, kernel, stdin) => {
    const flagSet = new Set();
    const positional = [];
    let patternFromE = null;
    let ctxA = 0, ctxB = 0;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-e') {
            patternFromE = args[++i] ?? '';
        }
        else if (a === '-A') {
            ctxA = parseInt(args[++i] || '0', 10);
        }
        else if (a === '-B') {
            ctxB = parseInt(args[++i] || '0', 10);
        }
        else if (a === '-C') {
            ctxA = ctxB = parseInt(args[++i] || '0', 10);
        }
        else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
            for (const ch of a.slice(1))
                flagSet.add(ch);
        }
        else
            positional.push(a);
    }
    const i_ = flagSet.has('i'), v_ = flagSet.has('v'), n_ = flagSet.has('n');
    const c_ = flagSet.has('c'), l_ = flagSet.has('l'), w_ = flagSet.has('w');
    const o_ = flagSet.has('o'), r_ = flagSet.has('r') || flagSet.has('R');
    const fixed = flagSet.has('F'), H_ = flagSet.has('H');
    let patternStr = patternFromE ?? positional.shift();
    if (patternStr === undefined)
        return { output: 'usage: grep [-invclwoEFH] PATTERN [FILE...]', exitCode: 2 };
    if (fixed)
        patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (w_)
        patternStr = `\\b(?:${patternStr})\\b`;
    let re;
    try {
        re = new RegExp(patternStr, i_ ? 'i' : '');
    }
    catch (e) {
        return { output: `grep: invalid pattern: ${e.message}`, exitCode: 2 };
    }
    // expand directories when -r
    const targets = positional;
    const inputs = [];
    if (r_ && targets.length) {
        const walk = async (p) => {
            const full = kernel.resolvePath(p);
            const node = await kernel.getVFS().getNode(full);
            if (!node)
                return;
            if (node.type === 'directory') {
                for (const child of await kernel.listNodes(full))
                    await walk(child.path);
            }
            else
                inputs.push({ name: full, content: await kernel.readFile(full) });
        };
        for (const t of targets)
            await walk(t);
    }
    else {
        inputs.push(...await gatherInputs(targets, kernel, stdin));
    }
    const multi = inputs.length > 1 || H_ || r_;
    const lines = [];
    let anyMatch = false, err = false;
    for (const inp of inputs) {
        if (inp.content === '\0MISSING') {
            lines.push(`grep: ${inp.name}: No such file or directory`);
            err = true;
            continue;
        }
        if (inp.content === '\0DIR') {
            if (!r_) {
                lines.push(`grep: ${inp.name}: Is a directory`);
                err = true;
            }
            continue;
        }
        const src = inp.content.split('\n');
        let count = 0;
        const fileHadMatch = { v: false };
        src.forEach((line, idx) => {
            const m = re.test(line);
            const keep = v_ ? !m : m;
            if (!keep)
                return;
            anyMatch = true;
            fileHadMatch.v = true;
            count++;
            if (l_ || c_)
                return;
            const prefix = (multi ? `${inp.name}:` : '') + (n_ ? `${idx + 1}:` : '');
            if (o_ && !v_) {
                const g = new RegExp(patternStr, (i_ ? 'i' : '') + 'g');
                for (const mm of line.matchAll(g))
                    lines.push(prefix + mm[0]);
            }
            else
                lines.push(prefix + line);
        });
        if (l_ && fileHadMatch.v)
            lines.push(inp.name);
        else if (c_)
            lines.push((multi ? `${inp.name}:` : '') + count);
    }
    return { output: lines.join('\n'), exitCode: err ? 2 : anyMatch ? 0 : 1 };
};
export const echo = async (args) => {
    let noNewline = false, interpret = false;
    const parts = [...args];
    while (parts.length && (parts[0] === '-n' || parts[0] === '-e' || parts[0] === '-E' || parts[0] === '-ne' || parts[0] === '-en')) {
        const f = parts.shift();
        if (f.includes('n'))
            noNewline = true;
        if (f.includes('e'))
            interpret = true;
        if (f === '-E')
            interpret = false;
    }
    let s = parts.join(' ');
    if (interpret) {
        s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
            .replace(/\\\\/g, '\\').replace(/\\0/g, '\0').replace(/\\a/g, '\x07').replace(/\\b/g, '\b');
    }
    return { output: noNewline ? s : s, exitCode: 0 };
};
export const history = async (_args, kernel) => {
    const h = kernel.getHistory ? kernel.getHistory() : [];
    return { output: h.map((cmd, i) => ` ${i + 1}  ${cmd}`).join('\n'), exitCode: 0 };
};
// Export the input helper for other command modules.
export { gatherInputs };
//# sourceMappingURL=utils.js.map