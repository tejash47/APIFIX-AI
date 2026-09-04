const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const { recordAuditEvent } = require('./auditLogger');

const DATA_DIR = path.resolve(__dirname, '../../data');
const WORKSPACES_FILE = path.join(DATA_DIR, 'workspaces.json');
const MEMBERS_FILE = path.join(DATA_DIR, 'workspace_members.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'workspace_settings.json');
const REPOS_FILE = path.join(DATA_DIR, 'repositories.json');
const REPAIR_RUNS_FILE = path.join(DATA_DIR, 'repair_runs.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

// Helper readers and writers for local JSON persistence
function readJson(file, def = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`[WorkspaceService] Read error for ${file}:`, e.message);
  }
  return def;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[WorkspaceService] Write error for ${file}:`, e.message);
  }
}

// Seed initial default workspaces for admin & demo users if empty
function initializeSeedData() {
  const workspaces = readJson(WORKSPACES_FILE, []);
  if (workspaces.length === 0) {
    const seedWorkspaces = [
      {
        id: 'ws_admin_primary',
        name: 'Enterprise Core Workspace',
        ownerId: 'usr_admin_01',
        plan: 'enterprise',
        subscriptionStatus: 'active',
        credits: 500,
        stripeCustomerId: 'cus_admin_primary',
        stripeSubscriptionId: 'sub_admin_primary',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'ws_demo_primary',
        name: 'Primary Dev Workspace',
        ownerId: 'usr_demo_01',
        plan: 'pro',
        subscriptionStatus: 'active',
        credits: 100,
        stripeCustomerId: 'cus_demo_primary',
        stripeSubscriptionId: 'sub_demo_primary',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    writeJson(WORKSPACES_FILE, seedWorkspaces);

    const seedMembers = [
      {
        id: 'wsm_admin_01',
        workspaceId: 'ws_admin_primary',
        userId: 'usr_admin_01',
        userEmail: 'admin@apifix.ai',
        userName: 'System Administrator',
        role: 'OWNER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'wsm_demo_01',
        workspaceId: 'ws_demo_primary',
        userId: 'usr_demo_01',
        userEmail: 'dev@apifix.ai',
        userName: 'Lead Reliability Engineer',
        role: 'OWNER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    writeJson(MEMBERS_FILE, seedMembers);

    const seedSettings = [
      {
        workspaceId: 'ws_admin_primary',
        defaultAiProvider: 'groq',
        approvalRequired: true,
        maxConcurrentRepairs: 5,
        notificationPreferences: { email: true, slack: false },
        securityPreferences: { blockEnvInArtifacts: true, strictSandbox: true },
        updatedAt: new Date().toISOString()
      },
      {
        workspaceId: 'ws_demo_primary',
        defaultAiProvider: 'groq',
        approvalRequired: true,
        maxConcurrentRepairs: 3,
        notificationPreferences: { email: true, slack: false },
        securityPreferences: { blockEnvInArtifacts: true, strictSandbox: true },
        updatedAt: new Date().toISOString()
      }
    ];
    writeJson(SETTINGS_FILE, seedSettings);
  }
}

initializeSeedData();

// ==========================================
// WORKSPACE CRUD
// ==========================================

/**
 * Creates a new workspace and sets the owner member
 */
async function createWorkspace({ name, ownerId, ownerEmail, ownerName }) {
  if (!name || !name.trim()) {
    throw new Error('Workspace name is required.');
  }

  const workspace = {
    id: `ws_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: name.trim(),
    ownerId: ownerId || 'usr_anonymous',
    plan: 'free',
    subscriptionStatus: 'active',
    credits: 10,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const member = {
    id: `wsm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    workspaceId: workspace.id,
    userId: ownerId || 'usr_anonymous',
    userEmail: ownerEmail || 'dev@apifix.ai',
    userName: ownerName || name.trim(),
    role: 'OWNER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const defaultSettings = {
    workspaceId: workspace.id,
    defaultAiProvider: 'groq',
    approvalRequired: true,
    maxConcurrentRepairs: 3,
    notificationPreferences: { email: true, slack: false },
    securityPreferences: { blockEnvInArtifacts: true, strictSandbox: true },
    updatedAt: new Date().toISOString()
  };

  // Disk fallback save
  const workspaces = readJson(WORKSPACES_FILE, []);
  workspaces.unshift(workspace);
  writeJson(WORKSPACES_FILE, workspaces);

  const members = readJson(MEMBERS_FILE, []);
  members.unshift(member);
  writeJson(MEMBERS_FILE, members);

  const settings = readJson(SETTINGS_FILE, []);
  settings.unshift(defaultSettings);
  writeJson(SETTINGS_FILE, settings);

  // Supabase save
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('workspaces').insert({
        id: workspace.id,
        name: workspace.name,
        owner_id: workspace.ownerId,
        plan: workspace.plan,
        subscription_status: workspace.subscriptionStatus,
        credits: workspace.credits,
        stripe_customer_id: workspace.stripeCustomerId,
        stripe_subscription_id: workspace.stripeSubscriptionId,
        created_at: workspace.createdAt,
        updated_at: workspace.updatedAt
      });
      await supabase.from('workspace_members').insert({
        id: member.id,
        workspace_id: member.workspaceId,
        user_id: member.userId,
        user_email: member.userEmail,
        user_name: member.userName,
        role: member.role,
        created_at: member.createdAt,
        updated_at: member.updatedAt
      });
      await supabase.from('workspace_settings').insert({
        workspace_id: defaultSettings.workspaceId,
        default_ai_provider: defaultSettings.defaultAiProvider,
        approval_required: defaultSettings.approvalRequired,
        max_concurrent_repairs: defaultSettings.maxConcurrentRepairs,
        notification_preferences: defaultSettings.notificationPreferences,
        security_preferences: defaultSettings.securityPreferences,
        updated_at: defaultSettings.updatedAt
      });
    } catch (err) {
      console.warn('[WorkspaceService] Supabase workspace insert warning:', err.message);
    }
  }

  // Record audit log
  await recordAuditEvent({
    workspaceId: workspace.id,
    actorId: ownerId,
    actorEmail: ownerEmail,
    action: 'WORKSPACE_CREATED',
    resourceType: 'WORKSPACE',
    resourceId: workspace.id,
    metadata: { workspaceName: workspace.name }
  });

  return { ...workspace, role: 'OWNER', settings: defaultSettings };
}

/**
 * Retrieves workspace by ID
 */
async function getWorkspaceById(workspaceId) {
  if (!workspaceId) return null;

  // Check disk first for instant response
  const workspaces = readJson(WORKSPACES_FILE, []);
  const found = workspaces.find(w => w.id === workspaceId);
  if (found) {
    const settingsList = readJson(SETTINGS_FILE, []);
    const settings = settingsList.find(s => s.workspaceId === workspaceId) || null;
    return {
      ...found,
      plan: found.plan || 'free',
      subscriptionStatus: found.subscriptionStatus || 'active',
      credits: found.credits !== undefined && found.credits !== null ? Number(found.credits) : 10,
      stripeCustomerId: found.stripeCustomerId || null,
      stripeSubscriptionId: found.stripeSubscriptionId || null,
      currentPeriodStart: found.currentPeriodStart || null,
      currentPeriodEnd: found.currentPeriodEnd || null,
      cancelAtPeriodEnd: !!found.cancelAtPeriodEnd,
      settings
    };
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .maybeSingle();

      if (!error && data) {
        const { data: setts } = await supabase
          .from('workspace_settings')
          .select('*')
          .eq('workspace_id', workspaceId)
          .maybeSingle();

        return {
          id: data.id,
          name: data.name,
          ownerId: data.owner_id,
          plan: data.plan || 'free',
          subscriptionStatus: data.subscription_status || 'active',
          credits: data.credits !== undefined && data.credits !== null ? Number(data.credits) : 10,
          stripeCustomerId: data.stripe_customer_id || null,
          stripeSubscriptionId: data.stripe_subscription_id || null,
          currentPeriodStart: data.current_period_start || null,
          currentPeriodEnd: data.current_period_end || null,
          cancelAtPeriodEnd: !!data.cancel_at_period_end,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          settings: setts ? {
            defaultAiProvider: setts.default_ai_provider,
            approvalRequired: setts.approval_required,
            maxConcurrentRepairs: setts.max_concurrent_repairs,
            notificationPreferences: setts.notification_preferences,
            securityPreferences: setts.security_preferences
          } : null
        };
      }
    } catch (err) {
      console.warn('[WorkspaceService] Supabase getWorkspace error:', err.message);
    }
  }

  return null;
}

/**
 * List all workspaces accessible to a user
 */
async function listUserWorkspaces(userId, userEmail) {
  // Check disk first
  const members = readJson(MEMBERS_FILE, []);
  const userMemberships = members.filter(
    m => m.userId === userId || (userEmail && m.userEmail?.toLowerCase() === userEmail.toLowerCase())
  );

  if (userMemberships.length > 0) {
    const workspaces = readJson(WORKSPACES_FILE, []);
    return userMemberships
      .map(m => {
        const ws = workspaces.find(w => w.id === m.workspaceId);
        if (!ws) return null;
        return {
          id: ws.id,
          name: ws.name,
          ownerId: ws.ownerId,
          role: m.role,
          plan: ws.plan || 'free',
          subscriptionStatus: ws.subscriptionStatus || 'active',
          credits: ws.credits !== undefined && ws.credits !== null ? Number(ws.credits) : 10,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt
        };
      })
      .filter(Boolean);
  }

  if (isSupabaseConfigured()) {
    try {
      // Find all memberships for this user
      const { data: memberRecords } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .or(`user_id.eq.${userId},user_email.eq.${userEmail || ''}`);

      if (memberRecords && memberRecords.length > 0) {
        const wsIds = memberRecords.map(m => m.workspace_id);
        const { data: wsList } = await supabase
          .from('workspaces')
          .select('*')
          .in('id', wsIds);

        if (wsList) {
          return wsList.map(w => {
            const m = memberRecords.find(mr => mr.workspace_id === w.id);
            return {
              id: w.id,
              name: w.name,
              ownerId: w.owner_id,
              role: m ? m.role : 'MEMBER',
              plan: w.plan || 'free',
              subscriptionStatus: w.subscription_status || 'active',
              credits: w.credits !== undefined && w.credits !== null ? Number(w.credits) : 10,
              createdAt: w.created_at,
              updatedAt: w.updated_at
            };
          });
        }
      }
    } catch (err) {
      console.warn('[WorkspaceService] Supabase listUserWorkspaces error:', err.message);
    }
  }

  return [];
}

/**
 * Update workspace name or settings
 */
async function updateWorkspace(workspaceId, { name, settings: newSettings }, actor = {}) {
  const ws = await getWorkspaceById(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const now = new Date().toISOString();

  // Update workspace name if provided
  if (name && name.trim()) {
    ws.name = name.trim();
    ws.updatedAt = now;

    const workspaces = readJson(WORKSPACES_FILE, []);
    const idx = workspaces.findIndex(w => w.id === workspaceId);
    if (idx !== -1) {
      workspaces[idx].name = ws.name;
      workspaces[idx].updatedAt = now;
      writeJson(WORKSPACES_FILE, workspaces);
    }

    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('workspaces')
          .update({ name: ws.name, updated_at: now })
          .eq('id', workspaceId);
      } catch (e) {}
    }
  }

  // Update settings if provided
  if (newSettings && typeof newSettings === 'object') {
    const currentSettingsList = readJson(SETTINGS_FILE, []);
    let sIdx = currentSettingsList.findIndex(s => s.workspaceId === workspaceId);
    const existing = sIdx !== -1 ? currentSettingsList[sIdx] : { workspaceId };

    const updatedSettings = {
      ...existing,
      ...newSettings,
      workspaceId,
      updatedAt: now
    };

    if (sIdx !== -1) {
      currentSettingsList[sIdx] = updatedSettings;
    } else {
      currentSettingsList.push(updatedSettings);
    }
    writeJson(SETTINGS_FILE, currentSettingsList);

    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('workspace_settings')
          .upsert({
            workspace_id: workspaceId,
            default_ai_provider: updatedSettings.defaultAiProvider,
            approval_required: updatedSettings.approvalRequired,
            max_concurrent_repairs: updatedSettings.maxConcurrentRepairs,
            notification_preferences: updatedSettings.notificationPreferences,
            security_preferences: updatedSettings.securityPreferences,
            updated_at: now
          });
      } catch (e) {}
    }

    ws.settings = updatedSettings;
  }

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'anonymous',
    actorEmail: actor.email || '',
    action: 'SETTINGS_CHANGED',
    resourceType: 'WORKSPACE',
    resourceId: workspaceId,
    metadata: { name: ws.name, settings: newSettings }
  });

  return ws;
}

/**
 * Delete workspace (Owner only)
 */
async function deleteWorkspace(workspaceId, actor = {}) {
  const ws = await getWorkspaceById(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  // Disk removal
  const workspaces = readJson(WORKSPACES_FILE, []).filter(w => w.id !== workspaceId);
  writeJson(WORKSPACES_FILE, workspaces);

  const members = readJson(MEMBERS_FILE, []).filter(m => m.workspaceId !== workspaceId);
  writeJson(MEMBERS_FILE, members);

  const settings = readJson(SETTINGS_FILE, []).filter(s => s.workspaceId !== workspaceId);
  writeJson(SETTINGS_FILE, settings);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('workspaces').delete().eq('id', workspaceId);
    } catch (e) {}
  }

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'anonymous',
    actorEmail: actor.email || '',
    action: 'WORKSPACE_DELETED',
    resourceType: 'WORKSPACE',
    resourceId: workspaceId,
    metadata: { workspaceName: ws.name }
  });

  return { success: true, deletedWorkspaceId: workspaceId };
}

/**
 * Ensures user has at least one default workspace; auto-creates if missing
 */
async function ensureDefaultWorkspace(user) {
  if (!user || !user.id) return null;
  const userWorkspaces = await listUserWorkspaces(user.id, user.email);
  if (userWorkspaces.length > 0) {
    return userWorkspaces[0];
  }

  const name = user.name ? `${user.name}'s Workspace` : `${user.email?.split('@')[0]}'s Workspace`;
  return await createWorkspace({
    name,
    ownerId: user.id,
    ownerEmail: user.email,
    ownerName: user.name
  });
}

// ==========================================
// WORKSPACE MEMBERS & RBAC
// ==========================================

async function getMembers(workspaceId) {
  const members = readJson(MEMBERS_FILE, []);
  const diskMatches = members.filter(m => m.workspaceId === workspaceId);
  if (diskMatches.length > 0) {
    return diskMatches;
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (!error && data && data.length > 0) {
        return data.map(d => ({
          id: d.id,
          workspaceId: d.workspace_id,
          userId: d.user_id,
          userEmail: d.user_email,
          userName: d.user_name,
          role: d.role,
          createdAt: d.created_at,
          updatedAt: d.updated_at
        }));
      }
    } catch (e) {}
  }

  return [];
}

async function getMember(workspaceId, userId) {
  if (!workspaceId || !userId) return null;
  const allMembers = await getMembers(workspaceId);
  return allMembers.find(m => m.userId === userId) || null;
}

async function addMember(workspaceId, { userId, userEmail, userName, role = 'MEMBER' }, actor = {}) {
  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  if (!normalizedEmail && !userId) {
    throw new Error('User email or ID is required to add member.');
  }

  const existingMembers = await getMembers(workspaceId);
  const alreadyMember = existingMembers.find(
    m => (userId && m.userId === userId) || (normalizedEmail && m.userEmail?.toLowerCase() === normalizedEmail)
  );

  if (alreadyMember) {
    throw new Error('User is already a member of this workspace.');
  }

  const validRoles = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
  const assignedRole = validRoles.includes(role) ? role : 'MEMBER';

  const member = {
    id: `wsm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    workspaceId,
    userId: userId || `usr_${Date.now()}`,
    userEmail: normalizedEmail,
    userName: userName || normalizedEmail.split('@')[0],
    role: assignedRole,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const members = readJson(MEMBERS_FILE, []);
  members.push(member);
  writeJson(MEMBERS_FILE, members);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('workspace_members').insert({
        id: member.id,
        workspace_id: member.workspaceId,
        user_id: member.userId,
        user_email: member.userEmail,
        user_name: member.userName,
        role: member.role,
        created_at: member.createdAt,
        updated_at: member.updatedAt
      });
    } catch (e) {}
  }

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'anonymous',
    actorEmail: actor.email || '',
    action: 'MEMBER_ADDED',
    resourceType: 'MEMBER',
    resourceId: member.id,
    metadata: { addedEmail: member.userEmail, role: member.role }
  });

  return member;
}

