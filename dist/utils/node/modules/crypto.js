export const createCryptoMock = () => {
    return {
        randomUUID: () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },
        createHash: (algorithm) => {
            // Mock hash implementation that just returns a predictable but fake hash object
            let data = '';
            return {
                update: function (input) {
                    data += input;
                    return this;
                },
                digest: function (encoding = 'hex') {
                    // Extremely fake hash for mock purposes
                    let hash = 0;
                    for (let i = 0; i < data.length; i++) {
                        hash = ((hash << 5) - hash) + data.charCodeAt(i);
                        hash |= 0;
                    }
                    const str = Math.abs(hash).toString(16).padStart(16, '0');
                    return encoding === 'hex' ? str : Buffer.from(str).toString(encoding);
                }
            };
        }
    };
};
//# sourceMappingURL=crypto.js.map