/**
 * APIFIX AI — Organization Governance Service (Phase 20)
 * Enterprise-grade multi-tenant organization control plane, workspace scoping,
 * membership administration, policy inheritance, and aggregated telemetry.
 */

const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const { recordAuditEvent } = require('./auditLogger');
const logger = require('./logger');

const DATA_DIR = path.resolve(__dirname, '../../data');
const ORGS_FILE = path.join(DATA_DIR, 'organizations.json');
const ORG_MEMBERS_FILE = path.join(DATA_DIR, 'organization_members.json');
const ORG_WORKSPACES_FILE = path.join(DATA_DIR, 'organization_workspaces.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function readJson(file, def = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`[OrganizationService] Read error for ${file}:`, e.message);
  }
  return def;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[OrganizationService] Write error for ${file}:`, e.message);
  }
}

// Seed default enterprise organization
function initializeSeedOrganizations() {
  const orgs = readJson(ORGS_FILE, []);
  if (orgs.length === 0) {
    const seedOrgs = [
      {
        id: 'org_enterprise_primary',
        name: 'Enterprise Global Corp',
        slug: 'enterprise-global-corp',
        ownerId: 'usr_admin_01',
        ownerEmail: 'admin@apifix.ai',
        status: 'ACTIVE',
        settings: {
          enforceSso: false,
          allowedEmailDomains: ['apifix.ai', 'alpha-corp.io'],
          defaultAiProvider: 'groq',
          requireTwoReviewersForProd: true,
          dataRetentionDays: 90
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'org_demo_primary',
        name: 'Dev & Engineering Corp',
        slug: 'dev-engineering-corp',
        ownerId: 'usr_demo_01',
        ownerEmail: 'dev@apifix.ai',
        status: 'ACTIVE',
        settings: {
          enforceSso: false,
          allowedEmailDomains: ['apifix.ai'],
          defaultAiProvider: 'groq',
          requireTwoReviewersForProd: false,
          dataRetentionDays: 30
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    writeJson(ORGS_FILE, seedOrgs);

    const seedMembers = [
      {
        id: 'orgm_admin_01',
        organizationId: 'org_enterprise_primary',
        userId: 'usr_admin_01',
        userEmail: 'admin@apifix.ai',
        userName: 'System Administrator',
        role: 'OWNER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'orgm_demo_01',
        organizationId: 'org_demo_primary',
        userId: 'usr_demo_01',
        userEmail: 'dev@apifix.ai',
        userName: 'Lead Reliability Engineer',
        role: 'OWNER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    writeJson(ORG_MEMBERS_FILE, seedMembers);

    const seedWorkspaces = [
      {
        id: 'ow_admin_01',
        organizationId: 'org_enterprise_primary',
        workspaceId: 'ws_admin_primary',
        createdAt: new Date().toISOString()
      },
      {
        id: 'ow_demo_01',
        organizationId: 'org_demo_primary',
        workspaceId: 'ws_demo_primary',
        createdAt: new Date().toISOString()
      }
    ];
    writeJson(ORG_WORKSPACES_FILE, seedWorkspaces);
  }
}

initializeSeedOrganizations();

/**
 * Creates a new organization
 */
async function createOrganization({ name, slug, ownerId, ownerEmail, settings = {} }) {
  if (!name || !name.trim()) {
    throw new Error('Organization name is required.');
  }

  const generatedSlug = slug
    ? slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    : name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const orgId = `org_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();

  const org = {
    id: orgId,
    name: name.trim(),
    slug: generatedSlug,
    ownerId: ownerId || 'usr_anonymous',
    ownerEmail: ownerEmail || 'dev@apifix.ai',
    status: 'ACTIVE',
    settings: {
      enforceSso: false,
      allowedEmailDomains: [],
      defaultAiProvider: 'groq',
      requireTwoReviewersForProd: true,
      dataRetentionDays: 90,
      ...settings
    },
    createdAt: now,
    updatedAt: now
  };

  const member = {
    id: `orgm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    organizationId: orgId,
    userId: ownerId || 'usr_anonymous',
    userEmail: ownerEmail || 'dev@apifix.ai',
    userName: name.trim(),
    role: 'OWNER',
    createdAt: now,
    updatedAt: now
  };

  const orgs = readJson(ORGS_FILE, []);
  orgs.unshift(org);
  writeJson(ORGS_FILE, orgs);

  const members = readJson(ORG_MEMBERS_FILE, []);
  members.unshift(member);
  writeJson(ORG_MEMBERS_FILE, members);

  await recordAuditEvent({
    workspaceId: 'org_global',
    actorId: ownerId,
    actorEmail: ownerEmail,
    action: 'ORGANIZATION_CREATED',
    resourceType: 'ORGANIZATION',
    resourceId: org.id,
    metadata: { orgName: org.name, slug: org.slug }
  });

  return { ...org, role: 'OWNER' };
}

/**
 * Retrieves organization by ID
 */
async function getOrganizationById(orgId) {
  if (!orgId) return null;
  const orgs = readJson(ORGS_FILE, []);
  return orgs.find(o => o.id === orgId) || null;
}

/**
 * Updates organization metadata or settings
 */
async function updateOrganization(orgId, updates = {}, actor = {}) {
  const orgs = readJson(ORGS_FILE, []);
  const index = orgs.findIndex(o => o.id === orgId);
  if (index === -1) {
    throw new Error('Organization not found.');
  }

  const existing = orgs[index];
  const updated = {
    ...existing,
    name: updates.name ? updates.name.trim() : existing.name,
    slug: updates.slug ? updates.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : existing.slug,
    status: updates.status || existing.status,
    settings: {
      ...existing.settings,
      ...(updates.settings || {})
    },
    updatedAt: new Date().toISOString()
  };

  orgs[index] = updated;
  writeJson(ORGS_FILE, orgs);

  await recordAuditEvent({
    workspaceId: 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'ORGANIZATION_UPDATED',
    resourceType: 'ORGANIZATION',
    resourceId: orgId,
    metadata: { updates }
  });

  return updated;
}

/**
 * Lists all organizations accessible by a user
 */
async function listUserOrganizations(userId, userEmail) {
  const members = readJson(ORG_MEMBERS_FILE, []);
  const orgs = readJson(ORGS_FILE, []);

  // System admin gets all orgs
  if (userEmail === 'admin@apifix.ai') {
    return orgs.map(org => {
      const mem = members.find(m => m.organizationId === org.id && (m.userId === userId || m.userEmail === userEmail));
      return {
        ...org,
        role: mem ? mem.role : 'OWNER',
        isSystemAdmin: true
      };
    });
  }

  const userMemberships = members.filter(
    m => (userId && m.userId === userId) || (userEmail && m.userEmail.toLowerCase() === userEmail.toLowerCase())
  );

  const accessibleOrgIds = new Set(userMemberships.map(m => m.organizationId));
  return orgs
    .filter(o => accessibleOrgIds.has(o.id))
    .map(o => {
      const mem = userMemberships.find(m => m.organizationId === o.id);
      return {
        ...o,
        role: mem ? mem.role : 'VIEWER'
      };
    });
}

/**
 * Organization Member Management
 */
async function getOrganizationMembers(orgId) {
  const members = readJson(ORG_MEMBERS_FILE, []);
  return members.filter(m => m.organizationId === orgId);
}

async function getOrganizationMember(orgId, userId, userEmail) {
  const members = readJson(ORG_MEMBERS_FILE, []);
  return members.find(
    m => m.organizationId === orgId && (
      (userId && m.userId === userId) ||
      (userEmail && m.userEmail.toLowerCase() === userEmail.toLowerCase())
    )
  ) || null;
}

async function addOrganizationMember(orgId, { userId, userEmail, userName, role = 'MEMBER' }, actor = {}) {
  const org = await getOrganizationById(orgId);
  if (!org) throw new Error('Organization not found.');

  const members = readJson(ORG_MEMBERS_FILE, []);
  const existing = members.find(
    m => m.organizationId === orgId && (
      (userId && m.userId === userId) ||
      (userEmail && m.userEmail.toLowerCase() === userEmail.toLowerCase())
    )
  );

  if (existing) {
    throw new Error('User is already a member of this organization.');
  }

  const newMember = {
    id: `orgm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    organizationId: orgId,
    userId: userId || `usr_${Date.now()}`,
    userEmail: userEmail ? userEmail.trim().toLowerCase() : '',
    userName: userName || userEmail.split('@')[0],
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  members.unshift(newMember);
  writeJson(ORG_MEMBERS_FILE, members);

  await recordAuditEvent({
    workspaceId: 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'ORGANIZATION_MEMBER_ADDED',
    resourceType: 'ORGANIZATION_MEMBER',
    resourceId: newMember.id,
    metadata: { orgId, userEmail, role }
  });

  return newMember;
}

