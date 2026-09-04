# APIFIX AI — Webhooks Guide

APIFIX supports inbound error ingestion webhooks and outbound notification webhooks.

## Inbound Webhook Ingestion

Send crash alerts from Datadog, Sentry, or custom monitors to:
`POST /api/workspaces/:workspaceId/webhooks/inbound`

## Outbound Webhook Verification (HMAC-SHA256)

All outbound webhooks include cryptographic signature headers:
- `X-Apifix-Signature-256`: `sha256=<hex_digest>`
- `X-Apifix-Timestamp`: Unix timestamp (epoch seconds)

### Node.js Signature Verification Example

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signatureHeader, secret) {
  const [algo, signature] = signatureHeader.split('=');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```
