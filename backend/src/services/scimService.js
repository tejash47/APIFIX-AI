/**
 * APIFIX AI — SCIM 2.0 Enterprise Provisioning Service
 * 
 * Implements standard SCIM 2.0 endpoints for user and group provisioning,
 * deactivation, role translation, and audit logging.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const userStore = require('./userStore');
const organizationService = require('./organizationService');
const auditLedgerService = require('./auditLedgerService');
const { sanitizeSecrets } = require('./securitySanitizer');

const DATA_DIR = path.resolve(__dirname, '../../data');
const SCIM_GROUPS_FILE = path.join(DATA_DIR, 'scim_groups.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function readGroups() {
  try {
    if (fs.existsSync(SCIM_GROUPS_FILE)) {
      return JSON.parse(fs.readFileSync(SCIM_GROUPS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function writeGroups(groups) {
  try {
    fs.writeFileSync(SCIM_GROUPS_FILE, JSON.stringify(groups, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Format user into standard SCIM 2.0 User Resource Schema
 */
function formatScimUser(user, organizationId = 'org_enterprise_primary') {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    userName: user.email,
    name: {
      formatted: user.name || user.email.split('@')[0],
      familyName: user.name ? user.name.split(' ').slice(1).join(' ') : '',
      givenName: user.name ? user.name.split(' ')[0] : user.email.split('@')[0]
    },
    emails: [
      {
        value: user.email,
        type: 'work',
        primary: true
      }
    ],
    active: user.active !== false,
    roles: [
      {
        value: String(user.role || 'MEMBER').toUpperCase(),
        primary: true
      }
    ],
    meta: {
      resourceType: 'User',
      created: user.createdAt || new Date().toISOString(),
      lastModified: user.updatedAt || new Date().toISOString(),
      location: `/scim/v2/Users/${user.id}`
    }
  };
}

/**
 * Format group into standard SCIM 2.0 Group Resource Schema
 */
function formatScimGroup(group) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: group.id,
    displayName: group.displayName,
    members: (group.members || []).map(m => ({
      value: m.userId || m.value,
      display: m.display || m.userName,
      $ref: `/scim/v2/Users/${m.userId || m.value}`
    })),
    meta: {
      resourceType: 'Group',
      created: group.createdAt || new Date().toISOString(),
      lastModified: group.updatedAt || new Date().toISOString(),
      location: `/scim/v2/Groups/${group.id}`
    }
  };
}

/**
 * List SCIM Users
 */
function listScimUsers({ startIndex = 1, count = 100, filter = null, organizationId = 'org_enterprise_primary' }) {
  let allUsers = userStore.getAllUsers();

  if (filter && typeof filter === 'string') {
    const match = filter.match(/userName eq "([^"]+)"/i) || filter.match(/emails\.value eq "([^"]+)"/i);
    if (match && match[1]) {
      const email = match[1].toLowerCase();
      allUsers = allUsers.filter(u => u.email.toLowerCase() === email);
    }
  }

  const start = Math.max(0, parseInt(startIndex, 10) - 1);
  const limit = Math.min(100, parseInt(count, 10));
  const paged = allUsers.slice(start, start + limit);

  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: allUsers.length,
    startIndex: start + 1,
    itemsPerPage: paged.length,
    Resources: paged.map(u => formatScimUser(u, organizationId))
  };
}

/**
 * Get SCIM User by ID
 */
function getScimUser(id, organizationId) {
  const user = userStore.findUserById(id);
  if (!user) return null;
  return formatScimUser(user, organizationId);
}

/**
 * Create SCIM User
 */