async function updateMemberRole(workspaceId, memberId, newRole, actor = {}) {
  const validRoles = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
  if (!validRoles.includes(newRole)) {
    throw new Error(`Invalid role. Valid roles are: ${validRoles.join(', ')}`);
  }

  const members = readJson(MEMBERS_FILE, []);
  const memberIdx = members.findIndex(m => m.workspaceId === workspaceId && (m.id === memberId || m.userId === memberId));
  if (memberIdx === -1) {
    throw new Error('Member not found in this workspace.');
  }

  const targetMember = members[memberIdx];

  // Prevent demoting the last OWNER
  if (targetMember.role === 'OWNER' && newRole !== 'OWNER') {
    const ownerCount = members.filter(m => m.workspaceId === workspaceId && m.role === 'OWNER').length;
    if (ownerCount <= 1) {
      throw new Error('Cannot demote the only OWNER of a workspace.');
    }
  }

  const previousRole = targetMember.role;
  targetMember.role = newRole;
  targetMember.updatedAt = new Date().toISOString();
  members[memberIdx] = targetMember;
  writeJson(MEMBERS_FILE, members);

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('workspace_members')
        .update({ role: newRole, updated_at: targetMember.updatedAt })
        .eq('id', targetMember.id);
    } catch (e) {}
  }

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'anonymous',
    actorEmail: actor.email || '',
    action: 'ROLE_CHANGED',
    resourceType: 'MEMBER',
    resourceId: targetMember.id,
    metadata: { memberEmail: targetMember.userEmail, previousRole, newRole }
  });

  return targetMember;
}

