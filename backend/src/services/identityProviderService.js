/**
 * APIFIX AI — Enterprise Identity & SSO Abstraction Service
 * 
 * Manages OIDC, SAML 2.0, Google Workspace, and Microsoft Entra ID SSO integrations,
 * automated group-to-role translation, JIT provisioning, and audit logging.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const auditLedgerService = require('./auditLedgerService');
const userStore = require('./userStore');
const organizationService = require('./organizationService');
const { sanitizeSecrets } = require('./securitySanitizer');

const JWT_SECRET = process.env.JWT_SECRET || 'apifix_secret_key_2026_super_secure';
const DATA_DIR = path.resolve(__dirname, '../../data');
const SSO_CONFIGS_FILE = path.join(DATA_DIR, 'sso_configurations.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function readConfigs() {
  try {
    if (fs.existsSync(SSO_CONFIGS_FILE)) {
      return JSON.parse(fs.readFileSync(SSO_CONFIGS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function writeConfigs(configs) {
  try {
    fs.writeFileSync(SSO_CONFIGS_FILE, JSON.stringify(configs, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Configure SSO for an organization
 */
async function configureSso({
  organizationId,
  providerType = 'OIDC', // 'OIDC', 'SAML', 'GOOGLE', 'ENTRA'
  issuerUrl,
  clientId,
  clientSecret,
  ssoUrl,
  samlEntryPoint,
  certificate,
  samlCert,
  entityId,
  roleMappings = {
    'APIFIX-ADMINS': 'ADMIN',
    'APIFIX-SRE-LEADS': 'SRE_ADMIN',
    'APIFIX-SECOPS': 'SECURITY_ADMIN',
    'APIFIX-ENGINEERS': 'DEVELOPER',
    'APIFIX-VIEWERS': 'VIEWER'
  },
  defaultRole = 'MEMBER',
  enabled = true,
  actor = {}
}) {
  if (!organizationId) throw new Error('Organization ID is required for SSO setup.');

  const configs = readConfigs();
  let existing = configs.find(c => c.organizationId === organizationId);

  if (!existing) {
    existing = {
      id: `sso_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organizationId,
      createdAt: new Date().toISOString()
    };
    configs.push(existing);
  }

  existing.providerType = providerType;
  existing.issuerUrl = issuerUrl || existing.issuerUrl || 'https://auth.enterprise.io';
  existing.clientId = clientId || existing.clientId || `client_${Date.now()}`;
  if (clientSecret) existing.clientSecret = clientSecret;
  if (ssoUrl || samlEntryPoint) existing.ssoUrl = ssoUrl || samlEntryPoint;
  if (ssoUrl || samlEntryPoint) existing.samlEntryPoint = ssoUrl || samlEntryPoint;
  if (certificate || samlCert) existing.certificate = certificate || samlCert;
  if (certificate || samlCert) existing.samlCert = certificate || samlCert;
  if (entityId) existing.entityId = entityId;
  existing.roleMappings = roleMappings || existing.roleMappings;
  existing.defaultRole = defaultRole || existing.defaultRole || 'MEMBER';
  existing.enabled = enabled !== undefined ? Boolean(enabled) : true;
  existing.updatedAt = new Date().toISOString();

  writeConfigs(configs);

  try {
    await auditLedgerService.recordEvent({
      organizationId,
      workspaceId: 'ws_system',
      action: 'SSO_CONFIG_UPDATED',
      actorId: actor.id || 'usr_anonymous',
      actorEmail: actor.email || 'system',
      resourceType: 'SSO_CONFIG',
      resourceId: existing.id,
      metadata: { providerType: existing.providerType, enabled: existing.enabled }
    });
  } catch (e) {}

  return sanitizeSecrets({
    id: existing.id,
    organizationId: existing.organizationId,
    providerType: existing.providerType,
    issuerUrl: existing.issuerUrl,
    clientId: existing.clientId,
    ssoUrl: existing.ssoUrl,
    entityId: existing.entityId,
    roleMappings: existing.roleMappings,
    defaultRole: existing.defaultRole,
    enabled: existing.enabled,
    updatedAt: existing.updatedAt
  });
}

/**
 * Get SSO Configuration for Organization
 */
function getSsoConfig(organizationId) {
  const configs = readConfigs();
  const found = configs.find(c => c.organizationId === organizationId);
  return found ? sanitizeSecrets(found) : null;
}

/**
 * Authenticate or JIT Provision User via SSO Identity assertion
 */
async function processSsoCallback({
  organizationId,
  idpUserId,
  email,
  name,
  groups = [],
  claims = null
}) {
  const effectiveEmail = email || claims?.email;
  const effectiveName = name || claims?.name || claims?.given_name || (effectiveEmail ? effectiveEmail.split('@')[0] : '');
  const effectiveIdpUserId = idpUserId || claims?.sub || claims?.id || claims?.oid;
  const effectiveGroups = (claims && Array.isArray(claims.groups) ? claims.groups : (Array.isArray(groups) ? groups : []));

  if (!effectiveEmail) throw new Error('Email claim is required from Identity Provider.');
  const config = getSsoConfig(organizationId);
  if (!config || !config.enabled) {
    throw new Error('SSO is not enabled or configured for this organization.');
  }

  // Determine role based on IdP group mappings
  let assignedRole = config.defaultRole || 'MEMBER';
  if (Array.isArray(effectiveGroups) && config.roleMappings) {
    for (const group of effectiveGroups) {
      if (config.roleMappings[group]) {
        assignedRole = config.roleMappings[group];
        break;
      }
    }
  }

  const normalizedEmail = effectiveEmail.trim().toLowerCase();
  let user = userStore.findUserByEmail(normalizedEmail);

  if (!user) {
    // Just-in-time user creation
    user = userStore.createUser({
      id: effectiveIdpUserId || `usr_sso_${Date.now()}`,
      email: normalizedEmail,
      name: effectiveName || normalizedEmail.split('@')[0],
      password: crypto.randomBytes(32).toString('hex'), // Random password for SSO users
      role: assignedRole.toLowerCase()
    });

    try {
      await auditLedgerService.recordEvent({
        organizationId,
        workspaceId: 'ws_system',
        action: 'SSO_USER_JIT_PROVISIONED',
        actorId: user.id,
        actorEmail: user.email,
        resourceType: 'USER',
        resourceId: user.id,
        metadata: { assignedRole, groups }
      });
    } catch (e) {}
  }

  // Ensure organization membership
  try {
    await organizationService.addMember(organizationId, {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      role: assignedRole
    });
  } catch (e) {}

  // Generate Session JWT
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: assignedRole, organizationId },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: assignedRole,
      organizationId
    }
  };
}

module.exports = {
  configureSso,
  getSsoConfig,
  processSsoCallback
};
