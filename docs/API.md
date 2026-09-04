# APIFIX AI — Version 1 Public REST API Reference

All public endpoints are mounted under `/api/v1` and require API key authentication.

## Authentication

Pass your API key in the `X-API-Key` or `Authorization: Bearer <key>` header:

```http
GET /api/v1/incidents HTTP/1.1
Host: api.apifix.ai
X-API-Key: apifix_live_abc123...
```

## Endpoints

### 1. Ingest Incident
`POST /api/v1/incidents`

**Request Body:**
```json
{
  "endpoint": "POST /api/auth/login",
  "statusCode": 500,
  "errorMessage": "TypeError: Cannot read properties of undefined",
  "stackTrace": "TypeError: ... at /src/controllers/auth.js:42",
  "requestPayload": { "email": "admin@example.com" }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "incidentId": "inc_1788535800000",
    "status": "QUEUED",
    "createdAt": "2026-09-04T12:00:00.000Z"
  }
}
```

### 2. Get Repair Status
`GET /api/v1/repairs/:repairId`

**Response:**
```json
{
  "success": true,
  "data": {
    "repairId": "rep_1788535800000",
    "status": "VERIFIED",
    "patchDiff": "--- a/src/auth.js\n+++ b/src/auth.js\n@@ -42,1 +42,3 @@\n+ if (!req.body) return res.status(400);",
    "verificationProbe": { "status": 401, "error": null }
  }
}
```
