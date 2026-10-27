// Structured JSON logging with request correlation IDs and secret redaction.
// One line per event on stdout so any log shipper (Render, Fly, CloudWatch)
// can parse it. Tests inject a custom sink via logger.create({ write }).

import { randomBytes } from 'node:crypto';

const REDACTED = '[redacted]';
const SECRET_KEYS = new Set(['password', 'secret', 'token', 'cookie', 'authorization']);
const IS_PROD = process.env.NODE_ENV === 'production';
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const configured = Number(process.env.LOG_LEVEL);
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? (IS_PROD ? LEVELS.info : LEVELS.debug);

function redact(value, key) {
  if (SECRET_KEYS.has(String(key).toLowerCase())) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  }
  return value;
}

function makeLogger(sink, context = {}) {
  function emit(level, event, fields = {}) {
    if (LEVELS[level] < MIN_LEVEL) return;
    const record = {
      time: new Date().toISOString(),
      level,
      event,
      ...redact({ ...context, ...fields }, ''),
    };
    sink(JSON.stringify(record));
  }
  return {
    emit,
    context,
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    /** Create a child logger that carries extra context (e.g. request_id). */
    child(extra) { return makeLogger(sink, { ...context, ...extra }); },
    /** Re-open the sink — used by tests to swap destinations. */
    create(options) { return makeLogger(options.write, context); },
  };
}

const rootLogger = makeLogger((line) => {
  if (IS_PROD || LEVELS.info >= MIN_LEVEL) console.log(line);
  else (console.log)(line);
});

export const logger = {
  create: (options) => makeLogger(options.write),
  info: rootLogger.info,
  warn: rootLogger.warn,
  error: rootLogger.error,
  debug: rootLogger.debug,
};

export const log = rootLogger;

/** Express-style middleware for a single raw http.Server. */
export function withLogging(handler, instance = rootLogger) {
  return async (req, res) => {
    const requestId = (res && typeof res.getHeader === 'function' && res.getHeader('x-request-id')) || randomBytes(8).toString('hex');
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('x-request-id', requestId);
    }
    const requestLog = instance.child({ request_id: requestId });
    instance.context.requestId = requestId;
    requestLog.context.requestId = requestId;
    const startedAt = Date.now();
    requestLog.info('http.request', {
      method: req.method,
      path: req.url?.split('?')[0] || '',
    });

    // Capture the status that handler code actually writes, even if the
    // handler throws afterwards — error paths must not lose the real status.
    let observedStatus = null;
    if (res && typeof res.writeHead === 'function') {
      const originalWriteHead = res.writeHead.bind(res);
      res.writeHead = (status, headers) => {
        observedStatus = status;
        return originalWriteHead(status, headers);
      };
    }

    try {
      await handler(req, res, requestId);
    } catch (error) {
      requestLog.error('http.unhandled_error', {
        method: req.method,
        path: req.url?.split('?')[0] || '',
        error: error?.message || String(error),
        stack: IS_PROD ? undefined : error?.stack,
      });
      if (res && !res.headersSent) {
        if (typeof res.writeHead === 'function') {
          res.writeHead(error?.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        if (typeof res.end === 'function') {
          res.end(JSON.stringify({ error: error?.status ? error.message : 'Server error. Please try again.' }));
        }
      } else if (res && typeof res.destroy === 'function') {
        res.destroy();
      }
    }

    const responseId = randomBytes(8).toString('hex');
    const responseLog = requestLog.child({ request_id: responseId, requestId: responseId });
    responseLog.info('http.response', {
      method: req.method,
      path: req.url?.split('?')[0] || '',
      status: observedStatus ?? res?.statusCode ?? 200,
      duration_ms: Date.now() - startedAt,
    });
  };
}
