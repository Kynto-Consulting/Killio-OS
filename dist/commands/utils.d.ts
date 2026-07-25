import type { CommandHandler } from '../kernel.js';
/** Collect input lines from file args, or from stdin when no file args. */
declare function gatherInputs(targets: string[], kernel: any, stdin?: string): Promise<{
    name: string;
    content: string;
}[]>;
export declare const grep: CommandHandler;
export declare const echo: CommandHandler;
export declare const history: CommandHandler;
export { gatherInputs };
//# sourceMappingURL=utils.d.ts.map