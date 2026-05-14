import type { CommandHandler } from '../kernel.js';
import chalk from 'chalk';

export const posh: CommandHandler = async (args, kernel) => {
  const theme = args[0];
  const themeDir = '/etc/oh-my-posh/themes';
  
  if (!theme || theme === 'list') {
    const files = await kernel.listNodes(themeDir);
    const themeNames = files.map(f => f.path.split('/').pop()?.replace('.omp.json', ''));
    const allThemes = [...new Set(['default', 'minimal', 'linux', ...themeNames])];
    
    return {
      output: `Available Posh themes:\n${allThemes.join(', ')}\n\n` + 
              chalk.yellow(`[IMPORTANT] For these themes to display correctly, you MUST install "JetBrains Mono Nerd Font".\n`) +
              `Usage: posh <theme_name>`,
      exitCode: 0
    };
  }

  // Handle legacy/builtin names if not in VFS
  const legacyThemes: Record<string, string> = {
    default: '%green%{user}%white%@%green%{hostname}%white%:%blue%{cwd}%magenta%{%git_branch%: :}%white%{prompt_char} %reset%',
    minimal: '%gray%{cwd}%magenta%{%git_branch%: :}%green%\u276F %reset%',
    linux: '%green%\uF303 {user}%white%@%green%{hostname}%white%:%blue%{cwd}%magenta%{%git_branch%::}%white%{prompt_char} %reset%'
  };

  if (legacyThemes[theme]) {
    kernel.setEnv('USER_CLI_FORMAT', legacyThemes[theme]);
    return { output: `Theme applied: ${theme}`, exitCode: 0 };
  }

  const themePath = `${themeDir}/${theme}.omp.json`;
  if (await kernel.stat(themePath).catch(() => null)) {
    const content = await kernel.readFile(themePath);
    kernel.setEnv('USER_CLI_FORMAT', content);
    kernel.setEnv('POSH_THEME', themePath);
    return { output: `Theme applied: ${theme} (from VFS)`, exitCode: 0 };
  }

  return { output: `posh: theme not found: ${theme}`, exitCode: 1 };
};
