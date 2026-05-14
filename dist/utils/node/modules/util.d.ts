export declare const createUtilMock: () => {
    promisify: (fn: Function) => (...args: any[]) => Promise<unknown>;
    format: (fmt: string, ...args: any[]) => string;
    TextEncoder: {
        new (): {
            encode(str: string): Uint8Array<ArrayBuffer>;
        };
    };
    TextDecoder: {
        new (label?: string, options?: TextDecoderOptions): TextDecoder;
        prototype: TextDecoder;
    } | {
        new (): {
            decode(arr: Uint8Array): string;
        };
    };
};
//# sourceMappingURL=util.d.ts.map