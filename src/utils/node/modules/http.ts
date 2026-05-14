export const createHttpMock = () => {
  const request = (url: string, options: any, callback?: Function) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    
    let responseEnded = false;
    const req = {
      on: (event: string, handler: Function) => req,
      end: () => {
         if (responseEnded) return;
         responseEnded = true;
         fetch(url, options).then(async (res) => {
           const text = await res.text();
           const resMock = {
              statusCode: res.status,
              headers: Object.fromEntries(res.headers.entries()),
              on: (event: string, handler: Function) => {
                if (event === 'data') handler(new Uint8Array([...text].map(c => c.charCodeAt(0))));
                if (event === 'end') handler();
                return resMock;
              }
           };
           if (callback) callback(resMock);
         }).catch(err => {
            console.error('http request error', err);
         });
      }
    };
    return req;
  };

  return {
    get: (url: string, options: any, callback?: Function) => {
       const req = request(url, options, callback);
       req.end();
       return req;
    },
    request
  };
};
