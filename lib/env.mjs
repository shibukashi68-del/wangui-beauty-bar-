// Minimal .env loader — no external dependency.
//
// The project deliberately avoids a dotenv package; this module provides the
// same behaviour for the flat KEY=VALUE files the app actually uses. It is
// intentionally strict and small:
//   - Only lines of the form `KEY=VALUE` are read.
//   - `#` comments and blank lines are ignored.
//   - Surrounding single or double quotes are stripped from values.
//   - Existing process environment variables always win (a real deployment
//     secret must never be overridden by a committed file).
//   - Parsing is tolerant: a malformed line is skipped, not fatal.
//
// Load order for local/dev: values in a project `.env` fill in any variable
// that is NOT already present in the process environment.

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Read a .env file and merge its entries into `process.env` without
 * overwriting variables that are already set. Returns the parsed map.
 *
 * @param {string} [path] absolute path to the env file (defaults to <root>/.env)
 * @returns {Promise<Record<string, string>>} the entries that were loaded
 */
export async function loadEnv(path = resolve(ROOT, '.env')) {
  let raw;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {}; // no .env file is fine
    throw error;
  }

  const loaded = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 1) continue; // not KEY=VALUE

    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = trimmed.slice(eq + 1).trim();
    // Strip one matching pair of surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    loaded[key] = value;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return loaded;
}

/**
 * Return configuration errors that should prevent a production process from
 * starting. Hosted deployments must provide a database connection either as
 * DATABASE_URL or through the individual PostgreSQL variables. Supabase
 * settings are optional as a group, but partial owner-video configuration is
 * almost certainly an operator mistake and would otherwise fail later on a
 * customer request.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function productionConfigErrors(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];

  const hasDatabaseUrl = Boolean(String(env.DATABASE_URL || '').trim());
  const hasPostgresConfig = ['PGHOST', 'PGUSER', 'PGDATABASE']
    .every((key) => Boolean(String(env[key] || '').trim()));
  const errors = [];
  if (!hasDatabaseUrl && !hasPostgresConfig) {
    errors.push('DATABASE_URL or PGHOST, PGUSER, and PGDATABASE is required in production.');
  }

  const supabaseValues = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_OWNER_USER_ID']
    .map((key) => Boolean(String(env[key] || '').trim()));
  if (supabaseValues.some(Boolean) && !supabaseValues.every(Boolean)) {
    errors.push('SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_OWNER_USER_ID must be configured together.');
  }
  return errors;
}