async function removeMember(workspaceId, memberId, actor = {}) {
  const members = readJson(MEMBERS_FILE, []);
  const targetMember = members.find(m => m.workspaceId === workspaceId && (m.id === memberId || m.userId === memberId));
  if (!targetMember) {
    throw new Error('Member not found in this workspace.');
  }

  // Prevent removing the last OWNER
  if (targetMember.role === 'OWNER') {
    const ownerCount = members.filter(m => m.workspaceId === workspaceId && m.role === 'OWNER').length;
    if (ownerCount <= 1) {
      throw new Error('Cannot remove the only OWNER of a workspace.');
    }
  }

  const updatedMembers = members.filter(m => m.id !== targetMember.id);
  writeJson(MEMBERS_FILE, updatedMembers);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('workspace_members').delete().eq('id', targetMember.id);
    } catch (e) {}
  }

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'anonymous',
    actorEmail: actor.email || '',
    action: 'MEMBER_REMOVED',
    resourceType: 'MEMBER',
    resourceId: targetMember.id,
    metadata: { removedEmail: targetMember.userEmail, role: targetMember.role }
  });

  return { success: true, removedMemberId: targetMember.id };
}

// ==========================================
// REPOSITORIES
// ==========================================

async function createRepository(workspaceId, { name, provider = 'github', repositoryUrl, defaultBranch = 'main' }, actor = {}) {
  if (!name || !repositoryUrl) {
    throw new Error('Repository name and repository URL are required.');
  }

  const repo = {
    id: `repo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    workspaceId,
    name: name.trim(),
    provider,
    repositoryUrl: repositoryUrl.trim(),
    defaultBranch: defaultBranch.trim(),
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const repos = readJson(REPOS_FILE, []);
  repos.unshift(repo);
  writeJson(REPOS_FILE, repos);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('repositories').insert({
        id: repo.id,
        workspace_id: repo.workspaceId,
        name: repo.name,
        provider: repo.provider,
        repository_url: repo.repositoryUrl,
        default_branch: repo.defaultBranch,
        status: repo.status,
        created_at: repo.createdAt,
        updated_at: repo.updatedAt
      });
    } catch (e) {}
  }

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'anonymous',
    actorEmail: actor.email || '',
    action: 'REPOSITORY_ADDED',
    resourceType: 'REPOSITORY',
    resourceId: repo.id,
    metadata: { name: repo.name, url: repo.repositoryUrl }
  });

  return repo;
}

async function listRepositories(workspaceId, { page = 1, limit = 20, search } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('repositories')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId);

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + safeLimit - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        return {
          items: data.map(d => ({
            id: d.id,
            workspaceId: d.workspace_id,
            name: d.name,
            provider: d.provider,
            repositoryUrl: d.repository_url,
            defaultBranch: d.default_branch,
            status: d.status,
            createdAt: d.created_at,
            updatedAt: d.updated_at
          })),
          total: count || 0,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil((count || 0) / safeLimit) || 1
        };
      }
    } catch (e) {}
  }

  let repos = readJson(REPOS_FILE, []).filter(r => r.workspaceId === workspaceId);
  if (search) {
    const s = search.toLowerCase();
    repos = repos.filter(r => r.name.toLowerCase().includes(s) || r.repositoryUrl.toLowerCase().includes(s));
  }

  const total = repos.length;
  const items = repos.slice(offset, offset + safeLimit);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1
  };
}

async function getRepository(workspaceId, repoId) {
  const repos = readJson(REPOS_FILE, []);
  return repos.find(r => r.workspaceId === workspaceId && r.id === repoId) || null;
}

async function deleteRepository(workspaceId, repoId, actor = {}) {
  const repos = readJson(REPOS_FILE, []);
  const target = repos.find(r => r.workspaceId === workspaceId && r.id === repoId);
  if (!target) throw new Error('Repository not found in this workspace.');

  const updated = repos.filter(r => r.id !== repoId);
  writeJson(REPOS_FILE, updated);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('repositories').delete().eq('id', repoId);
    } catch (e) {}
  }

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'anonymous',
    actorEmail: actor.email || '',
    action: 'REPOSITORY_REMOVED',
    resourceType: 'REPOSITORY',
    resourceId: repoId,
    metadata: { name: target.name }
  });

  return { success: true, deletedRepositoryId: repoId };
}

// ==========================================
// PERSISTENT REPAIR RUNS
// ==========================================

async function createRepairRunRecord(workspaceId, runData, actor = {}) {
  const run = {
    id: runData.id || `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    workspaceId: workspaceId || 'ws_default',
    repositoryId: runData.repositoryId || null,
    projectId: runData.projectId || null,
    initiatedBy: actor.id || runData.initiatedBy || 'anonymous',
    userEmail: actor.email || runData.userEmail || '',
    status: runData.status || 'initialized',
    currentStage: runData.currentStage || 'DETECTED',
    startedAt: runData.startedAt || new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    failureReason: null,
    confidence: runData.confidence || null,
    provider: runData.provider || 'groq',
    rootCause: runData.rootCause || null,
    verificationSummary: runData.verificationSummary || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const runs = readJson(REPAIR_RUNS_FILE, []);
  runs.unshift(run);
  writeJson(REPAIR_RUNS_FILE, runs);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('repair_runs').insert({
        id: run.id,
        workspace_id: run.workspaceId,
        repository_id: run.repositoryId,
        project_id: run.projectId,
        initiated_by: run.initiatedBy,
        user_email: run.userEmail,
        status: run.status,
        current_stage: run.currentStage,
        started_at: run.startedAt,
        confidence: run.confidence,
        provider: run.provider,
        root_cause: run.rootCause,
        created_at: run.createdAt,
        updated_at: run.updatedAt
      });
    } catch (e) {}
  }

  await recordAuditEvent({
    workspaceId,
    actorId: actor.id || 'anonymous',
    actorEmail: actor.email || '',
    action: 'REPAIR_STARTED',
    resourceType: 'REPAIR_RUN',
    resourceId: run.id,
    metadata: { status: run.status, stage: run.currentStage }
  });

  return run;
}

