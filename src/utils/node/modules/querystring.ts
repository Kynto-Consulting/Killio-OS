export const createQueryStringMock = () => {
  return {
    parse: (str: string) => {
      const obj: Record<string, string> = {};
      if (str.startsWith('?')) str = str.slice(1);
      str.split('&').forEach(part => {
        const [k, v] = part.split('=');
        if (k) obj[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
      });
      return obj;
    },
    stringify: (obj: Record<string, any>) => {
      return Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
    }
  };
};
