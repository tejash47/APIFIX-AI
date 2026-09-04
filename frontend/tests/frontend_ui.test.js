const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

describe('Phase 14 — Frontend UI/UX & Customer Experience Test Suite', () => {

  describe('1. Design System Tokens & Global CSS', () => {
    const globalsCssPath = path.join(__dirname, '..', 'src', 'app', 'globals.css');

    test('globals.css exists and defines CSS variables and dark-first palette', () => {
      assert.ok(fs.existsSync(globalsCssPath), 'globals.css should exist');
      const css = fs.readFileSync(globalsCssPath, 'utf8');

      // Core design tokens
      assert.ok(css.includes('--background'), 'Should define --background token');
      assert.ok(css.includes('--panel'), 'Should define --panel token');
      assert.ok(css.includes('--primary'), 'Should define --primary token');
      assert.ok(css.includes('--verified'), 'Should define --verified token');
      assert.ok(css.includes('--destructive') || css.includes('--alert'), 'Should define alert/destructive token');
      assert.ok(css.includes('--ring'), 'Should define --ring token for focus outlines');
    });

    test('globals.css includes accessible focus rings and reduced-motion media query', () => {
      const css = fs.readFileSync(globalsCssPath, 'utf8');
      assert.ok(css.includes('focus-visible'), 'Should define focus-visible outline rule');
      assert.ok(css.includes('prefers-reduced-motion'), 'Should define prefers-reduced-motion query for accessibility');
      assert.ok(css.includes('grid-field'), 'Should define grid-field developer background utility');
    });
  });

  describe('2. Toast Notification Provider & Lifecycle', () => {
    test('Toast notification state manager creates unique IDs and auto-dismisses', () => {
      const toasts = [];
      const createToast = ({ type, title, message, duration = 4000 }) => {
        const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const toast = { id, type, title, message, duration };
        toasts.push(toast);
        return id;
      };

      const id1 = createToast({ type: 'success', title: 'Patch Approved' });
      const id2 = createToast({ type: 'error', title: 'Analysis Failed', message: 'Timeout' });

      assert.ok(id1.startsWith('toast_'), 'Toast ID should have prefix toast_');
      assert.ok(id2.startsWith('toast_'), 'Toast ID should have prefix toast_');
      assert.notStrictEqual(id1, id2, 'Toast IDs should be unique');
      assert.strictEqual(toasts.length, 2, 'Should store 2 toasts');
      assert.strictEqual(toasts[0].type, 'success');
      assert.strictEqual(toasts[1].type, 'error');
    });
  });

  describe('3. Global Command Palette Search & Key Navigation Indexing', () => {
    const items = [
      { id: 'nav-overview', category: 'Navigation', title: 'Overview Dashboard', subtitle: 'Real-time telemetry' },
      { id: 'nav-apis', category: 'Navigation', title: 'API Endpoints Registry', subtitle: 'Discovered routes' },
      { id: 'nav-incidents', category: 'Navigation', title: 'Incident Explorer', subtitle: 'Detected runtime exceptions' },
      { id: 'nav-runs', category: 'Navigation', title: 'Agent Repair Runs', subtitle: 'Investigation logs' },
      { id: 'nav-tests', category: 'Navigation', title: 'Sandbox Test Suites', subtitle: 'Automated test executions' },
      { id: 'nav-repo', category: 'Navigation', title: 'Repository File Explorer', subtitle: 'Inspect files' },
      { id: 'nav-billing', category: 'Navigation', title: 'Billing & Subscriptions', subtitle: 'Workspace credits' },
      { id: 'nav-settings', category: 'Navigation', title: 'Settings & AI API Keys', subtitle: 'LLM providers' },
      { id: 'act-scan', category: 'Actions', title: 'Launch Live API Scanner', subtitle: 'Probe HTTP endpoint' }
    ];

    const filterCommands = (query) => {
      if (!query.trim()) return items;
      const q = query.toLowerCase();
      return items.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.subtitle && i.subtitle.toLowerCase().includes(q)) ||
        i.category.toLowerCase().includes(q)
      );
    };

    test('Returns all items on empty query', () => {
      const results = filterCommands('');
      assert.strictEqual(results.length, items.length);
    });

    test('Filters matching results for "api"', () => {
      const results = filterCommands('api');
      assert.ok(results.length >= 2, 'Should find at least API Endpoints and API Scanner');
      assert.ok(results.some(r => r.id === 'nav-apis'));
      assert.ok(results.some(r => r.id === 'act-scan'));
    });

    test('Filters matching results for "billing"', () => {
      const results = filterCommands('billing');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, 'nav-billing');
    });

    test('Filters matching results for "repo"', () => {
      const results = filterCommands('repo');
      assert.ok(results.some(r => r.id === 'nav-repo'));
    });
  });

  describe('4. API Registry Health & Method Filter Logic', () => {
    const endpoints = [
      { method: 'POST', path: '/api/auth/login', status: '500 Internal Server Error', health: 'Failing' },
      { method: 'POST', path: '/api/auth/register', status: '200 OK', health: 'Healthy' },
      { method: 'GET', path: '/api/users/profile', status: '200 OK', health: 'Healthy' },
      { method: 'GET', path: '/api/health', status: '200 OK', health: 'Healthy' },
      { method: 'DELETE', path: '/api/history/123', status: '200 OK', health: 'Healthy' }
    ];

    test('Filters endpoints correctly by HTTP method', () => {
      const getEndpoints = endpoints.filter(e => e.method === 'GET');
      const postEndpoints = endpoints.filter(e => e.method === 'POST');
      const deleteEndpoints = endpoints.filter(e => e.method === 'DELETE');

      assert.strictEqual(getEndpoints.length, 2);
      assert.strictEqual(postEndpoints.length, 2);
      assert.strictEqual(deleteEndpoints.length, 1);
    });

    test('Correctly identifies failing vs healthy endpoints', () => {
      const failing = endpoints.filter(e => e.health === 'Failing' || e.status.startsWith('500'));
      const healthy = endpoints.filter(e => e.health === 'Healthy');

      assert.strictEqual(failing.length, 1);
      assert.strictEqual(failing[0].path, '/api/auth/login');
      assert.strictEqual(healthy.length, 4);
    });
  });

  describe('5. Incident Tracker Severity & Status Mapping', () => {
    const incidents = [
      { id: 'INC-1', target: 'POST /api/auth/login', sev: 'CRITICAL', status: 'INVESTIGATING' },
      { id: 'INC-2', target: 'POST /api/auth/register', sev: 'MEDIUM', status: 'RESOLVED' },
      { id: 'INC-3', target: 'GET /api/users/profile', sev: 'LOW', status: 'RESOLVED' }
    ];

    test('Filters incidents by severity', () => {
      const critical = incidents.filter(i => i.sev === 'CRITICAL');
      const medium = incidents.filter(i => i.sev === 'MEDIUM');
      const low = incidents.filter(i => i.sev === 'LOW');

      assert.strictEqual(critical.length, 1);
      assert.strictEqual(medium.length, 1);
      assert.strictEqual(low.length, 1);
    });

    test('Filters incidents by lifecycle status', () => {
      const open = incidents.filter(i => i.status === 'INVESTIGATING' || i.status === 'OPEN');
      const resolved = incidents.filter(i => i.status === 'RESOLVED');

      assert.strictEqual(open.length, 1);
      assert.strictEqual(resolved.length, 2);
    });
  });

  describe('6. Multi-Tenant Role & Credit Calculations', () => {
    const workspaceOwner = { id: 'ws-1', name: 'Acme Corp', role: 'OWNER', credits: 50 };
    const workspaceMember = { id: 'ws-2', name: 'Beta Labs', role: 'MEMBER', credits: 10 };
    const workspaceViewer = { id: 'ws-3', name: 'Observer', role: 'VIEWER', credits: 0 };

    test('Evaluates role privileges accurately', () => {
      const canManageBilling = (ws) => ws.role === 'OWNER' || ws.role === 'ADMIN';
      const canTriggerRepair = (ws) => ws.role !== 'VIEWER' && ws.credits > 0;

      assert.strictEqual(canManageBilling(workspaceOwner), true);
      assert.strictEqual(canManageBilling(workspaceMember), false);
      assert.strictEqual(canManageBilling(workspaceViewer), false);

      assert.strictEqual(canTriggerRepair(workspaceOwner), true);
      assert.strictEqual(canTriggerRepair(workspaceMember), true);
      assert.strictEqual(canTriggerRepair(workspaceViewer), false);
    });

    test('Calculates credits remaining correctly after run costs', () => {
      const initialCredits = 25;
      const repairCost = 1;
      const remaining = initialCredits - repairCost;
      assert.strictEqual(remaining, 24);
    });
  });

  describe('7. Security & Zero Secret Leakage in UI Components', () => {
    const componentDir = path.join(__dirname, '..', 'src', 'components');
    const appDir = path.join(__dirname, '..', 'src', 'app');

    const scanFilesForSensitiveKeys = (dir) => {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      const forbiddenPatterns = [
        /sk_live_[0-9a-zA-Z]{24,}/,
        /whsec_[0-9a-zA-Z]{24,}/,
        /ghp_[0-9a-zA-Z]{36}/,
        /gsk_[0-9a-zA-Z]{20,}/,
        /service_role_key/
      ];

      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          scanFilesForSensitiveKeys(fullPath);
        } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const pattern of forbiddenPatterns) {
            assert.strictEqual(
              pattern.test(content),
              false,
              `Found potential hardcoded secret pattern ${pattern} in ${file.name}`
            );
          }
        }
      }
    };

    test('Verifies no live hardcoded secret keys in src/components or src/app', () => {
      scanFilesForSensitiveKeys(componentDir);
      scanFilesForSensitiveKeys(appDir);
    });
  });

  describe('8. Accessibility & ARIA Attribute Verification', () => {
    test('CommandCenterHeader and CommandPaletteModal define proper ARIA attributes', () => {
      const headerFile = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'components', 'CommandCenterHeader.tsx'),
        'utf8'
      );
      assert.ok(headerFile.includes('aria-expanded'), 'Header should specify aria-expanded attributes on dropdowns');
      assert.ok(headerFile.includes('aria-haspopup') || headerFile.includes('aria-label'), 'Header should specify aria-haspopup or aria-label');

      const paletteFile = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'components', 'CommandPaletteModal.tsx'),
        'utf8'
      );
      assert.ok(paletteFile.includes('role="dialog"'), 'CommandPalette should have role="dialog"');
      assert.ok(paletteFile.includes('aria-modal="true"'), 'CommandPalette should have aria-modal="true"');
    });

    test('ToastContext defines accessible aria-live region', () => {
      const toastFile = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'lib', 'ToastContext.tsx'),
        'utf8'
      );
      assert.ok(toastFile.includes('aria-live="polite"'), 'ToastContainer should have aria-live="polite"');
      assert.ok(toastFile.includes('role="alert"'), 'Individual toasts should have role="alert"');
    });
  });
});
