export const createPathMock = () => {
  return {
    join: (...paths: string[]) => {
      return paths.join('/').replace(/\/+/g, '/');
    },
    resolve: (...paths: string[]) => {
      return paths.join('/').replace(/\/+/g, '/');
    },
    basename: (path: string) => {
      return path.split('/').pop() || '';
    },
    dirname: (path: string) => {
      return path.split('/').slice(0, -1).join('/') || '/';
    }
  };
};
