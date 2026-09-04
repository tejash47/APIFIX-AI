/**
 * APIFIX AI — Public API v1: Organizations
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const organizationService = require('../../services/organizationService');

const router = express.Router();

/**
 * GET /api/v1/organizations
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const orgs = await organizationService.listUserOrganizations(req.user.id, req.user.email);
    return formatResponse(res, orgs);
  } catch (err) {
    return formatError(res, 500, 'ORGS_FETCH_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/organizations/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const org = await organizationService.getOrganizationById(req.params.id);
    if (!org) {
      return formatError(res, 404, 'ORG_NOT_FOUND', `Organization ${req.params.id} not found.`, req);
    }
    return formatResponse(res, org);
  } catch (err) {
    return formatError(res, 500, 'ORG_FETCH_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/organizations
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, domain } = req.body || {};
    const created = await organizationService.createOrganization({
      name,
      domain,
      ownerId: req.user.id,
      ownerEmail: req.user.email,
      ownerName: req.user.name
    });
    return formatResponse(res, created, { statusCode: 201 });
  } catch (err) {
    return formatError(res, 400, 'ORG_CREATE_FAILED', err.message, req);
  }
});

module.exports = router;
