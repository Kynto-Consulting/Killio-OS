export const createUtilMock = () => {
  return {
    promisify: (fn: Function) => {
      return (...args: any[]) => {
        return new Promise((resolve, reject) => {
          fn(...args, (err: any, result: any) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      };
    },
    format: (fmt: string, ...args: any[]) => {
      let i = 0;
      return fmt.replace(/%[sdj%]/g, (match) => {
        if (match === '%%') return '%';
        if (i >= args.length) return match;
        const arg = args[i++];
        if (match === '%j') {
          try { return JSON.stringify(arg); } catch (_) { return '[Circular]'; }
        }
        return String(arg);
      });
    },
    TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : class MockTextEncoder {
      encode(str: string) { return new Uint8Array([...str].map(c => c.charCodeAt(0))); }
    },
    TextDecoder: typeof TextDecoder !== 'undefined' ? TextDecoder : class MockTextDecoder {
      decode(arr: Uint8Array) { return Array.from(arr).map(c => String.fromCharCode(c)).join(''); }
    }
  };
};
