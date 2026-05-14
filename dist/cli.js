import readline from 'readline';
import { KillioKernel } from './kernel.js';
import { CacheProvider } from './vfs/cache.provider.js';
import { MountManager } from './vfs/mount_manager.js';
import chalk from 'chalk';
function renderOMP(configStr, kernel, gitBranch) {
    try {
        const config = JSON.parse(configStr);
        const user = kernel.getCurrentUser();
        const hostname = kernel.getHostname();
        const cwd = kernel.getCWD();
        const displayCwd = cwd === `/home/${user}` || (user === 'root' && cwd === '/root') ? '~' : cwd;
        // Support palette
        const palette = config.palette || {};
        const resolveColor = (color) => {
            if (!color)
                return 'transparent';
            if (color.startsWith('p:')) {
                const key = color.substring(2);
                return palette[key] || '#ffffff';
            }
            return color;
        };
        // Inline color tag parser: <#hex>text</>
        const parseInlineColors = (text) => {
            let output = '';
            let currentIdx = 0;
            const tagRegex = /<([#0-9A-Fa-f]{7}|[a-z]+)>(.*?)<\/>/g;
            let match;
            while ((match = tagRegex.exec(text)) !== null) {
                output += text.substring(currentIdx, match.index);
                const color = match[1];
                const content = match[2];
                output += chalk.hex(color.startsWith('#') ? color : '#ffffff')(content);
                currentIdx = tagRegex.lastIndex;
            }
            output += text.substring(currentIdx);
            return output;
        };
        let result = '';
        const blocks = config.blocks || [];
        for (const block of blocks) {
            if (block.type !== 'prompt')
                continue;
            if (block.newline)
                result += '\n';
            // Leading Diamond for block
            if (block.leading_diamond) {
                result += parseInlineColors(block.leading_diamond);
            }
            const segments = block.segments || [];
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const nextSeg = segments[i + 1];
                // Skip git segment if no branch
                if (seg.type === 'git' && !gitBranch)
                    continue;
                let template = seg.template || '';
                template = template.replace(/{{ \.UserName }}/g, user);
                template = template.replace(/{{ \.HostName }}/g, hostname);
                template = template.replace(/{{ \.Path }}/g, displayCwd);
                template = template.replace(/{{ \.HEAD }}/g, gitBranch.trim());
                template = template.replace(/{{ \.Icon }}/g, '\uF303');
                template = template.replace(/{{ \.UserName }}@{{ \.HostName }}/g, `${user}@${hostname}`);
                template = template.replace(/{{ \.UpstreamIcon }}/g, '\uF09B'); // GitHub icon fallback
                const fg = resolveColor(seg.foreground || '#ffffff');
                const bg = resolveColor(seg.background || 'transparent');
                // Leading Diamond for segment
                if (seg.leading_diamond) {
                    result += chalk.hex(bg)(seg.leading_diamond);
                }
                let segmentText = parseInlineColors(template);
                let styled = chalk.hex(fg);
                if (bg !== 'transparent') {
                    styled = styled.bgHex(bg);
                }
                result += styled(segmentText);
                // Trailing Diamond for segment
                if (seg.trailing_diamond) {
                    result += chalk.hex(bg)(seg.trailing_diamond);
                }
                // Handle Powerline Symbol
                if (seg.style === 'powerline' || seg.powerline_symbol) {
                    const symbol = seg.powerline_symbol || '\uE0B0';
                    const nextBg = (nextSeg && (nextSeg.type !== 'git' || gitBranch)) ? resolveColor(nextSeg.background || 'transparent') : 'transparent';
                    let symStyled = chalk.hex(bg === 'transparent' ? '#000000' : bg);
                    if (nextBg !== 'transparent') {
                        symStyled = symStyled.bgHex(nextBg);
                    }
                    result += symStyled(symbol);
                }
            }
            // Trailing Diamond for block
            if (block.trailing_diamond) {
                result += parseInlineColors(block.trailing_diamond);
            }
        }
        if (config.final_space)
            result += ' ';
        return result;
    }
    catch (e) {
        console.error('[OMP-PARSE-ERROR]', e);
        return chalk.red('OMP Error');
    }
}
function getPrompt(kernel, gitBranch = '') {
    const cwd = kernel.getCWD();
    const user = kernel.getCurrentUser();
    const hostname = kernel.getHostname();
    const displayCwd = cwd === `/home/${user}` || (user === 'root' && cwd === '/root') ? '~' : cwd;
    const promptChar = user === 'root' ? '#' : '$';
    const time = new Date().toLocaleTimeString();
    let format = kernel.getEnv('USER_CLI_FORMAT') || '%green%{user}@%white%{hostname}%white%:%blue%{cwd}%magenta%{%git_branch%: :}%white%{prompt_char} %reset%';
    // Check if format is JSON (OMP Theme)
    if (format.trim().startsWith('{')) {
        return renderOMP(format, kernel, gitBranch);
    }
    // Replace placeholders
    format = format.replace('{user}', user);
    format = format.replace('{hostname}', hostname);
    format = format.replace('{cwd}', displayCwd);
    format = format.replace('{prompt_char}', promptChar);
    format = format.replace('{time}', time);
    // Conditional tokens: {%token%:prefix:suffix}
    // If token is non-empty, replace with prefix + token + suffix
    const conditionals = format.match(/{%[a-z_]+%:[^:]*:[^}]*}/g) || [];
    for (const cond of conditionals) {
        const parts = cond.substring(2, cond.length - 1).split(':');
        const tokenName = parts[0].substring(1, parts[0].length - 1); // remove % %
        const prefix = parts[1] || '';
        const suffix = parts[2] || '';
        let tokenValue = '';
        if (tokenName === 'git_branch')
            tokenValue = gitBranch;
        // Add others if needed
        const replacement = tokenValue ? (prefix + tokenValue + suffix) : '';
        format = format.replace(cond, replacement);
    }
    // Final replacement for simple {git_branch} if any left
    format = format.replace('{git_branch}', gitBranch);
    // Parse colors %color%
    const colorMap = {
        green: chalk.green,
        blue: chalk.blue,
        red: chalk.red,
        yellow: chalk.yellow,
        magenta: chalk.magenta,
        cyan: chalk.cyan,
        white: chalk.white,
        gray: chalk.gray,
        reset: chalk.reset,
        bold: chalk.bold,
        bg_green: chalk.bgGreen.black,
        bg_blue: chalk.bgBlue.white,
        bg_red: chalk.bgRed.white,
        bg_yellow: chalk.bgYellow.black,
        bg_magenta: chalk.bgMagenta.white,
        bg_cyan: chalk.bgCyan.black,
        bg_white: chalk.bgWhite.black,
        bg_gray: chalk.bgGray.white
    };
    let finalPrompt = '';
    const tokens = format.split(/(%bg#[0-9A-Fa-f]{6}%|%#[0-9A-Fa-f]{6}%|%[a-z_]+%)/);
    let currentColor = null;
    for (const token of tokens) {
        if (token.startsWith('%') && token.endsWith('%')) {
            const colorKey = token.substring(1, token.length - 1);
            if (colorKey.startsWith('bg#')) {
                const hex = colorKey.substring(2);
                currentColor = chalk.bgHex(hex);
            }
            else if (colorKey.startsWith('#')) {
                const hex = colorKey.substring(0);
                currentColor = chalk.hex(hex);
            }
            else if (colorMap[colorKey]) {
                currentColor = colorMap[colorKey];
            }
        }
        else {
            finalPrompt += currentColor ? currentColor(token) : token;
        }
    }
    return finalPrompt;
}
async function fetchGitBranch(kernel) {
    try {
        const headPath = kernel.resolvePath('.git/HEAD');
        const headContent = await kernel.readFile(headPath);
        if (headContent.startsWith('ref: ')) {
            return ' \uE0A0 ' + headContent.replace('ref: refs/heads/', '').trim();
        }
        else if (headContent.length > 0) {
            return ' \uE0A0 ' + headContent.substring(0, 7);
        }
    }
    catch (e) {
        // Not a git repo
    }
    return '';
}
function renderNano(path, buffer, modified, cursorLine, cursorChar, statusMsg) {
    const fileName = path.split('/').pop();
    const modChar = modified ? '*' : '';
    const header = chalk.bgWhite.black(`  GNU nano 7.2              ${fileName}${modChar}                                `);
    const footerRow1 = chalk.bgWhite.black('^G') + ' Get Help  ' + chalk.bgWhite.black('^O') + ' Write Out ' + chalk.bgWhite.black('^W') + ' Where Is  ' + chalk.bgWhite.black('^K') + ' Cut Text  ' + chalk.bgWhite.black('^J') + ' Justify   ' + chalk.bgWhite.black('^C') + ' Cur Pos';
    const footerRow2 = chalk.bgWhite.black('^X') + ' Exit      ' + chalk.bgWhite.black('^R') + ' Read File ' + chalk.bgWhite.black('^\\') + ' Replace   ' + chalk.bgWhite.black('^U') + ' Uncut Text' + chalk.bgWhite.black('^T') + ' To Spell  ' + chalk.bgWhite.black('^_') + ' Go To Line';
    process.stdout.write('\x1b[H\x1b[J'); // Clear and home
    console.log(header);
    console.log('');
    const maxLines = 18;
    for (let i = 0; i < maxLines; i++) {
        const line = buffer[i] || '';
        const isCurrent = i === cursorLine;
        const prefix = isCurrent ? chalk.yellow('>') : ' ';
        const lineNum = chalk.gray((i + 1).toString().padStart(3));
        let lineContent = line;
        if (isCurrent) {
            // Highlight char at cursorChar
            const before = line.slice(0, cursorChar);
            const char = line[cursorChar] || ' ';
            const after = line.slice(cursorChar + 1);
            lineContent = before + chalk.bgWhite.black(char) + after;
        }
        if (i < buffer.length || i === 0) {
            console.log(`${prefix}${lineNum} ${lineContent}`);
        }
        else {
            console.log(`${prefix}${chalk.gray('~').padStart(3)}`);
        }
    }
    console.log('\n' + footerRow1 + '\n' + footerRow2);
    const status = statusMsg || `[ Line ${cursorLine + 1}/${buffer.length || 1}, Col ${cursorChar + 1}/${(buffer[cursorLine]?.length || 0) + 1} ]`;
    process.stdout.write(`\n${status}\n`);
}
async function startCLI() {
    const rootProvider = new CacheProvider('dev-user');
    await rootProvider.init();
    const provider = new MountManager(rootProvider);
    // Always reserve /tmp for in-memory ephemeral storage
    const tmpProvider = new CacheProvider('tmp-system');
    await tmpProvider.init();
    provider.mount('/tmp', tmpProvider);
    const kernel = new KillioKernel(provider);
    await kernel.boot();
    let currentGitBranch = await fetchGitBranch(kernel);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: getPrompt(kernel, currentGitBranch),
        completer: (line, callback) => {
            const parts = line.split(/\s+/);
            const lastPart = parts[parts.length - 1] || '';
            if (parts.length <= 1) {
                const commands = Array.from(kernel.commands.keys());
                const hits = commands.filter(c => c.startsWith(line));
                callback(null, [hits.length ? hits : commands, line]);
            }
            else {
                const searchPath = lastPart.includes('/')
                    ? lastPart.substring(0, lastPart.lastIndexOf('/')) || '/'
                    : '.';
                const searchPrefix = lastPart.includes('/')
                    ? lastPart.substring(lastPart.lastIndexOf('/') + 1)
                    : lastPart;
                kernel.listNodes(searchPath).then(nodes => {
                    const names = nodes.map(n => n.path.split('/').pop());
                    const hits = names.filter(n => n.startsWith(searchPrefix));
                    callback(null, [hits.length ? hits : names, searchPrefix]);
                }).catch(() => {
                    callback(null, [[], lastPart]);
                });
            }
        }
    });
    console.clear();
    console.log(chalk.bold.cyan('Killio-OS Interactive Shell v1.2.0'));
    console.log('Type "help" for a list of commands, or "exit" to quit.\n');
    rl.prompt();
    let isNanoMode = false;
    let cutBuffer = '';
    readline.emitKeypressEvents(process.stdin);
    rl.on('line', async (line) => {
        if (isNanoMode)
            return;
        const input = line.trim();
        if (input === 'exit' || input === 'quit') {
            rl.close();
            return;
        }
        if (input) {
            try {
                const result = await kernel.execute(input);
                if (result.output)
                    console.log(result.output);
                const meta = result.metadata;
                if (meta && meta.interactive && meta.editor === 'nano') {
                    const filePath = meta.file;
                    let buffer = (await kernel.readFile(filePath)).split('\n');
                    let modified = false;
                    let cursorLine = 0;
                    let cursorChar = 0;
                    let statusMsg = '';
                    isNanoMode = true;
                    if (process.stdin.isTTY)
                        process.stdin.setRawMode(true);
                    renderNano(filePath, buffer, modified, cursorLine, cursorChar);
                    const handleKey = async (str, key) => {
                        if (!isNanoMode)
                            return;
                        statusMsg = '';
                        // CTRL shortcuts
                        if (key.ctrl) {
                            switch (key.name) {
                                case 'x': // Exit
                                    isNanoMode = false;
                                    if (process.stdin.isTTY)
                                        process.stdin.setRawMode(false);
                                    process.stdin.removeListener('keypress', handleKey);
                                    currentGitBranch = await fetchGitBranch(kernel);
                                    rl.setPrompt(getPrompt(kernel, currentGitBranch));
                                    rl.prompt();
                                    return;
                                case 'o': // Save
                                    await kernel.writeFile(filePath, buffer.join('\n'));
                                    modified = false;
                                    statusMsg = chalk.green(`[ Wrote ${buffer.length} lines ]`);
                                    break;
                                case 'c': // Cur Pos
                                    statusMsg = `line ${cursorLine + 1}/${buffer.length} (100%), col ${cursorChar + 1}/${(buffer[cursorLine]?.length || 0) + 1} (100%), char ${buffer.slice(0, cursorLine).join('\n').length + cursorChar + 1}/${buffer.join('\n').length}`;
                                    break;
                                case 'k': // Cut Text
                                    cutBuffer = buffer[cursorLine] || '';
                                    buffer.splice(cursorLine, 1);
                                    if (buffer.length === 0)
                                        buffer.push('');
                                    cursorChar = 0;
                                    modified = true;
                                    statusMsg = `[ Cut 1 line ]`;
                                    break;
                                case 'u': // Uncut Text
                                    if (cutBuffer) {
                                        buffer.splice(cursorLine, 0, cutBuffer);
                                        modified = true;
                                        statusMsg = `[ Uncut 1 line ]`;
                                    }
                                    break;
                                case 'a': // Home
                                    cursorChar = 0;
                                    break;
                                case 'e': // End
                                    cursorChar = (buffer[cursorLine]?.length || 0);
                                    break;
                            }
                        }
                        else {
                            if (key.name === 'up') {
                                cursorLine = Math.max(0, cursorLine - 1);
                                cursorChar = Math.min(cursorChar, (buffer[cursorLine]?.length || 0));
                            }
                            else if (key.name === 'down') {
                                cursorLine = Math.min(buffer.length - 1, cursorLine + 1);
                                cursorChar = Math.min(cursorChar, (buffer[cursorLine]?.length || 0));
                            }
                            else if (key.name === 'left') {
                                if (cursorChar > 0)
                                    cursorChar--;
                                else if (cursorLine > 0) {
                                    cursorLine--;
                                    cursorChar = (buffer[cursorLine]?.length || 0);
                                }
                            }
                            else if (key.name === 'right') {
                                if (cursorChar < (buffer[cursorLine]?.length || 0))
                                    cursorChar++;
                                else if (cursorLine < buffer.length - 1) {
                                    cursorLine++;
                                    cursorChar = 0;
                                }
                            }
                            else if (key.name === 'return') {
                                const line = buffer[cursorLine] || '';
                                const before = line.slice(0, cursorChar);
                                const after = line.slice(cursorChar);
                                buffer[cursorLine] = before;
                                buffer.splice(cursorLine + 1, 0, after);
                                cursorLine++;
                                cursorChar = 0;
                                modified = true;
                            }
                            else if (key.name === 'backspace') {
                                const line = buffer[cursorLine] || '';
                                if (cursorChar > 0) {
                                    buffer[cursorLine] = line.slice(0, cursorChar - 1) + line.slice(cursorChar);
                                    cursorChar--;
                                    modified = true;
                                }
                                else if (cursorLine > 0) {
                                    const prevLine = buffer[cursorLine - 1] || '';
                                    cursorChar = prevLine.length;
                                    buffer[cursorLine - 1] = prevLine + line;
                                    buffer.splice(cursorLine, 1);
                                    cursorLine--;
                                    modified = true;
                                }
                            }
                            else if (key.name === 'delete') {
                                const line = buffer[cursorLine] || '';
                                if (cursorChar < line.length) {
                                    buffer[cursorLine] = line.slice(0, cursorChar) + line.slice(cursorChar + 1);
                                    modified = true;
                                }
                                else if (cursorLine < buffer.length - 1) {
                                    buffer[cursorLine] = line + buffer[cursorLine + 1];
                                    buffer.splice(cursorLine + 1, 1);
                                    modified = true;
                                }
                            }
                            else if (str && !key.ctrl && !key.meta) {
                                const line = buffer[cursorLine] || '';
                                buffer[cursorLine] = line.slice(0, cursorChar) + str + line.slice(cursorChar);
                                cursorChar += str.length;
                                modified = true;
                            }
                        }
                        renderNano(filePath, buffer, modified, cursorLine, cursorChar, statusMsg);
                    };
                    process.stdin.on('keypress', handleKey);
                    return;
                }
            }
            catch (err) {
                console.error(chalk.red(`Error: ${err.message}`));
            }
        }
        currentGitBranch = await fetchGitBranch(kernel);
        rl.setPrompt(getPrompt(kernel, currentGitBranch));
        rl.prompt();
    }).on('close', () => {
        console.log('\nGoodbye!');
        process.exit(0);
    });
}
startCLI().catch(console.error);
//# sourceMappingURL=cli.js.map