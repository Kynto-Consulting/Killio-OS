export const createBufferMock = () => {
    // Buffer doesn't leak OS access, it's just a data structure.
    // We can safely expose the global Buffer if it exists, or a minimal mock.
    const GlobalBuffer = typeof Buffer !== 'undefined' ? Buffer : class MockBuffer {
        static from(str, encoding) { return new Uint8Array([...str].map(c => c.charCodeAt(0))); }
    };
    return {
        Buffer: GlobalBuffer,
        constants: { MAX_LENGTH: 4294967296, MAX_STRING_LENGTH: 536870888 }
    };
};
//# sourceMappingURL=buffer.js.map