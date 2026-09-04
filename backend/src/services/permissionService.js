/**
 * APIFIX AI — Enterprise Permission & RBAC Capability Service (Phase 20)
 * Centralized fine-grained permission matrix across 8 Enterprise Roles.
 */

const ROLE_RANKS = {
  OWNER: 8,
  ADMIN: 7,
  SECURITY_ADMIN: 6,
  BILLING_ADMIN: 5,
  SRE_ADMIN: 4,
  DEVELOPER: 3,
  MEMBER: 2,
  VIEWER: 1
};

const ROLE_PERMISSIONS = {
  OWNER: [
    'organization.read',
    'organization.update',
    'organization.delete',
    'organization.manage',
    'members.read',
    'members.manage',
    'workspace.read',
    'workspace.manage',
    'security.read',
    'security.manage',
    'billing.read',
    'billing.manage',
    'sre.read',
    'sre.manage',
    'repair.execute',
    'repair.approve',
    'repair.auto_repair',
    'repository.manage',
    'audit.read',
    'audit.export',
    'compliance.read',
    'compliance.export',
    'governance.manage',
    'policy.manage'
  ],
  ADMIN: [
    'organization.read',
    'organization.update',
    'organization.manage',
    'members.read',
    'members.manage',
    'workspace.read',
    'workspace.manage',
    'security.read',
    'security.manage',
    'billing.read',
    'billing.manage',
    'sre.read',
    'sre.manage',
    'repair.execute',
    'repair.approve',
    'repair.auto_repair',
    'repository.manage',
    'audit.read',
    'audit.export',
    'compliance.read',
    'compliance.export',
    'governance.manage',
    'policy.manage'
  ],
  SECURITY_ADMIN: [
    'organization.read',
    'members.read',
    'workspace.read',
    'security.read',
    'security.manage',
    'audit.read',
    'audit.export',
    'compliance.read',
    'compliance.export',
    'governance.manage',
    'policy.manage',
    'repair.approve'
  ],
  BILLING_ADMIN: [
    'organization.read',
    'members.read',
    'workspace.read',
    'billing.read',
    'billing.manage',
    'cost.read',
    'cost.manage'
  ],
  SRE_ADMIN: [
    'organization.read',
    'members.read',
    'workspace.read',
    'sre.read',
    'sre.manage',
    'repair.execute',
    'repair.approve',
    'repair.auto_repair',
    'audit.read',
    'compliance.read'
  ],
  DEVELOPER: [
    'organization.read',
    'members.read',
    'workspace.read',
    'repair.execute',
    'repository.manage',
    'sre.read',
    'compliance.read'
  ],
  MEMBER: [
    'organization.read',
    'members.read',
    'workspace.read',
    'repair.execute'
  ],
  VIEWER: [
    'organization.read',
    'members.read',
    'workspace.read',
    'compliance.read'
  ]
};

/**
 * Checks if a role holds a specific permission capability
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  if (!role || !permission) return false;
  const normalizedRole = String(role).toUpperCase();
  const permissions = ROLE_PERMISSIONS[normalizedRole] || [];
  return permissions.includes(permission) || permissions.includes('*');
}

/**
 * Gets all permissions granted to a role
 * @param {string} role
 * @returns {string[]}
 */
function getPermissionsForRole(role) {
  if (!role) return [];
  const normalizedRole = String(role).toUpperCase();
  return ROLE_PERMISSIONS[normalizedRole] || [];
}

/**
 * Gets numerical rank for role
 * @param {string} role
 * @returns {number}
 */
function getRoleRank(role) {
  const normalizedRole = String(role).toUpperCase();
  return ROLE_RANKS[normalizedRole] || 0;
}

/**
 * Checks if user's role rank meets or exceeds required role rank
 * @param {string} userRole
 * @param {string} requiredRole
 * @returns {boolean}
 */
function isRoleAtLeast(userRole, requiredRole) {
  const userRank = getRoleRank(userRole);
  const requiredRank = getRoleRank(requiredRole);
  return userRank >= requiredRank && userRank > 0;
}

module.exports = {
  ROLE_RANKS,
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissionsForRole,
  getRoleRank,
  isRoleAtLeast
};
