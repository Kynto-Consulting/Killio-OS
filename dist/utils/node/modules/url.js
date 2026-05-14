export const createUrlMock = () => {
    return {
        URL: typeof URL !== 'undefined' ? URL : class MockURL {
            href;
            constructor(href) {
                this.href = href;
            }
        },
        URLSearchParams: typeof URLSearchParams !== 'undefined' ? URLSearchParams : class MockParams {
        },
        parse: (urlStr) => {
            // Extremely basic legacy url.parse mock
            try {
                const u = new URL(urlStr);
                return { protocol: u.protocol, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash };
            }
            catch (e) {
                return { pathname: urlStr };
            }
        },
        format: (urlObj) => {
            return `${urlObj.protocol || 'http:'}//${urlObj.hostname || 'localhost'}${urlObj.port ? ':' + urlObj.port : ''}${urlObj.pathname || '/'}${urlObj.search || ''}${urlObj.hash || ''}`;
        }
    };
};
//# sourceMappingURL=url.js.map