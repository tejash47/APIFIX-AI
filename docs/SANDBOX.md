# APIFIX AI — Sandbox Isolation & Dynamic Port Probing

APIFIX ensures that no unverified code can compromise running services or introduce side-effects.

## Dynamic Port Allocation

To prevent port collision in concurrent testing environments, the sandbox dynamically queries the OS kernel for an open ephemeral TCP socket:

```javascript
const server = net.createServer();
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  server.close(() => resolve(port));
});
```

## Security Boundaries

- **Filesystem Isolation**: Ephemeral copy created in isolated scratch directory.
- **Process Boundaries**: Child process spawned with sanitized environment variables (stripping `JWT_SECRET`, `STRIPE_SECRET_KEY`, `AI_API_KEYS`).
- **Execution Ceilings**: Strict 15-second probe timeout. If child process exceeds limit, SIGKILL is dispatched immediately.
