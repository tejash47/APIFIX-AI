'use client';

import React, { useState, useEffect } from 'react';
import {
  Key,
  Code,
  Webhook,
  BarChart3,
  Terminal,
  Activity,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Shield,
  Play,
  CheckCircle2,
  AlertTriangle,
  Server,
  FileCode,
  Layers,
  ArrowRight,
  Send,
  Sliders,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../lib/authContext';

type DevTabKey = 'API_KEYS' | 'DOCS' | 'WEBHOOKS' | 'USAGE' | 'CLI_CICD' | 'STATUS';

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitTier?: string;
  createdAt: string;
  lastUsedAt?: string | null;
  status: string;
}

interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  status: string;
  createdAt: string;
  lastDeliveryStatus?: string;
}

interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: string;
  status: string;
  statusCode: number;
  latencyMs: number;
  timestamp: string;
  attempt: number;
  signature?: string;
}

export const DeveloperPortalView: React.FC = () => {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<DevTabKey>('API_KEYS');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // API Key State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([
    {
      id: 'key_live_9f83a2',
      name: 'Production CI/CD Agent',
      prefix: 'apifix_live_9f83',
      scopes: ['read:projects', 'write:runs', 'write:repairs', 'verify:all'],
      rateLimitTier: 'ENTERPRISE',
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      lastUsedAt: new Date(Date.now() - 3600000).toISOString(),
      status: 'ACTIVE'
    },
    {
      id: 'key_test_1c44b9',
      name: 'Staging Webhook Dispatcher',
      prefix: 'apifix_test_1c44',
      scopes: ['read:all', 'write:webhooks'],
      rateLimitTier: 'PRO',
      createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      lastUsedAt: new Date(Date.now() - 7200000).toISOString(),
      status: 'ACTIVE'
    }
  ]);

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<'live' | 'test'>('live');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'read:projects',
    'write:runs',
    'verify:all'
  ]);
  const [generatedRawKey, setGeneratedRawKey] = useState<string | null>(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  // Webhooks State
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([
    {
      id: 'sub_wh_88291',
      url: 'https://api.titan-aerospace.com/webhooks/apifix',
      events: ['incident.detected', 'run.completed', 'patch.generated', 'verification.passed'],
      status: 'ACTIVE',
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      lastDeliveryStatus: 'DELIVERED'
    }
  ]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([
    {
      id: 'del_evt_99182',
      subscriptionId: 'sub_wh_88291',
      event: 'verification.passed',
      status: 'DELIVERED',
      statusCode: 200,
      latencyMs: 142,
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      attempt: 1,
      signature: 't=1756965000,v1=9c402bb8a7e02e8d893...'
    },
    {
      id: 'del_evt_99181',
      subscriptionId: 'sub_wh_88291',
      event: 'patch.generated',
      status: 'DELIVERED',
      statusCode: 200,
      latencyMs: 215,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      attempt: 1,
      signature: 't=1756963200,v1=4b810ff4a9e32a7e912...'
    }
  ]);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  // CI/CD Generator State
  const [ciPlatform, setCiPlatform] = useState<'github' | 'gitlab' | 'bitbucket' | 'azure'>('github');
  const [ciProjectId, setCiProjectId] = useState('proj_enterprise_api_gateway');
  const [ciAutoRepair, setCiAutoRepair] = useState(true);

  // API Explorer State
  const [selectedEndpoint, setSelectedEndpoint] = useState<'projects' | 'incidents' | 'runs' | 'verify' | 'status'>('verify');
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiLoading, setApiLoading] = useState(false);

  // Available scopes
  const availableScopes = [
    'read:projects',
    'write:projects',
    'read:incidents',
    'write:incidents',
    'read:runs',
    'write:runs',
    'read:repairs',
    'write:repairs',
    'read:patches',
    'verify:all',
    'read:webhooks',
    'write:webhooks',
    'read:audit',
    'admin:all'
  ];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);

    try {
      const mockRaw = `apifix_${newKeyType}_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      const newKey: ApiKeyItem = {
        id: `key_${newKeyType}_${Math.random().toString(36).substring(2, 8)}`,
        name: newKeyName.trim(),
        prefix: mockRaw.substring(0, 15),
        scopes: selectedScopes,
        rateLimitTier: 'ENTERPRISE',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        status: 'ACTIVE'
      };

      setApiKeys([newKey, ...apiKeys]);
      setGeneratedRawKey(mockRaw);
      setNewKeyName('');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeKey = (keyId: string) => {
    setApiKeys(apiKeys.map(k => k.id === keyId ? { ...k, status: 'REVOKED' } : k));
  };

  const handleReplayDelivery = async (deliveryId: string) => {
    setReplayingId(deliveryId);
    setTimeout(() => {
      setReplayingId(null);
      setDeliveries(prev => [
        {
          id: `del_replay_${Date.now()}`,
          subscriptionId: 'sub_wh_88291',
          event: 'verification.passed',
          status: 'DELIVERED',
          statusCode: 200,
          latencyMs: 98,
          timestamp: new Date().toISOString(),
          attempt: 1,
          signature: 't=' + Math.floor(Date.now() / 1000) + ',v1=replayed_sig_' + Math.random().toString(36).substring(2, 8)
        },
        ...prev
      ]);
    }, 1000);
  };

  const handleExecuteApiTest = async () => {
    setApiLoading(true);
    try {
      if (selectedEndpoint === 'verify') {
        setApiResponse({
          data: {
            projectId: 'proj_enterprise_api_gateway',
            passed: true,
            healthScore: 99.4,
            driftDetected: false,
            synthesizedPatchesAvailable: 0,
            activeAnomalies: 0,
            timestamp: new Date().toISOString()
          },
          meta: {
            requestId: `req_${Date.now()}`,
            timestamp: new Date().toISOString(),
            durationMs: 42,
            version: '1.0.0'
          }
        });
      } else if (selectedEndpoint === 'projects') {
        setApiResponse({
          data: {
            items: [
              { id: 'proj_api_gateway', name: 'Titan API Gateway', health: 100, activeRuns: 0 },
              { id: 'proj_auth_core', name: 'Enterprise Identity Core', health: 98.5, activeRuns: 1 }
            ]
          },
          meta: {
            page: 1,
            limit: 20,
            totalItems: 2,
            requestId: `req_${Date.now()}`
          }
        });
      } else if (selectedEndpoint === 'status') {
        setApiResponse({
          data: {
            status: 'OPERATIONAL',
            version: '2.1.0',
            uptimeSeconds: 849200,
            components: {
              api_engine: { status: 'UP', latencyMs: 12 },
              investigation_core: { status: 'UP', latencyMs: 25 },
              patch_synthesizer: { status: 'UP', latencyMs: 38 },
              verification_sandbox: { status: 'UP', latencyMs: 45 },
              webhook_dispatcher: { status: 'UP', queueDepth: 0 }
            }
          }
        });
      } else {
        setApiResponse({
          data: { status: 'SUCCESS', message: 'Executed API v1 query', timestamp: new Date().toISOString() },
          meta: { requestId: `req_${Date.now()}` }
        });
      }
    } finally {
      setApiLoading(false);
    }
  };

  const generateCiWorkflow = () => {
    if (ciPlatform === 'github') {
      return `name: APIFIX Continuous Verification Gate
on: [push, pull_request]

jobs:
  apifix-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install APIFIX CLI
        run: npm install -g @apifix/cli
      - name: Verify API Integrity
        env:
          APIFIX_API_KEY: \${{ secrets.APIFIX_API_KEY }}
        run: |
          apifix verify --project "${ciProjectId}" --json > apifix-report.json
          ${ciAutoRepair ? `if [ $? -eq 1 ]; then
            apifix repair analyze --project "${ciProjectId}"
          fi` : ''}`;
    } else if (ciPlatform === 'gitlab') {
      return `stages:
  - verify

apifix-quality-gate:
  stage: verify
  image: node:20-alpine
  script:
    - npm install -g @apifix/cli
    - apifix verify --project "${ciProjectId}" --json > apifix-report.json
  artifacts:
    paths:
      - apifix-report.json`;
    } else if (ciPlatform === 'bitbucket') {
      return `pipelines:
  default:
    - step:
        name: APIFIX Verification Gate
        script:
          - npm install -g @apifix/cli
          - apifix verify --project "${ciProjectId}" --json > apifix-report.json`;
    } else {
      return `trigger:
  - main

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
  - script: |
      npm install -g @apifix/cli
      apifix verify --project "${ciProjectId}" --json > apifix-report.json
    displayName: 'APIFIX Quality Gate'
    env:
      APIFIX_API_KEY: $(APIFIX_API_KEY)`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-white tracking-tight">Developer Portal & API Ecosystem</h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  API v1.0 ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Versioned REST API • HMAC Webhooks • Idempotency Engine • Official CLI & CI/CD Integrations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>OpenAPI 3.1: Validated</span>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-t border-slate-800/80 pt-4 text-xs font-semibold">
          {[
            { key: 'API_KEYS', label: 'API Keys & Scopes', icon: Key },
            { key: 'DOCS', label: 'Interactive API Explorer', icon: FileCode },
            { key: 'WEBHOOKS', label: 'Outbound Webhooks', icon: Webhook },
            { key: 'USAGE', label: 'Rate Limits & Analytics', icon: BarChart3 },
            { key: 'CLI_CICD', label: 'CLI & CI/CD Pipelines', icon: Terminal },
            { key: 'STATUS', label: 'System Status', icon: Activity }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as DevTabKey)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: API Keys */}
      {activeTab === 'API_KEYS' && (
        <div className="space-y-6">
          {/* Key Generation Modal / Alert if newly generated */}
          {generatedRawKey && (
            <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Save Your API Secret Now</span>
              </div>
              <p className="text-xs text-amber-200/80">
                This token will never be shown again. We store only cryptographic SHA-256 hashes in accordance with SOC2 security standards.
              </p>
              <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-amber-500/30 font-mono text-xs text-white select-all">
                <span className="flex-1 truncate">{generatedRawKey}</span>
                <button
                  onClick={() => handleCopy(generatedRawKey, 'generated_key')}
                  className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 flex items-center gap-1 text-xs"
                >
                  {copiedCode === 'generated_key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode === 'generated_key' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setGeneratedRawKey(null)}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  I have saved this key safely
                </button>
              </div>
            </div>
          )}

          {/* Create Key Card */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Create Enterprise API Key
              </h3>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-300">Key Name / Description</label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., GitHub Actions Production Deployer"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Environment</label>
                  <select
                    value={newKeyType}
                    onChange={(e) => setNewKeyType(e.target.value as 'live' | 'test')}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="live">Live (apifix_live_...)</option>
                    <option value="test">Test / Sandbox (apifix_test_...)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Access Scopes</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {availableScopes.map((scope) => {
                    const isSelected = selectedScopes.includes(scope);
                    return (
                      <button
                        type="button"
                        key={scope}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedScopes(selectedScopes.filter(s => s !== scope));
                          } else {
                            setSelectedScopes([...selectedScopes, scope]);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono border text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span>{scope}</span>
                        {isSelected && <Check className="w-3 h-3 text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isCreatingKey}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isCreatingKey ? 'Generating...' : 'Generate API Key'}
                </button>
              </div>
            </form>
          </div>

          {/* Active Keys Table */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-400" />
              Active API Keys ({apiKeys.length})
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3 px-3">Name</th>
                    <th className="pb-3 px-3">Prefix / ID</th>
                    <th className="pb-3 px-3">Scopes</th>
                    <th className="pb-3 px-3">Tier</th>
                    <th className="pb-3 px-3">Created</th>
                    <th className="pb-3 px-3">Status</th>
                    <th className="pb-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 font-medium text-white">{k.name}</td>
                      <td className="py-3 px-3 font-mono text-slate-300">{k.prefix}...</td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {k.scopes.map(s => (
                            <span key={s} className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-indigo-300">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                          {k.rateLimitTier || 'ENTERPRISE'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400">{new Date(k.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          k.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {k.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {k.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleRevokeKey(k.id)}
                            className="p-1.5 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
                            title="Revoke Key"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Interactive API Explorer */}
      {activeTab === 'DOCS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Endpoint selector */}
          <div className="lg:col-span-1 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              API v1 Endpoints
            </h3>
            <div className="space-y-2">
              {[
                { id: 'verify', method: 'POST', path: '/api/v1/verification/verify', label: 'Continuous Verification Gate' },
                { id: 'projects', method: 'GET', path: '/api/v1/projects', label: 'List Workspace Projects' },
                { id: 'incidents', method: 'GET', path: '/api/v1/incidents', label: 'List Incident Triages' },
                { id: 'status', method: 'GET', path: '/status', label: 'System Health & Components' }
              ].map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => {
                    setSelectedEndpoint(ep.id as any);
                    setApiResponse(null);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedEndpoint === ep.id
                      ? 'bg-indigo-600/10 border-indigo-500/40 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                      ep.method === 'POST' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {ep.method}
                    </span>
                    <span className="font-mono text-xs text-slate-200">{ep.path}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{ep.label}</p>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-800">
              <a
                href="/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Download OpenAPI 3.1 Spec (.json)
              </a>
            </div>
          </div>

          {/* Right: Interactive Console */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                Interactive Request Runner
              </h3>
              <button
                onClick={handleExecuteApiTest}
                disabled={apiLoading}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {apiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send Request
              </button>
            </div>

            {/* Code Snippet Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>cURL Request</span>
                <button
                  onClick={() => handleCopy(`curl -X ${selectedEndpoint === 'verify' ? 'POST' : 'GET'} "https://api.apifix.ai/api/v1/${selectedEndpoint}" \\\n  -H "Authorization: Bearer apifix_live_..." \\\n  -H "Content-Type: application/json"`, 'curl')}
                  className="hover:text-white flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
{`curl -X ${selectedEndpoint === 'verify' ? 'POST' : 'GET'} "https://api.apifix.ai/api/v1/${selectedEndpoint === 'verify' ? 'verification/verify' : selectedEndpoint}" \\
  -H "Authorization: Bearer apifix_live_..." \\
  -H "Content-Type: application/json"${selectedEndpoint === 'verify' ? ' \\\n  -d \'{"projectId": "proj_enterprise_api_gateway"}\'' : ''}`}
              </pre>
            </div>

            {/* Response Area */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Response Envelope (200 OK)</span>
                {apiResponse && (
                  <span className="font-mono text-emerald-400 text-[11px]">
                    200 OK • {apiResponse?.meta?.durationMs || 42}ms
                  </span>
                )}
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-80">
                {apiResponse
                  ? JSON.stringify(apiResponse, null, 2)
                  : '// Click "Send Request" to execute query and view live response envelope.'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Outbound Webhooks */}
      {activeTab === 'WEBHOOKS' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Webhook className="w-4 h-4 text-indigo-400" />
              Configured Outbound Endpoints
            </h3>

            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono text-xs font-semibold text-white">
                      <span>{wh.url}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {wh.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[10px] font-mono text-slate-400">
                      <span>Subscribed Events:</span>
                      {wh.events.map(ev => (
                        <span key={ev} className="px-1 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery Log & Replay */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              Recent Webhook Deliveries & Replay Console
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3 px-3">Event</th>
                    <th className="pb-3 px-3">Delivery ID</th>
                    <th className="pb-3 px-3">HTTP Status</th>
                    <th className="pb-3 px-3">Latency</th>
                    <th className="pb-3 px-3">Timestamp</th>
                    <th className="pb-3 px-3 text-right">Replay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {deliveries.map((del) => (
                    <tr key={del.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 font-mono font-semibold text-indigo-300">{del.event}</td>
                      <td className="py-3 px-3 font-mono text-slate-400">{del.id}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {del.statusCode} OK
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-400">{del.latencyMs}ms</td>
                      <td className="py-3 px-3 text-slate-400">{new Date(del.timestamp).toLocaleTimeString()}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleReplayDelivery(del.id)}
                          disabled={replayingId === del.id}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 ml-auto"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${replayingId === del.id ? 'animate-spin' : ''}`} />
                          {replayingId === del.id ? 'Replaying...' : 'Replay'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Usage Analytics */}
      {activeTab === 'USAGE' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <span className="text-xs text-slate-400 font-medium">Monthly API Requests</span>
            <div className="text-2xl font-extrabold text-white font-mono">1,482,920</div>
            <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> 99.98% Success Rate
            </div>
          </div>
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <span className="text-xs text-slate-400 font-medium">P95 Latency</span>
            <div className="text-2xl font-extrabold text-indigo-400 font-mono">48ms</div>
            <div className="text-xs text-slate-400">P50: 18ms • P99: 112ms</div>
          </div>
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <span className="text-xs text-slate-400 font-medium">Idempotency Replay Cache Hits</span>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono">14,290</div>
            <div className="text-xs text-slate-400">Saved 42% compute latency</div>
          </div>
        </div>
      )}

      {/* Tab 5: CLI & CI/CD Hub */}
      {activeTab === 'CLI_CICD' && (
        <div className="space-y-6">
          {/* CLI Quickstart */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              Official APIFIX CLI Installation & Commands
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300">1. Install Globally via NPM</span>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-indigo-300">
                  <span>npm install -g @apifix/cli</span>
                  <button onClick={() => handleCopy('npm install -g @apifix/cli', 'cli_install')} className="text-slate-400 hover:text-white">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300">2. Authenticate CLI Session</span>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-indigo-300">
                  <span>apifix login apifix_live_your_key</span>
                  <button onClick={() => handleCopy('apifix login <api_key>', 'cli_login')} className="text-slate-400 hover:text-white">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-slate-300">Core CLI Commands:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-300">
                  <span className="text-indigo-400">apifix verify &lt;projectId&gt;</span> — Quality gate
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-300">
                  <span className="text-indigo-400">apifix runs trigger &lt;projectId&gt;</span> — Self-healing
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-300">
                  <span className="text-indigo-400">apifix repair analyze &lt;projectId&gt;</span> — Patch synthesis
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-300">
                  <span className="text-indigo-400">apifix status</span> — Health inspection
                </div>
              </div>
            </div>
          </div>

          {/* CI/CD Pipeline Generator */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Automated CI/CD Pipeline Generator
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">CI/CD Platform</label>
                <select
                  value={ciPlatform}
                  onChange={(e) => setCiPlatform(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none"
                >
                  <option value="github">GitHub Actions (.github/workflows)</option>
                  <option value="gitlab">GitLab CI (.gitlab-ci.yml)</option>
                  <option value="bitbucket">Bitbucket Pipelines</option>
                  <option value="azure">Azure DevOps Pipelines</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Target Project ID</label>
                <input
                  type="text"
                  value={ciProjectId}
                  onChange={(e) => setCiProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 flex flex-col justify-end pb-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ciAutoRepair}
                    onChange={(e) => setCiAutoRepair(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span>Auto-repair on drift detection</span>
                </label>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Generated Workflow Definition</span>
                <button
                  onClick={() => handleCopy(generateCiWorkflow(), 'ci_workflow')}
                  className="hover:text-white flex items-center gap-1 font-semibold"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedCode === 'ci_workflow' ? 'Copied Workflow' : 'Copy Workflow'}
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-indigo-300 overflow-x-auto">
                {generateCiWorkflow()}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Status Dashboard */}
      {activeTab === 'STATUS' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Platform Subsystem Status (99.99% Uptime)
              </h3>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
                ALL SYSTEMS OPERATIONAL
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { name: 'API Gateway (v1 REST)', status: 'UP', latency: '12ms' },
                { name: 'Autonomous Investigation Engine', status: 'UP', latency: '24ms' },
                { name: 'Deterministic Patch Synthesizer', status: 'UP', latency: '35ms' },
                { name: 'Sandbox Verification Runner', status: 'UP', latency: '42ms' },
                { name: 'HMAC Webhook Dispatcher', status: 'UP', latency: '8ms' },
                { name: 'SHA-256 Audit Ledger', status: 'UP', latency: '15ms' }
              ].map((sys) => (
                <div key={sys.name} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white">{sys.name}</span>
                    <div className="text-[11px] font-mono text-slate-400">Response: {sys.latency}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {sys.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
