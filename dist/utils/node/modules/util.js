export const createUtilMock = () => {
    return {
        promisify: (fn) => {
            return (...args) => {
                return new Promise((resolve, reject) => {
                    fn(...args, (err, result) => {
                        if (err)
                            reject(err);
                        else
                            resolve(result);
                    });
                });
            };
        },
        format: (fmt, ...args) => {
            let i = 0;
            return fmt.replace(/%[sdj%]/g, (match) => {
                if (match === '%%')
                    return '%';
                if (i >= args.length)
                    return match;
                const arg = args[i++];
                if (match === '%j') {
                    try {
                        return JSON.stringify(arg);
                    }
                    catch (_) {
                        return '[Circular]';
                    }
                }
                return String(arg);
            });
        },
        TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : class MockTextEncoder {
            encode(str) { return new Uint8Array([...str].map(c => c.charCodeAt(0))); }
        },
        TextDecoder: typeof TextDecoder !== 'undefined' ? TextDecoder : class MockTextDecoder {
            decode(arr) { return Array.from(arr).map(c => String.fromCharCode(c)).join(''); }
        }
    };
};
//# sourceMappingURL=util.js.map