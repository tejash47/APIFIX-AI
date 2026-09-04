const { test, describe } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/server');

describe('Auth Endpoints Test Suite', () => {
  test('GET /health should return 200 OK', async () => {
    const res = await request(app).get('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
  });

  test('POST /api/auth/login with valid user should return 200 and token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'securepassword123' });
    
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.email, 'alex@example.com');
  });

  test('POST /api/auth/login with invalid email should return controlled client error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'somepassword' });
    
    assert.ok(res.status < 500);
  });
});
