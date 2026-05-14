export declare const createCryptoMock: () => {
    randomUUID: () => string;
    createHash: (algorithm: string) => {
        update: (input: string) => /*elided*/ any;
        digest: (encoding?: string) => string;
    };
};
//# sourceMappingURL=crypto.d.ts.map