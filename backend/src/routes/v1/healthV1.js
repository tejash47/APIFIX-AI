/**
 * APIFIX AI — Public API v1: Health & Readiness
 */

const express = require('express');
const { formatResponse } = require('../../services/apiEnvelopeService');
const { getMetrics } = require('../../services/observabilityEngine');
const { isSupabaseConfigured } = require('../../config/supabase');

const router = express.Router();

/**
 * GET /api/v1/health
 */
router.get('/', (req, res) => {
  const metrics = getMetrics();
  return formatResponse(res, {
    status: 'healthy',
    version: '1.0.0',
    apiVersion: 'v1',
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    database: isSupabaseConfigured() ? 'connected' : 'memory_fallback',
    aiEngine: 'operational'
  });
});

module.exports = router;
