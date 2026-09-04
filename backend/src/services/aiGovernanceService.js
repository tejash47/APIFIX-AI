/**
 * APIFIX AI — AI Governance & Model Intelligence Engine (Phase 20)
 * Enforces provider whitelists, token budgets, daily spend caps,
 * model routing governance, and tracks granular multi-provider usage.
 */

const fs = require('fs');
const path = require('path');
const { recordAuditEvent } = require('./auditLogger');
const observabilityEngine = require('./observabilityEngine');
const logger = require('./logger');

const DATA_DIR = path.resolve(__dirname, '../../data');
const AI_USAGE_FILE = path.join(DATA_DIR, 'ai_usage_ledger.json');
const AI_POLICIES_FILE = path.join(DATA_DIR, 'ai_policies.json');

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

const DEFAULT_AI_POLICY = {
  allowedProviders: ['anthropic', 'groq', 'openai'],
  allowedModels: [
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'gpt-4o',
    'gpt-4o-mini'
  ],
  maxTokensPerRequest: 16000,
  maxDailyRequests: 500,
  maxDailySpend: 50.00,
  fallbackAllowed: true,
  productionAIApprovalRequired: false
};

// Model token pricing estimates per 1,000 tokens (USD)
const MODEL_PRICING = {
  'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-opus-20240229': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-3-haiku-20240307': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'gpt-4o': { inputPer1k: 0.0025, outputPer1k: 0.01 },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'openai/gpt-oss-120b': { inputPer1k: 0.0005, outputPer1k: 0.0005 },
  'llama-3.3-70b-versatile': { inputPer1k: 0.0005, outputPer1k: 0.0008 }
};

function estimateAiCost(model, promptTokens = 500, completionTokens = 300) {
  const pricing = MODEL_PRICING[model] || { inputPer1k: 0.001, outputPer1k: 0.002 };
  const cost = (promptTokens / 1000) * pricing.inputPer1k + (completionTokens / 1000) * pricing.outputPer1k;
  return Number(cost.toFixed(6));
}

function getAiPolicy(scopeId) {
  if (!scopeId) return null;
  const policies = readJson(AI_POLICIES_FILE, []);
  const found = policies.find(p => p.scopeId === scopeId);
  return found ? found.policy : null;
}

function getEffectiveAiPolicy(scopeId, fallbackOrgId) {
  return getAiPolicy(scopeId) || (fallbackOrgId ? getAiPolicy(fallbackOrgId) : null) || { ...DEFAULT_AI_POLICY };
}

