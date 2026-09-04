# APIFIX Demo Auth API

## Purpose

This repository intentionally contains a reproducible API failure. It exists
as a test fixture for the **APIFIX AI** autonomous API repair platform, so
that APIFIX can import it, discover its endpoints, reproduce a genuine
runtime failure, investigate the source code, and generate a patch.

This is an ordinary, independent Express application — it has no special
knowledge of, or integration with, APIFIX.

## Setup

```bash
npm install
npm start
```

## Port

The server listens on `process.env.PORT || 4001`.

## APIs

| Method | Path                 | Description                          |
|--------|----------------------|---------------------------------------|
| GET    | `/api/health`         | Health check                         |
| GET    | `/api/users`           | List all users                       |
| GET    | `/api/users/:id`       | Get a single user by id              |
| POST   | `/api/auth/register`   | Register a new user                  |
| POST   | `/api/auth/login`      | Log in with email + password         |

## Intentional Failure

`POST /api/auth/login` contains a reproducible runtime bug somewhere in the
call chain from `authRoutes.js` → `authController.js` → `authService.js` →
`userService.js`. Logging in with an email that has no matching account
currently produces an unhandled server-side exception instead of a clean
authentication error.

The exact line and fix are intentionally not documented here — that
investigation is the point of the fixture.

## Test Request

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "nonexistent@example.com",
  "password": "testpassword123"
}
```

Current broken result: `HTTP 500`

Expected repaired result: `HTTP 401`

A valid login (`existing@example.com` / `correctpassword`) currently returns
`HTTP 200` with a token, and is expected to continue doing so after any fix.

## Health Check

```
GET /api/health
```

Returns `HTTP 200` with `{ "status": "ok" }`.

## Testing

```bash
npm test
```

The suite includes a test asserting the intended `401` behavior for a
nonexistent user. That test currently fails against the broken
implementation — this is expected, and is itself part of the failure
signature.

## Demo Accounts

These are throwaway, in-memory demo credentials only (no real secrets):

| Email                     | Password        |
|----------------------------|------------------|
| existing@example.com       | correctpassword  |
| grace@example.com          | hopper123        |
| alan@example.com           | turing123        |
