import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, productionConfigErrors } from '../lib/env.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('loadEnv loads simple KEY=VALUE pairs', async () => {
  const tmpPath = resolve(ROOT, '_test_simple.env');
  await fs.writeFile(tmpPath, 'TEST_ENV_A=foo\nTEST_ENV_B=bar\n', 'utf8');
  try {
    delete process.env.TEST_ENV_A;
    delete process.env.TEST_ENV_B;
    const loaded = await loadEnv(tmpPath);
    assert.equal(loaded.TEST_ENV_A, 'foo');
    assert.equal(loaded.TEST_ENV_B, 'bar');
    assert.equal(process.env.TEST_ENV_A, 'foo');
    assert.equal(process.env.TEST_ENV_B, 'bar');
  } finally {
    delete process.env.TEST_ENV_A;
    delete process.env.TEST_ENV_B;
    await fs.unlink(tmpPath).catch(() => { });
  }
});

test('loadEnv strips matching quotes and handles whitespace', async () => {
  const tmpPath = resolve(ROOT, '_test_quotes.env');
  await fs.writeFile(tmpPath, '  TEST_ENV_Q1 = "hello world" \nTEST_ENV_Q2=\'single quote\'\n', 'utf8');
  try {
    delete process.env.TEST_ENV_Q1;
    delete process.env.TEST_ENV_Q2;
    const loaded = await loadEnv(tmpPath);
    assert.equal(loaded.TEST_ENV_Q1, 'hello world');
    assert.equal(loaded.TEST_ENV_Q2, 'single quote');
  } finally {
    delete process.env.TEST_ENV_Q1;
    delete process.env.TEST_ENV_Q2;
    await fs.unlink(tmpPath).catch(() => { });
  }
});

test('loadEnv ignores comments and empty lines', async () => {
  const tmpPath = resolve(ROOT, '_test_comments.env');
  await fs.writeFile(tmpPath, '# Comment line\n\nTEST_ENV_C=value\n  # Indented comment\n', 'utf8');
  try {
    delete process.env.TEST_ENV_C;
    const loaded = await loadEnv(tmpPath);
    assert.equal(Object.keys(loaded).length, 1);
    assert.equal(loaded.TEST_ENV_C, 'value');
  } finally {
    delete process.env.TEST_ENV_C;
    await fs.unlink(tmpPath).catch(() => { });
  }
});

test('loadEnv does not overwrite pre-existing process.env variables', async () => {
  const tmpPath = resolve(ROOT, '_test_preexisting.env');
  await fs.writeFile(tmpPath, 'TEST_ENV_PRE=from_file\n', 'utf8');
  try {
    process.env.TEST_ENV_PRE = 'already_set';
    const loaded = await loadEnv(tmpPath);
    assert.equal(loaded.TEST_ENV_PRE, 'from_file');
    assert.equal(process.env.TEST_ENV_PRE, 'already_set');
  } finally {
    delete process.env.TEST_ENV_PRE;
    await fs.unlink(tmpPath).catch(() => { });
  }
});

test('loadEnv handles missing file gracefully', async () => {
  const missing = resolve(ROOT, '_non_existent_file.env');
  const loaded = await loadEnv(missing);
  assert.deepEqual(loaded, {});
});

test('productionConfigErrors accepts a Render-style DATABASE_URL', () => {
  assert.deepEqual(productionConfigErrors({ NODE_ENV: 'production', DATABASE_URL: 'postgres://app:secret@db/app' }), []);
});

test('productionConfigErrors rejects missing production database configuration', () => {
  assert.deepEqual(productionConfigErrors({ NODE_ENV: 'production' }), [
    'DATABASE_URL or PGHOST, PGUSER, and PGDATABASE is required in production.',
  ]);
});

test('productionConfigErrors rejects partial Supabase configuration', () => {
  assert.deepEqual(productionConfigErrors({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://app:secret@db/app',
    SUPABASE_URL: 'https://example.supabase.co',
  }), [
    'SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_OWNER_USER_ID must be configured together.',
  ]);
});