async function updateOrganizationMemberRole(orgId, memberId, newRole, actor = {}) {
  const members = readJson(ORG_MEMBERS_FILE, []);
  const index = members.findIndex(m => m.organizationId === orgId && m.id === memberId);
  if (index === -1) throw new Error('Organization member not found.');

  members[index].role = newRole;
  members[index].updatedAt = new Date().toISOString();
  writeJson(ORG_MEMBERS_FILE, members);

  await recordAuditEvent({
    workspaceId: 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'ORGANIZATION_MEMBER_ROLE_UPDATED',
    resourceType: 'ORGANIZATION_MEMBER',
    resourceId: memberId,
    metadata: { orgId, memberId, newRole }
  });

  return members[index];
}

async function removeOrganizationMember(orgId, memberId, actor = {}) {
  let members = readJson(ORG_MEMBERS_FILE, []);
  const target = members.find(m => m.organizationId === orgId && m.id === memberId);
  if (!target) throw new Error('Organization member not found.');

  members = members.filter(m => !(m.organizationId === orgId && m.id === memberId));
  writeJson(ORG_MEMBERS_FILE, members);

  await recordAuditEvent({
    workspaceId: 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'ORGANIZATION_MEMBER_REMOVED',
    resourceType: 'ORGANIZATION_MEMBER',
    resourceId: memberId,
    metadata: { orgId, memberEmail: target.userEmail }
  });

  return { success: true, removedMemberId: memberId };
}