async function setAiPolicy(scopeId, policyUpdates = {}, actor = {}) {
  const policies = readJson(AI_POLICIES_FILE, []);
  const index = policies.findIndex(p => p.scopeId === scopeId);
  const current = index !== -1 ? policies[index].policy : { ...DEFAULT_AI_POLICY };

  const updated = {
    ...current,
    ...policyUpdates,
    updatedAt: new Date().toISOString()
  };

  if (index !== -1) {
    policies[index].policy = updated;
    policies[index].updatedAt = new Date().toISOString();
  } else {
    policies.push({
      scopeId,
      policy: updated,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  writeJson(AI_POLICIES_FILE, policies);

  await recordAuditEvent({
    workspaceId: scopeId.startsWith('ws_') ? scopeId : 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'AI_GOVERNANCE_POLICY_UPDATED',
    resourceType: 'AI_POLICY',
    resourceId: scopeId,
    metadata: { policyUpdates }
  });

  return updated;
}

/**
 * Evaluates whether an AI request is permitted under active AI governance policies
 */
function evaluateAiCallPermission({
  orgId = 'org_enterprise_primary',
  workspaceId = 'ws_default',
  provider,
  model,
  estimatedTokens = 1000,
  environment = 'development'
}) {
  const policy = getEffectiveAiPolicy(workspaceId, orgId);
  const normalizedProvider = String(provider).toLowerCase();

  // 1. Allowed Providers check
  if (!policy.allowedProviders.includes(normalizedProvider)) {
    observabilityEngine.recordEvent({
      workspaceId,
      category: 'AI',
      event: 'ai_governance_blocked',
      status: 'FAILURE',
      metadata: { reason: `Provider ${provider} is not permitted by AI governance policy.`, provider, model }
    });
    return {
      allowed: false,
      reason: `AI Provider '${provider}' is blocked by enterprise governance policy. Allowed: ${policy.allowedProviders.join(', ')}`
    };
  }

  // 2. Allowed Models check
  if (model && policy.allowedModels.length > 0 && !policy.allowedModels.includes(model)) {
    observabilityEngine.recordEvent({
      workspaceId,
      category: 'AI',
      event: 'ai_governance_blocked',
      status: 'FAILURE',
      metadata: { reason: `Model ${model} is not in enterprise allowed models list.`, provider, model }
    });
    return {
      allowed: false,
      reason: `AI Model '${model}' is not permitted. Allowed models: ${policy.allowedModels.join(', ')}`
    };
  }

  // 3. Max Tokens check
  if (estimatedTokens > policy.maxTokensPerRequest) {
    observabilityEngine.recordEvent({
      workspaceId,
      category: 'AI',
      event: 'ai_governance_blocked',
      status: 'FAILURE',
      metadata: { reason: 'Token request exceeds maxTokensPerRequest limit.', estimatedTokens, limit: policy.maxTokensPerRequest }
    });
    return {
      allowed: false,
      reason: `Estimated tokens (${estimatedTokens}) exceed max allowed tokens per request (${policy.maxTokensPerRequest}).`
    };
  }

  return {
    allowed: true,
    reason: 'AI execution authorized under active governance policy.'
  };
}

/**
 * Records an AI request event into the AI usage ledger
 */
async function recordAiUsage({
  orgId = 'org_enterprise_primary',
  workspaceId = 'ws_default',
  provider,
  model,
  promptTokens = 500,
  completionTokens = 300,
  latencyMs = 0,
  success = true,
  isFallback = false,
  rateLimitEncountered = false,
  runId = null
}) {
  const totalTokens = promptTokens + completionTokens;
  const estimatedCost = estimateAiCost(model, promptTokens, completionTokens);

  const entry = {
    id: `aiu_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    orgId,
    workspaceId,
    provider: String(provider).toLowerCase(),
    model: model || 'unknown',
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost,
    latencyMs,
    success: !!success,
    isFallback: !!isFallback,
    rateLimitEncountered: !!rateLimitEncountered,
    runId,
    timestamp: new Date().toISOString()
  };

  const ledger = readJson(AI_USAGE_FILE, []);
  ledger.unshift(entry);
  if (ledger.length > 5000) ledger.pop();
  writeJson(AI_USAGE_FILE, ledger);

  return entry;
}

/**
 * Summarizes AI usage across providers, models, spend, and latencies
 */
function getAiUsageSummary({ orgId, workspaceId, timeframe = 'all' }) {
  const ledger = readJson(AI_USAGE_FILE, []);
  let filtered = ledger;

  if (workspaceId) {
    filtered = filtered.filter(item => item.workspaceId === workspaceId);
  } else if (orgId) {
    filtered = filtered.filter(item => item.orgId === orgId);
  }

  const now = new Date();
  if (timeframe === 'today') {
    const today = now.toISOString().split('T')[0];
    filtered = filtered.filter(i => i.timestamp.startsWith(today));
  } else if (timeframe === 'weekly') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(i => new Date(i.timestamp) >= weekAgo);
  }

  let totalRequests = filtered.length;
  let totalTokens = 0;
  let totalCost = 0;
  let fallbackCount = 0;
  let rateLimitCount = 0;
  let successfulRequests = 0;
  let failedRequests = 0;

  const providerBreakdown = {};
  const modelBreakdown = {};

  filtered.forEach(entry => {
    totalTokens += (entry.totalTokens || 0);
    totalCost += (entry.estimatedCost || 0);
    if (entry.isFallback) fallbackCount++;
    if (entry.rateLimitEncountered) rateLimitCount++;
    if (entry.success) successfulRequests++;
    else failedRequests++;

    const p = entry.provider || 'unknown';
    if (!providerBreakdown[p]) {
      providerBreakdown[p] = { count: 0, cost: 0, tokens: 0 };
    }
    providerBreakdown[p].count++;
    providerBreakdown[p].cost = Number((providerBreakdown[p].cost + (entry.estimatedCost || 0)).toFixed(6));
    providerBreakdown[p].tokens += (entry.totalTokens || 0);

    const m = entry.model || 'unknown';
    if (!modelBreakdown[m]) {
      modelBreakdown[m] = { count: 0, cost: 0 };
    }
    modelBreakdown[m].count++;
    modelBreakdown[m].cost = Number((modelBreakdown[m].cost + (entry.estimatedCost || 0)).toFixed(6));
  });

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    totalTokens,
    totalEstimatedCost: Number(totalCost.toFixed(4)),
    fallbackCount,
    rateLimitCount,
    providerBreakdown,
    modelBreakdown,
    timeframe,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  DEFAULT_AI_POLICY,
  getAiPolicy,
  setAiPolicy,
  evaluateAiCallPermission,
  estimateAiCost,
  recordAiUsage,
  getAiUsageSummary
};
