const request = require('supertest');
const app = require('../src/server');

describe('GET /api/health', () => {
  it('returns 200 and status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/users', () => {
  it('returns 200 with a list of users', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
  });
});

describe('GET /api/users/:id', () => {
  it('returns 200 for an existing user', async () => {
    const res = await request(app).get('/api/users/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.id).toBe(1);
  });

  it('returns 404 for a nonexistent user', async () => {
    const res = await request(app).get('/api/users/9999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/register', () => {
  it('returns 201 for a valid new registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `newuser+${Date.now()}@example.com`, password: 'somePassword1', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('returns 200 with a token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'existing@example.com', password: 'correctpassword' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('existing@example.com');
  });

  // This test documents the INTENDED behavior. It currently FAILS against
  // the broken implementation, which throws an unhandled TypeError and
  // returns HTTP 500 instead of HTTP 401. That failure is expected and
  // is exactly the signature APIFIX should discover and repair.
  it('should return 401 for a nonexistent user (currently broken: returns 500)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'testpassword123' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when email or password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'existing@example.com' });

    expect(res.status).toBe(400);
  });
});
