const jwt = require('jsonwebtoken');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const userStore = require('../services/userStore');
const workspaceService = require('../services/workspaceService');

const apiKeyService = require('../services/apiKeyService');

const JWT_SECRET = process.env.JWT_SECRET || 'apifix_secret_key_2026_super_secure';

const ROLE_HIERARCHY = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1
};

/**
 * Extracts raw bearer token or API key from standard headers and query parameters.
 */
function extractToken(req) {
  if (req.headers && req.headers['x-api-key']) {
    return req.headers['x-api-key'].trim();
  }
  const authHeader = req.headers.authorization || req.headers.token;
  if (authHeader && typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    return authHeader.trim();
  }
  if (req.query && (req.query.token || req.query.apiKey || req.query.api_key)) {
    return req.query.token || req.query.apiKey || req.query.api_key;
  }
  if (req.body && (req.body.authToken || req.body.apiKey)) {
    return req.body.authToken || req.body.apiKey;
  }
  return null;
}

/**
 * Mandatory Authentication Middleware (Supports both JWT Bearer tokens and API Keys)
 */
async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token or API key required.',
        requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
      }
    });
  }

  // Check if token is an enterprise API Key (starts with apifix_)
  if (token.startsWith('apifix_')) {
    const clientIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const validation = apiKeyService.validateApiKey(token, clientIp);

    if (!validation.valid) {
      if (validation.reason === 'KEY_REVOKED') {
        return res.status(401).json({
          error: {
            code: 'API_KEY_REVOKED',
            message: 'Provided API key has been revoked.',
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }
      if (validation.reason === 'KEY_EXPIRED') {
        return res.status(401).json({
          error: {
            code: 'API_KEY_EXPIRED',
            message: 'Provided API key has expired.',
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }
      return res.status(401).json({
        error: {
          code: 'INVALID_API_KEY',
          message: 'Supplied API key is invalid or unknown.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    req.apiKey = validation.key;
    req.user = {
      id: `key_${validation.key.id}`,
      email: `${validation.key.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}@apikey.local`,
      name: validation.key.name,
      role: validation.key.role || 'DEVELOPER',
      isApiKey: true
    };
    req.organizationId = validation.key.organizationId;
    req.workspaceId = validation.key.workspaceId;

    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    let user = userStore.findUserById(decoded.id) || userStore.findUserByEmail(decoded.email);

    if (!user && decoded.id && decoded.email) {
      user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name || decoded.email.split('@')[0],
        role: decoded.role || 'developer'
      };
    }

    if (!user && isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, name, role')
          .eq('id', decoded.id)
          .maybeSingle();

        if (!error && data) {
          user = data;
        }
      } catch (e) {}
    }

    if (!user) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account associated with token no longer exists.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    return next();
  } catch (err) {
    const errorCode = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    const message = err.name === 'TokenExpiredError' 
      ? 'Supplied token has expired. Please sign in again.' 
      : 'Supplied token is invalid, malformed, or algorithm unsupported.';

    return res.status(401).json({
      error: {
        code: errorCode,
        message,
        requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
      }
    });
  }
}

/**
 * Optional Authentication Middleware
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    let user = userStore.findUserById(decoded.id) || userStore.findUserByEmail(decoded.email);

    if (!user && decoded.id && decoded.email) {
      user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name || decoded.email.split('@')[0],
        role: decoded.role || 'developer'
      };
    }

    if (!user && isSupabaseConfigured()) {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, email, name, role')
          .eq('id', decoded.id)
          .maybeSingle();
        if (data) user = data;
      } catch (e) {}
    }

    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      };
    }
  } catch (e) {
    req.user = null;
  }

  return next();
}

/**
 * Workspace RBAC and Isolation Authorization Middleware
 * @param {'OWNER'|'ADMIN'|'MEMBER'|'VIEWER'} minRole
 */
function requireWorkspaceAccess(minRole = 'VIEWER') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required for workspace access.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    const workspaceId =
      req.params.workspaceId ||
      req.params.id ||
      req.headers['x-workspace-id'] ||
      req.query.workspaceId ||
      (req.body && req.body.workspaceId);

    if (!workspaceId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_WORKSPACE_ID',
          message: 'Target workspace identifier is required.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    try {
      // Check if workspace exists
      const workspace = await workspaceService.getWorkspaceById(workspaceId);
      if (!workspace) {
        return res.status(404).json({
          error: {
            code: 'WORKSPACE_NOT_FOUND',
            message: 'Requested workspace does not exist.',
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }

      // System Administrator bypasses workspace member checks
      if (req.user.role === 'admin' || req.user.email?.toLowerCase() === 'admin@apifix.ai') {
        req.workspace = workspace;
        req.workspaceMembership = {
          workspaceId,
          userId: req.user.id,
          role: 'OWNER',
          isSystemAdmin: true
        };
        return next();
      }

      // Check membership
      const membership = await workspaceService.getMember(workspaceId, req.user.id);
      if (!membership) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_WORKSPACE_ACCESS',
            message: 'You do not have access to this workspace.',
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }

      const userRoleLevel = ROLE_HIERARCHY[membership.role] || 0;
      const requiredRoleLevel = ROLE_HIERARCHY[minRole] || 1;

      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Action requires at least ${minRole} permissions in this workspace.`,
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }

      req.workspace = workspace;
      req.workspaceMembership = membership;
      return next();
    } catch (err) {
      console.error('[AuthMiddleware] Workspace authorization error:', err);
      return res.status(500).json({
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'Failed to verify workspace permissions.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }
  };
}

/**
 * Organization RBAC and Enterprise Isolation Middleware
 * @param {'OWNER'|'ADMIN'|'SECURITY_ADMIN'|'BILLING_ADMIN'|'SRE_ADMIN'|'DEVELOPER'|'MEMBER'|'VIEWER'} minRole
 */
function requireOrganizationAccess(minRole = 'VIEWER') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required for organization access.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    const organizationService = require('../services/organizationService');
    const { isRoleAtLeast } = require('../services/permissionService');

    const orgId =
      req.params.orgId ||
      req.params.id ||
      req.headers['x-organization-id'] ||
      req.query.orgId ||
      (req.body && req.body.orgId);

    if (!orgId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_ORGANIZATION_ID',
          message: 'Target organization identifier is required.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    try {
      const org = await organizationService.getOrganizationById(orgId);
      if (!org) {
        return res.status(404).json({
          error: {
            code: 'ORGANIZATION_NOT_FOUND',
            message: 'Requested organization does not exist.',
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }

      // System Administrator bypass
      if (req.user.role === 'admin' || req.user.email?.toLowerCase() === 'admin@apifix.ai') {
        req.organization = org;
        req.organizationMembership = {
          organizationId: orgId,
          userId: req.user.id,
          role: 'OWNER',
          isSystemAdmin: true
        };
        return next();
      }

      const membership = await organizationService.getOrganizationMember(orgId, req.user.id, req.user.email);
      if (!membership) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_ORGANIZATION_ACCESS',
            message: 'You do not have access to this enterprise organization.',
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }

      if (!isRoleAtLeast(membership.role, minRole)) {
        return res.status(403).json({
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Action requires at least ${minRole} permissions in this organization.`,
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }

      req.organization = org;
      req.organizationMembership = membership;
      return next();
    } catch (err) {
      console.error('[AuthMiddleware] Organization authorization error:', err);
      return res.status(500).json({
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'Failed to verify organization permissions.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }
  };
}

/**
 * Granular Capability Permission Middleware
 * @param {string} permission - e.g. 'audit.export', 'policy.manage'
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    if (req.user.role === 'admin' || req.user.email?.toLowerCase() === 'admin@apifix.ai') {
      return next();
    }

    const { hasPermission } = require('../services/permissionService');
    let userRole = (req.organizationMembership && req.organizationMembership.role) ||
      (req.workspaceMembership && req.workspaceMembership.role);

    if (!userRole && req.user.role) {
      const normalized = String(req.user.role).toUpperCase();
      if (['OWNER', 'ADMIN', 'SECURITY_ADMIN', 'BILLING_ADMIN', 'SRE_ADMIN', 'DEVELOPER', 'MEMBER', 'VIEWER'].includes(normalized)) {
        userRole = normalized;
      } else if (req.user.role === 'admin') {
        userRole = 'ADMIN';
      } else if (req.user.role === 'developer') {
        userRole = 'DEVELOPER';
      }
    }

    if (!userRole) {
      userRole = 'VIEWER';
    }

    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Action requires permission capability '${permission}'.`,
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    return next();
  };
}

/**
 * Granular API Key Scope Middleware
 * @param {string} requiredScope - e.g. 'projects:read', 'runs:create'
 */
function requireApiKeyScope(requiredScope) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    // System administrator bypasses scope checks
    if (req.user.role === 'admin' || req.user.role === 'ADMIN' || req.user.role === 'OWNER' || req.user.email?.toLowerCase() === 'admin@apifix.ai') {
      return next();
    }

    // If request used an API Key, verify scopes
    if (req.apiKey) {
      if (!apiKeyService.hasScope(req.apiKey.scopes, requiredScope)) {
        return res.status(403).json({
          error: {
            code: 'INSUFFICIENT_SCOPE',
            message: `API Key does not possess the required scope '${requiredScope}'.`,
            requiredScope,
            availableScopes: req.apiKey.scopes,
            requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
          }
        });
      }
      return next();
    }

    // For standard JWT user sessions, check permission mapping
    const { hasPermission } = require('../services/permissionService');
    const userRole = String(req.user.role || 'VIEWER').toUpperCase();
    if (userRole === 'VIEWER' && requiredScope.endsWith(':write')) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Viewer role cannot execute mutating action '${requiredScope}'.`,
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown'
        }
      });
    }

    return next();
  };
}

module.exports = {
  JWT_SECRET,
  ROLE_HIERARCHY,
  authenticate,
  optionalAuth,
  requireWorkspaceAccess,
  requireOrganizationAccess,
  requirePermission,
  requireApiKeyScope
};