/**
 * Workspace Organization Scoping & Linking
 */
async function linkWorkspaceToOrganization(orgId, workspaceId, actor = {}) {
  const org = await getOrganizationById(orgId);
  if (!org) throw new Error('Organization not found.');

  const links = readJson(ORG_WORKSPACES_FILE, []);
  const existing = links.find(l => l.workspaceId === workspaceId);
  if (existing) {
    if (existing.organizationId === orgId) return existing;
    throw new Error('Workspace is already linked to another organization.');
  }

  const link = {
    id: `ow_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    organizationId: orgId,
    workspaceId,
    createdAt: new Date().toISOString()
  };

  links.unshift(link);
  writeJson(ORG_WORKSPACES_FILE, links);

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'WORKSPACE_LINKED_TO_ORGANIZATION',
    resourceType: 'ORGANIZATION_WORKSPACE',
    resourceId: link.id,
    metadata: { orgId, workspaceId }
  });

  return link;
}

async function getOrganizationWorkspaces(orgId) {
  const links = readJson(ORG_WORKSPACES_FILE, []);
  const orgLinks = links.filter(l => l.organizationId === orgId);
  const workspaceIds = orgLinks.map(l => l.workspaceId);

  const workspacesFile = path.join(DATA_DIR, 'workspaces.json');
  const allWorkspaces = readJson(workspacesFile, []);
  return allWorkspaces.filter(w => workspaceIds.includes(w.id));
}

async function getOrganizationForWorkspace(workspaceId) {
  const links = readJson(ORG_WORKSPACES_FILE, []);
  const link = links.find(l => l.workspaceId === workspaceId);
  if (!link) return null;
  return getOrganizationById(link.organizationId);
}

/**
 * Aggregated Usage & Billing Metrics across Organization Workspaces
 */
async function getOrganizationUsage(orgId) {
  const workspaces = await getOrganizationWorkspaces(orgId);
  const totalWorkspaces = workspaces.length;
  let totalCredits = 0;
  let activePlans = {};

  workspaces.forEach(w => {
    totalCredits += (w.credits || 0);
    activePlans[w.plan || 'free'] = (activePlans[w.plan || 'free'] || 0) + 1;
  });

  const members = await getOrganizationMembers(orgId);

  return {
    organizationId: orgId,
    totalWorkspaces,
    totalMembers: members.length,
    totalCredits,
    activePlans,
    lastCalculatedAt: new Date().toISOString()
  };
}

module.exports = {
  createOrganization,
  getOrganizationById,
  updateOrganization,
  listUserOrganizations,
  getOrganizationMembers,
  getOrganizationMember,
  addOrganizationMember,
  updateOrganizationMemberRole,
  removeOrganizationMember,
  linkWorkspaceToOrganization,
  getOrganizationWorkspaces,
  getOrganizationForWorkspace,
  getOrganizationUsage,
  _readJson: readJson,
  _writeJson: writeJson
};
