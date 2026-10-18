// Typed errors so routes can signal HTTP status without leaking stack details.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const unauthorized = (message = 'Please sign in again.') => new HttpError(401, message);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);
export const tooLarge = (message) => new HttpError(413, message);
export const unsupportedMediaType = (message) => new HttpError(415, message);
export const tooManyRequests = (message) => new HttpError(429, message);
export const serviceUnavailable = (message) => new HttpError(503, message);
