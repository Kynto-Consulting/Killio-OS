export const createUrlMock = () => {
  return {
    URL: typeof URL !== 'undefined' ? URL : class MockURL {
      constructor(public href: string) {}
    },
    URLSearchParams: typeof URLSearchParams !== 'undefined' ? URLSearchParams : class MockParams {},
    parse: (urlStr: string) => {
      // Extremely basic legacy url.parse mock
      try {
        const u = new URL(urlStr);
        return { protocol: u.protocol, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash };
      } catch (e) {
        return { pathname: urlStr };
      }
    },
    format: (urlObj: any) => {
      return `${urlObj.protocol || 'http:'}//${urlObj.hostname || 'localhost'}${urlObj.port ? ':'+urlObj.port : ''}${urlObj.pathname || '/'}${urlObj.search || ''}${urlObj.hash || ''}`;
    }
  };
};