async function updateRepairRunRecord(runId, updates, actor = {}) {
  const runs = readJson(REPAIR_RUNS_FILE, []);
  const idx = runs.findIndex(r => r.id === runId);
  if (idx === -1) return null;

  const run = runs[idx];
  const now = new Date().toISOString();

  Object.assign(run, updates);
  run.updatedAt = now;

  if (['completed', 'failed', 'cancelled', 'VERIFIED', 'SECURITY_FAILURE'].includes(updates.status) && !run.completedAt) {
    run.completedAt = now;
    if (run.startedAt) {
      run.durationMs = new Date(now).getTime() - new Date(run.startedAt).getTime();
    }
  }

  runs[idx] = run;
  writeJson(REPAIR_RUNS_FILE, runs);

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('repair_runs')
        .update({
          status: run.status,
          current_stage: run.currentStage,
          completed_at: run.completedAt,
          duration_ms: run.durationMs,
          failure_reason: run.failureReason,
          confidence: run.confidence,
          root_cause: run.rootCause,
          verification_summary: run.verificationSummary,
          updated_at: now
        })
        .eq('id', runId);
    } catch (e) {}
  }

  if (updates.status === 'completed' || updates.status === 'VERIFIED') {
    await recordAuditEvent({
      workspaceId: run.workspaceId,
      actorId: actor.id || run.initiatedBy,
      actorEmail: actor.email || run.userEmail,
      action: 'REPAIR_COMPLETED',
      resourceType: 'REPAIR_RUN',
      resourceId: run.id,
      metadata: { durationMs: run.durationMs, confidence: run.confidence }
    });
  } else if (updates.status === 'cancelled') {
    await recordAuditEvent({
      workspaceId: run.workspaceId,
      actorId: actor.id || run.initiatedBy,
      actorEmail: actor.email || run.userEmail,
      action: 'REPAIR_CANCELLED',
      resourceType: 'REPAIR_RUN',
      resourceId: run.id,
      metadata: { reason: updates.failureReason }
    });
  }

  return run;
}

