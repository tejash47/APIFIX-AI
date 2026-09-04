const fs = require('fs');
const path = require('path');
const { executeAgentRun, approveAndApplyPatch } = require('../orchestrator/agent');

const AUTH_CONTROLLER_PATH = path.resolve(__dirname, '../../../demo-api/src/controllers/authController.js');

const INITIAL_FLAWED_CONTENT = `// Mock database of users
const usersDatabase = [
  { id: 'usr_1', email: 'alex@example.com', password: 'securepassword123', name: 'Alex Developer' },
  { id: 'usr_2', email: 'dev@apifix.ai', password: 'password456', name: 'Dev Engineer' }
];

/**
 * Handle Auth Login
 * NOTE: Intentionally seeded bug for APIFIX AI reproduction:
 * When an unknown email is provided, \`user\` lookup returns \`null\`.
 * The code directly accesses \`user.password\` without checking if \`user\` is null,
 * resulting in: TypeError: Cannot read properties of null (reading 'password')
 * which causes an unhandled HTTP 500 Internal Server Error.
 */
function login(req, res) {
  const { email, password } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email parameter is required' });
  }

  // Database lookup returns null if email is not found
  const user = usersDatabase.find(u => u.email === email) || null;

  // BUG: Direct property access on user without null check
  if (user.password === password) {
    return res.status(200).json({
      token: 'jwt_mock_token_xyz987',
      user: { id: user.id, email: user.email, name: user.name }
    });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
}

module.exports = {
  login,
  usersDatabase
};
`;

/**
 * Reset Demo Environment to Initial Flawed Bug State
 */
function resetDemoRepository() {
  fs.writeFileSync(AUTH_CONTROLLER_PATH, INITIAL_FLAWED_CONTENT, 'utf8');
  return { status: 'reset', message: 'Demo repository restored to initial bug state.' };
}

/**
 * Trigger Full Deterministic Demo Run
 */
async function triggerDemoRun() {
  resetDemoRepository();
  const runId = `demo_run_${Date.now()}`;
  
  // Start investigation in background
  executeAgentRun(runId).catch(console.error);

  return {
    runId,
    incident: {
      id: 'inc_500_auth_login',
      endpoint: '/api/auth/login',
      method: 'POST',
      status: 500,
      error: 'TypeError: Cannot read properties of null (reading password)'
    }
  };
}

module.exports = {
  resetDemoRepository,
  triggerDemoRun
};