async function createScimUser(scimPayload, organizationId = 'org_enterprise_primary', actor = {}) {
  const email = (scimPayload.userName || (scimPayload.emails && scimPayload.emails[0]?.value) || '').trim().toLowerCase();
  if (!email) throw new Error('SCIM userName or primary email is required.');

  const existing = userStore.findUserByEmail(email);
  if (existing) {
    throw new Error(`User with email ${email} already exists.`);
  }

  const displayName = (scimPayload.name && scimPayload.name.formatted) ||
                      (scimPayload.name && `${scimPayload.name.givenName || ''} ${scimPayload.name.familyName || ''}`.trim()) ||
                      email.split('@')[0];

  const role = (scimPayload.roles && scimPayload.roles[0]?.value) || 'MEMBER';

  const newUser = userStore.createUser({
    id: `usr_scim_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    email,
    name: displayName,
    password: crypto.randomBytes(32).toString('hex'),
    role: role.toLowerCase()
  });

  try {
    await organizationService.addMember(organizationId, {
      userId: newUser.id,
      userEmail: newUser.email,
      userName: newUser.name,
      role: role.toUpperCase()
    });
  } catch (e) {}

  try {
    await auditLedgerService.recordEvent({
      organizationId,
      workspaceId: 'ws_system',
      action: 'SCIM_USER_PROVISIONED',
      actorId: actor.id || 'usr_scim_client',
      actorEmail: actor.email || 'scim@idp.local',
      resourceType: 'SCIM_USER',
      resourceId: newUser.id,
      metadata: { email: newUser.email, role: newUser.role }
    });
  } catch (e) {}

  return formatScimUser(newUser, organizationId);
}

/**
 * Update SCIM User
 */
async function updateScimUser(id, updates, organizationId = 'org_enterprise_primary', actor = {}) {
  const user = userStore.findUserById(id);
  if (!user) throw new Error(`User ${id} not found.`);

  if (updates.active === false) {
    user.active = false;
  } else if (updates.active === true) {
    user.active = true;
  }

  if (updates.name) {
    user.name = updates.name.formatted || `${updates.name.givenName || ''} ${updates.name.familyName || ''}`.trim();
  }

  if (updates.roles && updates.roles[0]?.value) {
    user.role = updates.roles[0].value.toLowerCase();
  }

  try {
    await auditLedgerService.recordEvent({
      organizationId,
      workspaceId: 'ws_system',
      action: 'SCIM_USER_UPDATED',
      actorId: actor.id || 'usr_scim_client',
      actorEmail: actor.email || 'scim@idp.local',
      resourceType: 'SCIM_USER',
      resourceId: user.id,
      metadata: { active: user.active, role: user.role }
    });
  } catch (e) {}

  return formatScimUser(user, organizationId);
}

/**
 * Delete / Deactivate SCIM User
 */
async function deleteScimUser(id, organizationId = 'org_enterprise_primary', actor = {}) {
  const user = userStore.findUserById(id);
  if (!user) throw new Error(`User ${id} not found.`);

  user.active = false;

  try {
    await auditLedgerService.recordEvent({
      organizationId,
      workspaceId: 'ws_system',
      action: 'SCIM_USER_DEACTIVATED',
      actorId: actor.id || 'usr_scim_client',
      actorEmail: actor.email || 'scim@idp.local',
      resourceType: 'SCIM_USER',
      resourceId: id,
      metadata: { email: user.email }
    });
  } catch (e) {}

  return { success: true, id };
}

/**
 * List SCIM Groups
 */
function listScimGroups({ organizationId = 'org_enterprise_primary' }) {
  const groups = readGroups().filter(g => g.organizationId === organizationId);
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: groups.length,
    startIndex: 1,
    itemsPerPage: groups.length,
    Resources: groups.map(formatScimGroup)
  };
}

/**
 * Get SCIM Group by ID
 */
function getScimGroup(id, organizationId) {
  const groups = readGroups();
  const found = groups.find(g => g.id === id && (!organizationId || g.organizationId === organizationId));
  return found ? formatScimGroup(found) : null;
}

/**
 * Create SCIM Group
 */
async function createScimGroup({ displayName, members = [] }, organizationId = 'org_enterprise_primary', actor = {}) {
  if (!displayName || !displayName.trim()) throw new Error('displayName is required for SCIM group.');

  const groups = readGroups();
  const newGroup = {
    id: `grp_scim_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    displayName: displayName.trim(),
    organizationId,
    members: members.map(m => ({ userId: m.value, display: m.display })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  groups.push(newGroup);
  writeGroups(groups);

  try {
    await auditLedgerService.recordEvent({
      organizationId,
      workspaceId: 'ws_system',
      action: 'SCIM_GROUP_CREATED',
      actorId: actor.id || 'usr_scim_client',
      actorEmail: actor.email || 'scim@idp.local',
      resourceType: 'SCIM_GROUP',
      resourceId: newGroup.id,
      metadata: { displayName: newGroup.displayName, memberCount: newGroup.members.length }
    });
  } catch (e) {}

  return formatScimGroup(newGroup);
}

module.exports = {
  formatScimUser,
  formatScimGroup,
  listScimUsers,
  getScimUser,
  createScimUser,
  updateScimUser,
  deleteScimUser,
  listScimGroups,
  getScimGroup,
  createScimGroup
};
