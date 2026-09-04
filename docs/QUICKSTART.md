# APIFIX AI — Quickstart Guide

This guide takes you from zero to a fully verified autonomous self-repair workflow in 5 minutes.

## 1. Connecting Your Codebase

You can connect your API using one of three methods:
- **ZIP Upload**: Upload a zipped Node.js repository via the UI.
- **GitHub Import**: Provide a repository URL (public or private with a personal access token).
- **Demo Fixture**: Use the bundled demo repository with pre-configured failure points.

## 2. API Endpoint Discovery

Upon intake, APIFIX executes a static Babel AST parse across your controller files and maps out all registered REST routes:
```json
{
  "totalEndpoints": 8,
  "endpoints": [
    { "method": "POST", "path": "/api/auth/login", "authRequired": true },
    { "method": "GET", "path": "/api/users", "authRequired": false }
  ]
}
```

## 3. Detecting Runtime Failures

When an endpoint crashes with an HTTP 500 error, APIFIX records the stack trace and triggers the autonomous repair workflow.

## 4. Viewing Proposed Fixes

In the **Repairs** tab, inspect the Monaco Diff Viewer to compare original and patched source lines before authorizing production deployments.
