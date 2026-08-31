import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_PORT = 3099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('Local Build & Smoke Tests', () => {
  it('1. Verifies build artifacts exist', () => {
    assert.ok(existsSync('dist/index.js'), 'dist/index.js must exist');
    assert.ok(existsSync('dist/public/index.html'), 'dist/public/index.html must exist');
    assert.ok(existsSync('src/prisma/contract.json'), 'src/prisma/contract.json must exist');
    assert.ok(existsSync('src/prisma/contract.d.ts'), 'src/prisma/contract.d.ts must exist');

    const html = readFileSync('dist/public/index.html', 'utf8');
    assert.ok(html.includes('<div id="root">') || html.includes('<!doctype html>') || html.includes('<html'), 'index.html must contain HTML structure');
  });

  describe('2. Server Startup & API Smoke Tests', () => {
    let serverProcess;

    before(async () => {
      // Start server on dedicated test port with dummy DATABASE_URL
      serverProcess = spawn(
        process.execPath,
        ['dist/index.js'],
        {
          env: {
            ...process.env,
            PORT: String(TEST_PORT),
            DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ham_test',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      let stdout = '';
      let stderr = '';
      serverProcess.stdout.on('data', (d) => (stdout += d.toString()));
      serverProcess.stderr.on('data', (d) => (stderr += d.toString()));

      // Poll until server is ready or timeout after 10s
      const start = Date.now();
      let ready = false;
      while (Date.now() - start < 10000) {
        try {
          const res = await fetch(`${BASE_URL}/api/health`);
          if (res.ok) {
            ready = true;
            break;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (!ready) {
        serverProcess.kill('SIGKILL');
        throw new Error(`Server failed to start on port ${TEST_PORT}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
      }
    });

    after(() => {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
      }
    });

    it('GET /api/health returns 200 and status ok', async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.status, 'ok');
      assert.ok(json.time, 'must include time');
    });

    it('GET / serves frontend index.html SPA correctly', async () => {
      const res = await fetch(`${BASE_URL}/`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('html') || text.includes('root'), 'Must serve HTML frontend');
    });

    it('GET /metrics serves Prometheus metrics', async () => {
      const res = await fetch(`${BASE_URL}/metrics`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('http_requests_total'), 'Must include http_requests_total metric');
    });

    it('GET /non-existent-route falls back to SPA index.html', async () => {
      const res = await fetch(`${BASE_URL}/app/tickets/42`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('html') || text.includes('root'), 'SPA fallback must serve index.html');
    });
  });
});
