/**
 * APIFIX AI — OpenAPI 3.1 Documentation Routes
 * 
 * Serves dynamic OpenAPI 3.1 specification at /openapi.json and API docs metadata at /docs/api.
 */

const express = require('express');
const { generateOpenApiSpec } = require('../services/openApiService');

const router = express.Router();

router.get('/openapi.json', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:4000';
  const baseUrl = `${protocol}://${host}`;

  const spec = generateOpenApiSpec(baseUrl);
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(spec);
});

router.get('/docs/api', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:4000';
  const baseUrl = `${protocol}://${host}`;

  const spec = generateOpenApiSpec(baseUrl);
  return res.status(200).json({
    title: spec.info.title,
    version: spec.info.version,
    description: spec.info.description,
    openApiSpecUrl: `${baseUrl}/openapi.json`,
    endpointsCount: Object.keys(spec.paths).length,
    endpoints: Object.keys(spec.paths),
    authentication: ['X-API-Key', 'Bearer JWT']
  });
});

module.exports = router;
