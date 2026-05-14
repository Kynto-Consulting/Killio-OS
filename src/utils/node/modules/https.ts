import { createHttpMock } from './http.js';

export const createHttpsMock = () => {
  // HTTPS in Node.js uses mostly the exact same API as HTTP for basic tasks
  // We can just reuse the HTTP mock since under the hood we use fetch() which automatically handles TLS.
  return createHttpMock();
};
