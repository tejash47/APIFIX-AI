# APIFIX AI — OpenAPI 3.1 Specification & API Documentation Guide

## 1. Overview & JSON Specification Endpoint

APIFIX AI serves an up-to-date OpenAPI 3.1.0 specification directly from the API gateway:

```http
GET /openapi.json
Accept: application/json
```

This specification fully describes all versioned `/api/v1/*` endpoints, JSON schemas, authentication schemes, idempotency headers, rate limit parameters, and RFC 7807 error envelopes.

---

## 2. Interactive Swagger / Redoc Integration

Organizations can import `/openapi.json` into Swagger UI, Redoc, Postman collections, or internal Backstage developer catalogs.

Example `curl` export:
```bash
curl -s http://localhost:4000/openapi.json | jq .
```

---

## 3. Client SDK Code Generation

Using `@openapitools/openapi-generator-cli`, engineers can generate type-safe client SDKs in TypeScript, Python, Go, Java, or C#:

```bash
# Generate TypeScript Axios Client
npx @openapitools/openapi-generator-cli generate \
  -i https://api.apifix.ai/openapi.json \
  -g typescript-axios \
  -o ./clients/typescript

# Generate Python Client
npx @openapitools/openapi-generator-cli generate \
  -i https://api.apifix.ai/openapi.json \
  -g python \
  -o ./clients/python
```

---

## 4. OpenAPI 3.1 Security Scheme Definitions

The spec includes both Bearer and API Key authentication schemes:

```json
{
  "components": {
    "securitySchemes": {
      "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
        "description": "Enterprise API Key (e.g. apifix_live_...)"
      },
      "BearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT or API Key",
        "description": "JWT session token or Bearer API Key"
      }
    }
  }
}
```
