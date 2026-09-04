# APIFIX AI — SCIM 2.0 Directory Provisioning Guide (/scim/v2/*)

## 1. Overview & RFC 7644 Conformance

APIFIX AI provides a RFC 7643 / RFC 7644 compliant SCIM 2.0 (System for Cross-domain Identity Management) service enabling automated user provisioning, deprovisioning, and group synchronization directly from Okta, Microsoft Entra ID, OneLogin, or Google Workspace.

Base URL:
```
https://api.apifix.ai/scim/v2
```

---

## 2. Supported SCIM Endpoints

| HTTP Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/scim/v2/Users` | List and search provisioned users with pagination. |
| `POST` | `/scim/v2/Users` | Provision a new user account. |
| `GET` | `/scim/v2/Users/:id` | Retrieve specific user SCIM resource. |
| `PATCH` | `/scim/v2/Users/:id` | Update user status (e.g. deactivate on departure). |
| `DELETE` | `/scim/v2/Users/:id` | Remove user from organization. |
| `GET` | `/scim/v2/Groups` | List synchronized directory groups. |
| `POST` | `/scim/v2/Groups` | Create a new directory group with member list. |
| `GET` | `/scim/v2/Groups/:id` | Retrieve group membership details. |

---

## 3. SCIM User Schema Example

### POST /scim/v2/Users

Request:
```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userName": "sarah.connor@titan.com",
  "name": {
    "givenName": "Sarah",
    "familyName": "Connor"
  },
  "emails": [
    {
      "value": "sarah.connor@titan.com",
      "primary": true
    }
  ],
  "active": true
}
```

Response (HTTP 201 Created, `Content-Type: application/scim+json`):
```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "id": "usr_scim_1725432000",
  "userName": "sarah.connor@titan.com",
  "name": {
    "givenName": "Sarah",
    "familyName": "Connor",
    "formatted": "Sarah Connor"
  },
  "emails": [
    {
      "value": "sarah.connor@titan.com",
      "primary": true
    }
  ],
  "active": true,
  "meta": {
    "resourceType": "User",
    "created": "2026-09-04T06:00:00.000Z",
    "lastModified": "2026-09-04T06:00:00.000Z",
    "location": "https://api.apifix.ai/scim/v2/Users/usr_scim_1725432000"
  }
}
```

---

## 4. Deactivating a User (PATCH)

```http
PATCH /scim/v2/Users/usr_scim_1725432000
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "replace",
      "path": "active",
      "value": false
    }
  ]
}
```
Deactivated users immediately have active JWT sessions and personal API keys suspended.
