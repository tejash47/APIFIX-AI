# APIFIX Demo Broken API

Intentionally broken Node.js/Express API for demonstrating APIFIX AI.

## Target

POST `/api/auth/login`

Use an unknown email to reproduce the seeded 500 error:

```json
{"email":"nonexistent@example.com","password":"somepassword"}
```

The bug is in `src/controllers/authController.js`: the code accesses
`user.password` when `user` is `null`.

## Run

```bash
npm install
npm start
```

The API listens on port 4001 by default.