async function getRepairRunRecord(workspaceId, runId) {
  const runs = readJson(REPAIR_RUNS_FILE, []);
  return runs.find(r => (!workspaceId || r.workspaceId === workspaceId) && r.id === runId) || null;
}

async function listRepairRuns(workspaceId, { page = 1, limit = 20, status, repositoryId } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('repair_runs')
        .select('*', { count: 'exact' });

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (repositoryId) {
        query = query.eq('repository_id', repositoryId);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + safeLimit - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        return {
          items: data.map(d => ({
            id: d.id,
            workspaceId: d.workspace_id,
            repositoryId: d.repository_id,
            projectId: d.project_id,
            initiatedBy: d.initiated_by,
            userEmail: d.user_email,
            status: d.status,
            currentStage: d.current_stage,
            startedAt: d.started_at,
            completedAt: d.completed_at,
            durationMs: d.duration_ms,
            failureReason: d.failure_reason,
            confidence: d.confidence,
            provider: d.provider,
            rootCause: d.root_cause,
            verificationSummary: d.verification_summary,
            createdAt: d.created_at,
            updatedAt: d.updated_at
          })),
          total: count || 0,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil((count || 0) / safeLimit) || 1
        };
      }
    } catch (e) {}
  }

  let runs = readJson(REPAIR_RUNS_FILE, []);
  if (workspaceId) runs = runs.filter(r => r.workspaceId === workspaceId);
  if (status) runs = runs.filter(r => r.status === status);
  if (repositoryId) runs = runs.filter(r => r.repositoryId === repositoryId);

  const total = runs.length;
  const items = runs.slice(offset, offset + safeLimit);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1
  };
}

const workspaceServiceObject = {
  createWorkspace,
  getWorkspaceById,
  listUserWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  ensureDefaultWorkspace,
  getMembers,
  getMember,
  addMember,
  updateMemberRole,
  removeMember,
  createRepository,
  listRepositories,
  getRepository,
  deleteRepository,
  createRepairRunRecord,
  updateRepairRunRecord,
  getRepairRunRecord,
  listRepairRuns
};

module.exports = {
  createWorkspace,
  getWorkspaceById,
  listUserWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  ensureDefaultWorkspace,
  getMembers,
  getMember,
  addMember,
  updateMemberRole,
  removeMember,
  createRepository,
  listRepositories,
  getRepository,
  deleteRepository,
  createRepairRunRecord,
  updateRepairRunRecord,
  getRepairRunRecord,
  listRepairRuns,
  workspaceService: workspaceServiceObject
};
