export declare const createBufferMock: () => {
    Buffer: BufferConstructor | {
        new (): {};
        from(str: string, encoding?: string): Uint8Array<ArrayBuffer>;
    };
    constants: {
        MAX_LENGTH: number;
        MAX_STRING_LENGTH: number;
    };
};
//# sourceMappingURL=buffer.d.ts.map