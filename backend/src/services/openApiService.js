/**
 * APIFIX AI — OpenAPI 3.1 Specification Generator Service
 * 
 * Dynamically generates OpenAPI 3.1 compliant documentation matching real implemented v1 endpoints.
 */

function generateOpenApiSpec(baseUrl = 'http://localhost:4000') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'APIFIX AI Enterprise API',
      version: '1.0.0',
      description: 'Enterprise Integration Platform for Autonomous Self-Healing APIs, Continuous Verification, and Governance.',
      contact: {
        name: 'APIFIX Engineering Team',
        url: 'https://apifix.ai',
        email: 'api@apifix.ai'
      },
      license: {
        name: 'Proprietary / Enterprise',
        url: 'https://apifix.ai/terms'
      }
    },
    servers: [
      {
        url: baseUrl,
        description: 'Current Environment API Server'
      },
      {
        url: 'https://api.apifix.ai',
        description: 'Production Global Cloud Gateway'
      }
    ],
    security: [
      { ApiKeyAuth: [] },
      { BearerAuth: [] }
    ],
    paths: {
      '/api/v1/projects': {
        get: {
          tags: ['Projects'],
          summary: 'List Projects',
          description: 'Retrieve all projects accessible to the authenticated tenant.',
          parameters: [
            { name: 'workspaceId', in: 'query', schema: { type: 'string' }, description: 'Target workspace identifier' }
          ],
          responses: {
            '200': { description: 'List of projects with metadata' },
            '401': { description: 'Unauthorized' }
          }
        },
        post: {
          tags: ['Projects'],
          summary: 'Import or Create Project',
          description: 'Upload a ZIP archive or import a remote repository into an isolated sandbox.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    repoUrl: { type: 'string', example: 'https://github.com/acme/gateway' },
                    branch: { type: 'string', default: 'main' },
                    projectName: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '201': { description: 'Project successfully imported and initialized' },
            '400': { description: 'Validation error' }
          }
        }
      },
      '/api/v1/incidents': {
        get: {
          tags: ['Incidents'],
          summary: 'List Incidents',
          description: 'Retrieve detected runtime exceptions, causal chains, and auto-repairs.',
          parameters: [
            { name: 'severity', in: 'query', schema: { type: 'string', enum: ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED'] } }
          ],
          responses: {
            '200': { description: 'Paginated list of incidents' }
          }
        }
      },
      '/api/v1/runs': {
        get: {
          tags: ['Runs'],
          summary: 'List Agent Runs',
          description: 'Retrieve autonomous repair run history and execution telemetry.',
          responses: {
            '200': { description: 'List of repair runs' }
          }
        },
        post: {
          tags: ['Runs'],
          summary: 'Trigger Autonomous Repair Run',
          description: 'Execute end-to-end investigation, patch synthesis, and sandbox verification on a target project.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId'],
                  properties: {
                    projectId: { type: 'string' },
                    findingId: { type: 'string' },
                    targetEndpoint: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '201': { description: 'Repair run initiated' },
            '429': { description: 'Rate limit or budget quota exceeded' }
          }
        }
      },
      '/api/v1/verification/verify': {
        post: {
          tags: ['Verification'],
          summary: 'Continuous Verification Quality Gate',
          description: 'Runs sandbox reproduction test suite and contract drift analysis against live or staged APIs.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId'],
                  properties: {
                    projectId: { type: 'string' },
                    runId: { type: 'string' },
                    patchId: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Verification results and drift indicators' }
          }
        }
      },
      '/api/v1/webhooks': {
        get: {
          tags: ['Webhooks'],
          summary: 'List Outbound Webhook Subscriptions',
          description: 'Retrieve all configured webhook endpoints and delivery statistics.',
          responses: {
            '200': { description: 'List of webhook endpoints' }
          }
        },
        post: {
          tags: ['Webhooks'],
          summary: 'Register Webhook Endpoint',
          description: 'Subscribe a remote URL to real-time reliability and security events.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url', 'events'],
                  properties: {
                    url: { type: 'string', format: 'uri' },
                    events: { type: 'array', items: { type: 'string' } },
                    description: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '201': { description: 'Webhook registered. HMAC secret returned in response.' }
          }
        }
      },
      '/api/v1/api-keys': {
        get: {
          tags: ['API Keys'],
          summary: 'List API Keys',
          description: 'List active and revoked API keys for the workspace.',
          responses: {
            '200': { description: 'List of API key metadata records' }
          }
        },
        post: {
          tags: ['API Keys'],
          summary: 'Create Scoped API Key',
          description: 'Generate a new API key with fine-grained scopes. The raw secret is returned exactly once.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    scopes: { type: 'array', items: { type: 'string' } },
                    expiresInDays: { type: 'number', default: 365 }
                  }
                }
              }
            }
          },
          responses: {
            '201': { description: 'API Key created with raw secret' }
          }
        }
      },
      '/api/v1/usage': {
        get: {
          tags: ['Usage & Analytics'],
          summary: 'Get API Usage & Analytics',
          description: 'Real-time p50/p95/p99 latency percentiles, error rates, and top endpoints.',
          responses: {
            '200': { description: 'Operational telemetry summary' }
          }
        }
      },
      '/api/v1/audit': {
        get: {
          tags: ['Audit Ledger'],
          summary: 'Query Immutable Audit Ledger',
          description: 'Retrieve SHA-256 hash-chained security event logs.',
          responses: {
            '200': { description: 'Chained audit records' }
          }
        }
      },
      '/api/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'API Health & Readiness',
          description: 'Public health check returning service status.',
          responses: {
            '200': { description: 'System healthy' }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Enterprise API Key authentication header'
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JSON Web Token (JWT) Bearer header'
        }
      },
      schemas: {
        StandardError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'requestId', 'correlationId'],
              properties: {
                code: { type: 'string', example: 'RATE_LIMITED' },
                message: { type: 'string', example: 'Request rate limit exceeded' },
                requestId: { type: 'string', example: 'req_12345' },
                correlationId: { type: 'string', example: 'corr_67890' },
                retryable: { type: 'boolean', example: true }
              }
            }
          }
        }
      }
    }
  };
}

module.exports = {
  generateOpenApiSpec
};
