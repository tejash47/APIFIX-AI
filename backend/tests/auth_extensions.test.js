const test = require('node:test');
const assert = require('node:assert');
const { app, server } = require('../src/server');
const userStore = require('../src/services/userStore');

test('AUTH EXTENSIONS — User ID Generation, Phone/Name Capture & Forgot Password Flow', async (t) => {
  const PORT = process.env.PORT || 4000;
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const uniqueStamp = Date.now();
  const testEmail = `engineer_${uniqueStamp}@example.com`;
  const testPhone = `+1 415 555 ${Math.floor(1000 + Math.random() * 9000)}`;
  const testName = `DevOps Engineer ${uniqueStamp % 1000}`;
  const initialPassword = 'superSecretPassword123';
  const updatedPassword = 'newUpgradedPassword456!';
  let createdUserId = '';

  await t.test('1. Registration with Name & Phone generates structured Custom User ID', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        name: testName,
        phone: testPhone,
        password: initialPassword
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 201);
    assert.ok(body.token, 'Must return JWT token');
    assert.ok(body.user, 'Must return user object');
    assert.strictEqual(body.user.email, testEmail);
    assert.strictEqual(body.user.name, testName);
    assert.strictEqual(body.user.phone, testPhone);

    createdUserId = body.user.id;
    assert.ok(createdUserId.startsWith('usr_'), `User ID should start with usr_, got: ${createdUserId}`);
    const phoneLast4 = userStore.normalizePhone(testPhone).slice(-4);
    assert.ok(createdUserId.includes(phoneLast4), `User ID should contain phone digits ${phoneLast4}`);
  });

  await t.test('2. Multi-Identifier Login: Login by Email', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: initialPassword
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.user.id, createdUserId);
  });

  await t.test('3. Multi-Identifier Login: Login by Phone Number', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testPhone,
        password: initialPassword
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.user.id, createdUserId);
  });

  await t.test('4. Multi-Identifier Login: Login by Full Name / Username', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testName,
        password: initialPassword
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.user.id, createdUserId);
  });

  await t.test('5. Multi-Identifier Login: Login by Custom User ID', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: createdUserId,
        password: initialPassword
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.user.id, createdUserId);
  });

  let resetSessionId = '';
  let resetCode = '';

  await t.test('6. Forgot Password: Initiate session with Phone / Email', async () => {
    const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testPhone
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.ok(body.sessionId);
    assert.ok(body.resetCode, 'Should return 6-digit reset code');
    assert.strictEqual(body.resetCode.length, 6);

    resetSessionId = body.sessionId;
    resetCode = body.resetCode;
  });

  await t.test('7. Forgot Password: Verify reset code', async () => {
    const res = await fetch(`${baseUrl}/api/auth/verify-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: resetCode
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.valid, true);
    assert.strictEqual(body.userId, createdUserId);
  });

  await t.test('8. Forgot Password: Reset password with valid code', async () => {
    const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: resetCode,
        newPassword: updatedPassword
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
  });

  await t.test('9. Login fails with old password after reset', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: createdUserId,
        password: initialPassword
      })
    });

    assert.strictEqual(res.status, 401);
  });

  await t.test('10. Login succeeds with new password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testEmail,
        password: updatedPassword
      })
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.user.id, createdUserId);
  });
});
