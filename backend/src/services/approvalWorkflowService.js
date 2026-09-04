/**
 * APIFIX AI — Enterprise Approval Workflow Engine (Phase 20)
 * Multi-reviewer approval requests, strict self-approval prevention,
 * expiration handling, and full audit ledger traceability.
 */

const fs = require('fs');
const path = require('path');
const { recordAuditEvent } = require('./auditLogger');
const observabilityEngine = require('./observabilityEngine');
const logger = require('./logger');

const DATA_DIR = path.resolve(__dirname, '../../data');
const APPROVALS_FILE = path.join(DATA_DIR, 'approval_requests.json');

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
  } catch (e) {}
  return def;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Creates an approval request
 */
async function createApprovalRequest({
  orgId = 'org_enterprise_primary',
  workspaceId = 'ws_default',
  workflowType = 'REPAIR_EXECUTION', // 'REPAIR_EXECUTION', 'PRODUCTION_REPAIR', 'SECURITY_SENSITIVE_OPERATION', 'POLICY_OVERRIDE', 'BUDGET_OVERRIDE'
  title,
  description = '',
  severity = 'MEDIUM',
  environment = 'development',
  requesterId,
  requesterEmail,
  requiredApprovals = 1,
  expiresInHours = 48,
  metadata = {}
}) {
  if (!title || !title.trim()) {
    throw new Error('Approval request title is required.');
  }

  const requestId = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();

  const request = {
    id: requestId,
    orgId,
    workspaceId,
    workflowType,
    title: title.trim(),
    description: description.trim(),
    severity: String(severity).toUpperCase(),
    environment: String(environment).toLowerCase(),
    requesterId: requesterId || 'usr_anonymous',
    requesterEmail: requesterEmail || 'dev@apifix.ai',
    requiredApprovals: Math.max(1, parseInt(requiredApprovals, 10) || 1),
    currentApprovals: 0,
    approvals: [],
    rejections: [],
    status: 'PENDING', // PENDING, APPROVED, REJECTED, EXPIRED, CANCELLED
    metadata,
    expiresAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  const requests = readJson(APPROVALS_FILE, []);
  requests.unshift(request);
  writeJson(APPROVALS_FILE, requests);

  observabilityEngine.recordEvent({
    workspaceId,
    category: 'GOVERNANCE',
    event: 'approval_requested',
    status: 'SUCCESS',
    metadata: { requestId, workflowType, title, severity, environment, requiredApprovals }
  });

  await recordAuditEvent({
    workspaceId,
    actorId: requesterId,
    actorEmail: requesterEmail,
    action: 'APPROVAL_REQUEST_CREATED',
    resourceType: 'APPROVAL_REQUEST',
    resourceId: requestId,
    metadata: { workflowType, severity, environment, title }
  });

  return request;
}

/**
 * Gets approval request by ID, updating expired status if past expiration
 */
async function getApprovalRequestById(requestId) {
  const requests = readJson(APPROVALS_FILE, []);
  const req = requests.find(r => r.id === requestId);
  if (!req) return null;

  // Check expiration
  if (req.status === 'PENDING' && new Date() > new Date(req.expiresAt)) {
    req.status = 'EXPIRED';
    req.updatedAt = new Date().toISOString();
    writeJson(APPROVALS_FILE, requests);
  }

  return req;
}

/**
 * Approves a request
 */
async function approveRequest(requestId, { reviewerId, reviewerEmail, role = 'MEMBER', comment = '' }) {
  const requests = readJson(APPROVALS_FILE, []);
  const index = requests.findIndex(r => r.id === requestId);
  if (index === -1) throw new Error('Approval request not found.');

  const request = requests[index];

  if (request.status !== 'PENDING') {
    throw new Error(`Cannot approve request in ${request.status} status.`);
  }

  if (new Date() > new Date(request.expiresAt)) {
    request.status = 'EXPIRED';
    request.updatedAt = new Date().toISOString();
    writeJson(APPROVALS_FILE, requests);
    throw new Error('Approval request has expired.');
  }

  // Strict Self-Approval Prevention Check
  const isSelf = (reviewerId && reviewerId === request.requesterId) ||
    (reviewerEmail && reviewerEmail.toLowerCase() === request.requesterEmail.toLowerCase());

  if (isSelf) {
    throw new Error('Self-approval is forbidden by enterprise governance policy. A different reviewer must approve.');
  }

  // Check duplicate approval from same reviewer
  const alreadyApproved = request.approvals.some(
    a => (reviewerId && a.reviewerId === reviewerId) || (reviewerEmail && a.reviewerEmail.toLowerCase() === reviewerEmail.toLowerCase())
  );
  if (alreadyApproved) {
    throw new Error('You have already approved this request.');
  }

  const approvalRecord = {
    reviewerId: reviewerId || 'usr_reviewer',
    reviewerEmail: reviewerEmail || '',
    role,
    comment: comment || '',
    approvedAt: new Date().toISOString()
  };

  request.approvals.push(approvalRecord);
  request.currentApprovals = request.approvals.length;

  if (request.currentApprovals >= request.requiredApprovals) {
    request.status = 'APPROVED';
  }

  request.updatedAt = new Date().toISOString();
  requests[index] = request;
  writeJson(APPROVALS_FILE, requests);

  observabilityEngine.recordEvent({
    workspaceId: request.workspaceId,
    category: 'GOVERNANCE',
    event: 'approval_approved',
    status: 'SUCCESS',
    metadata: {
      requestId,
      reviewerEmail,
      currentApprovals: request.currentApprovals,
      requiredApprovals: request.requiredApprovals,
      status: request.status
    }
  });

  await recordAuditEvent({
    workspaceId: request.workspaceId,
    actorId: reviewerId,
    actorEmail: reviewerEmail,
    action: 'APPROVAL_REQUEST_APPROVED',
    resourceType: 'APPROVAL_REQUEST',
    resourceId: requestId,
    metadata: { approvalRecord, currentStatus: request.status }
  });

  return request;
}

/**
 * Rejects a request
 */
async function rejectRequest(requestId, { reviewerId, reviewerEmail, role = 'MEMBER', reason = '' }) {
  const requests = readJson(APPROVALS_FILE, []);
  const index = requests.findIndex(r => r.id === requestId);
  if (index === -1) throw new Error('Approval request not found.');

  const request = requests[index];

  if (request.status !== 'PENDING') {
    throw new Error(`Cannot reject request in ${request.status} status.`);
  }

  const rejectionRecord = {
    reviewerId: reviewerId || 'usr_reviewer',
    reviewerEmail: reviewerEmail || '',
    role,
    reason: reason || 'Rejected by reviewer.',
    rejectedAt: new Date().toISOString()
  };

  request.rejections.push(rejectionRecord);
  request.status = 'REJECTED';
  request.updatedAt = new Date().toISOString();

  requests[index] = request;
  writeJson(APPROVALS_FILE, requests);

  observabilityEngine.recordEvent({
    workspaceId: request.workspaceId,
    category: 'GOVERNANCE',
    event: 'approval_rejected',
    status: 'FAILURE',
    metadata: { requestId, reviewerEmail, reason }
  });

  await recordAuditEvent({
    workspaceId: request.workspaceId,
    actorId: reviewerId,
    actorEmail: reviewerEmail,
    action: 'APPROVAL_REQUEST_REJECTED',
    resourceType: 'APPROVAL_REQUEST',
    resourceId: requestId,
    metadata: { rejectionRecord }
  });

  return request;
}

/**
 * Cancels a request by the requester or admin
 */
async function cancelApprovalRequest(requestId, actor = {}) {
  const requests = readJson(APPROVALS_FILE, []);
  const index = requests.findIndex(r => r.id === requestId);
  if (index === -1) throw new Error('Approval request not found.');

  const request = requests[index];
  if (request.status !== 'PENDING') {
    throw new Error(`Cannot cancel request in ${request.status} status.`);
  }

  request.status = 'CANCELLED';
  request.updatedAt = new Date().toISOString();
  requests[index] = request;
  writeJson(APPROVALS_FILE, requests);

  await recordAuditEvent({
    workspaceId: request.workspaceId,
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'APPROVAL_REQUEST_CANCELLED',
    resourceType: 'APPROVAL_REQUEST',
    resourceId: requestId,
    metadata: { cancelledBy: actor.email }
  });

  return request;
}

/**
 * Lists approval requests with filtering and pagination
 */
function listApprovalRequests({ orgId, workspaceId, status, page = 1, limit = 20 }) {
  const requests = readJson(APPROVALS_FILE, []);
  let filtered = requests;

  if (workspaceId) {
    filtered = filtered.filter(r => r.workspaceId === workspaceId);
  } else if (orgId) {
    filtered = filtered.filter(r => r.orgId === orgId);
  }

  if (status) {
    filtered = filtered.filter(r => r.status.toUpperCase() === status.toUpperCase());
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  return {
    items: filtered.slice(offset, offset + safeLimit),
    total: filtered.length,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(filtered.length / safeLimit) || 1
  };
}

module.exports = {
  createApprovalRequest,
  getApprovalRequestById,
  approveRequest,
  rejectRequest,
  cancelApprovalRequest,
  listApprovalRequests
};
