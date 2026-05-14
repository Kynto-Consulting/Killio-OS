export const createHttpMock = () => {
    const request = (url, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        let responseEnded = false;
        const req = {
            on: (event, handler) => req,
            end: () => {
                if (responseEnded)
                    return;
                responseEnded = true;
                fetch(url, options).then(async (res) => {
                    const text = await res.text();
                    const resMock = {
                        statusCode: res.status,
                        headers: Object.fromEntries(res.headers.entries()),
                        on: (event, handler) => {
                            if (event === 'data')
                                handler(new Uint8Array([...text].map(c => c.charCodeAt(0))));
                            if (event === 'end')
                                handler();
                            return resMock;
                        }
                    };
                    if (callback)
                        callback(resMock);
                }).catch(err => {
                    console.error('http request error', err);
                });
            }
        };
        return req;
    };
    return {
        get: (url, options, callback) => {
            const req = request(url, options, callback);
            req.end();
            return req;
        },
        request
    };
};
//# sourceMappingURL=http.js.map