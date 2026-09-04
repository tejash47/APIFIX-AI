/**
 * APIFIX AI — Phase 25 Onboarding E2E Test Suite
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { app } = require('../src/server');

describe('Phase 25 — Customer Onboarding Lifecycle & Progression', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('ONBOARDING 1: Initial workspace state returns Step 1 (Incomplete)', async () => {
    const res = await fetch(`${baseUrl}/api/product/onboarding?workspaceId=ws_onboarding_test`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.currentStep, 1);
    assert.strictEqual(body.data.completed, false);
  });

  test('ONBOARDING 2: Step completion advances progression deterministically', async () => {
    const res = await fetch(`${baseUrl}/api/product/onboarding/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws_onboarding_test',
        step: 1
      })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.currentStep, 2);
    assert.ok(body.data.completedSteps.includes(1));
  });

  test('ONBOARDING 3: Completing Step 7 marks onboarding complete', async () => {
    const res = await fetch(`${baseUrl}/api/product/onboarding/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws_onboarding_test',
        step: 7
      })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.completed, true);
  });

  test('ONBOARDING 4: Skip action transitions workspace directly to completed', async () => {
    const res = await fetch(`${baseUrl}/api/product/onboarding/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws_skip_test',
        skipped: true
      })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.skipped, true);
    assert.strictEqual(body.data.completed, true);
  });
});
