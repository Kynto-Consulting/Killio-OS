export const createPathMock = () => {
    return {
        join: (...paths) => {
            return paths.join('/').replace(/\/+/g, '/');
        },
        resolve: (...paths) => {
            return paths.join('/').replace(/\/+/g, '/');
        },
        basename: (path) => {
            return path.split('/').pop() || '';
        },
        dirname: (path) => {
            return path.split('/').slice(0, -1).join('/') || '/';
        }
    };
};
//# sourceMappingURL=path.js.map