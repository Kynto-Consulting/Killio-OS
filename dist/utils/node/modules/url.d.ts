export declare const createUrlMock: () => {
    URL: {
        new (url: string | URL, base?: string | URL): URL;
        prototype: URL;
        canParse(url: string | URL, base?: string | URL): boolean;
        createObjectURL(obj: Blob | MediaSource): string;
        parse(url: string | URL, base?: string | URL): URL | null;
        revokeObjectURL(url: string): void;
    } | {
        new (href: string): {
            href: string;
        };
    };
    URLSearchParams: {
        new (init?: string[][] | Record<string, string> | string | URLSearchParams): URLSearchParams;
        prototype: URLSearchParams;
    } | {
        new (): {};
    };
    parse: (urlStr: string) => {
        protocol: string;
        hostname: string;
        port: string;
        pathname: string;
        search: string;
        hash: string;
    } | {
        pathname: string;
        protocol?: never;
        hostname?: never;
        port?: never;
        search?: never;
        hash?: never;
    };
    format: (urlObj: any) => string;
};
//# sourceMappingURL=url.d.ts.map