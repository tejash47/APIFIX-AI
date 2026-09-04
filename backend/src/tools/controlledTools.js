const fs = require('fs');
const path = require('path');

const DEMO_API_DIR = path.resolve(__dirname, '../../../demo-api');

// Tracks the current active workspace for this single-threaded control plane process
let activeWorkspaceDir = DEMO_API_DIR;

function setActiveWorkspaceDir(dir) {
  activeWorkspaceDir = dir;
}

// In-memory snapshot store for pre-patch backups, keyed by absolute file path
const fileSnapshots = new Map();

// Tracks snapped files per workspace: workspaceDir -> Set of absolute file paths
const workspaceSnapshots = new Map();

/**
 * List repository files
 */
function listFiles(workspaceDir = activeWorkspaceDir) {
  const files = [];
  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else {
        files.push(path.relative(workspaceDir, fullPath).replace(/\\/g, '/'));
      }
    }
  }
  scan(workspaceDir);
  return { files, total: files.length };
}

/**
 * Read specific repository file safely
 */
function readFile(workspaceDir, filePath) {
  let targetWorkspace = workspaceDir;
  let targetFile = filePath;
  
  if (filePath === undefined) {
    targetFile = workspaceDir;
    targetWorkspace = activeWorkspaceDir;
  }

  const fullPath = path.resolve(targetWorkspace, targetFile);
  if (!fullPath.startsWith(targetWorkspace)) {
    throw new Error('Security Violation: Path traversal attempt outside workspace');
  }
  if (!fs.existsSync(fullPath)) {
    return { error: `File not found: ${targetFile}` };
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  return { path: targetFile, content, lines: content.split('\n').length };
}

/**
 * Search code for query pattern
 */
function searchCode(workspaceDir, query) {
  let targetWorkspace = workspaceDir;
  let targetQuery = query;

  if (query === undefined) {
    targetQuery = workspaceDir;
    targetWorkspace = activeWorkspaceDir;
  }

  const matches = [];
  const files = listFiles(targetWorkspace).files;
  for (const relFile of files) {
    const fullPath = path.join(targetWorkspace, relFile);
    if (fs.statSync(fullPath).isFile()) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes(targetQuery)) {
          matches.push({ file: relFile, line: index + 1, content: line.trim() });
        }
      });
    }
  }
  return { query: targetQuery, matches, count: matches.length };
}

/**
 * Reproduce API failure directly via HTTP fetch probe
 */
async function reproduceFailure(endpoint = '/api/auth/login', payload = { email: 'unknown_user@apifix.ai', password: 'password123' }, authToken) {
  try {
    // Extract path and method if endpoint contains both (e.g. "POST /api/auth/login" or "/api/auth/login")
    let cleanPath = endpoint || '/api/auth/login';
    let method = 'POST';
    if (cleanPath.includes(' ')) {
      const parts = cleanPath.trim().split(/\s+/);
      if (parts.length >= 2) {
        method = parts[0].toUpperCase();
        cleanPath = parts[1];
      }
    }
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }
    const response = await fetch(`http://localhost:4001${cleanPath}`, {
      method: method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(3000)
    });
    const status = response.status;
    let bodyText = await response.text();
    
    // Mask token if it appears inside the body text
    if (authToken) {
      bodyText = bodyText.replaceAll(authToken, '********');
    }

    let body;
    try { body = JSON.parse(bodyText); } catch (e) { body = bodyText; }

    return {
      endpoint,
      payload,
      status_code: status,
      body,
      reproducible: status >= 500,
      evidence: [
        `HTTP POST ${endpoint} returned status ${status}`,
        `Response body: ${JSON.stringify(body)}`,
        status === 500 ? 'Unhandled Exception: Cannot read properties of null (reading password)' : 'Expected response'
      ]
    };
  } catch (err) {
    let errMsg = err.message;
    if (authToken) {
      errMsg = errMsg.replaceAll(authToken, '********');
    }
    return {
      endpoint,
      payload,
      status_code: 500,
      error: errMsg,
      reproducible: true,
      evidence: [`Connection/Execution error: ${errMsg}`]
    };
  }
}

/**
 * Create Pre-Patch Backup Snapshot
 */
function createSnapshot(workspaceDir, filePath) {
  let targetWorkspace = workspaceDir;
  let targetFile = filePath;

  if (filePath === undefined) {
    targetFile = workspaceDir;
    targetWorkspace = activeWorkspaceDir;
  }

  const fullPath = path.resolve(targetWorkspace, targetFile);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    fileSnapshots.set(fullPath, content);

    // Track snapshot files per workspaceDir
    if (!workspaceSnapshots.has(targetWorkspace)) {
      workspaceSnapshots.set(targetWorkspace, new Set());
    }
    workspaceSnapshots.get(targetWorkspace).add(fullPath);
  }
}

/**
 * Apply safe code patch with snapshot tracking
 */
function applyPatch(workspaceDir, filePath, originalCode, replacementCode) {
  let targetWorkspace = workspaceDir;
  let targetFile = filePath;
  let targetOriginal = originalCode;
  let targetReplacement = replacementCode;

  if (replacementCode === undefined) {
    targetReplacement = originalCode;
    targetOriginal = filePath;
    targetFile = workspaceDir;
    targetWorkspace = activeWorkspaceDir;
  }

  const fullPath = path.resolve(targetWorkspace, targetFile);
  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `Target file not found: ${targetFile}` };
  }

  // Backup file state before patching
  createSnapshot(targetWorkspace, targetFile);

  const currentContent = fs.readFileSync(fullPath, 'utf8');
  if (!currentContent.includes(targetOriginal)) {
    return { success: false, error: 'Target original code snippet not found in target file context' };
  }

  const patchedContent = currentContent.replace(targetOriginal, targetReplacement);
  fs.writeFileSync(fullPath, patchedContent, 'utf8');

  return {
    success: true,
    filePath: targetFile,
    linesAdded: targetReplacement.split('\n').length - targetOriginal.split('\n').length + 1,
    patchSummary: 'Added null check for database user lookup prior to password property dereference'
  };
}

/**
 * Rollback applied patch
 */
function rollbackPatch(workspaceDir, filePath) {
  let targetWorkspace = workspaceDir;
  let targetFile = filePath;

  if (filePath === undefined) {
    targetFile = workspaceDir;
    targetWorkspace = activeWorkspaceDir;
  }

  const fullPath = path.resolve(targetWorkspace, targetFile);
  if (!fileSnapshots.has(fullPath)) {
    return { success: false, error: 'No snapshot recorded for file' };
  }
  const backupContent = fileSnapshots.get(fullPath);
  fs.writeFileSync(fullPath, backupContent, 'utf8');
  return { success: true, filePath: targetFile, message: 'Successfully rolled back file to pre-patch state' };
}

/**
 * Rollback all snapshots associated with a workspaceDir
 */
function rollbackAllWorkspacePatches(workspaceDir = activeWorkspaceDir) {
  const snappedFiles = workspaceSnapshots.get(workspaceDir);
  if (snappedFiles) {
    console.log(`[controlledTools] Reverting all snapshots for workspace: ${workspaceDir}`);
    for (const fullPath of snappedFiles) {
      if (fileSnapshots.has(fullPath)) {
        const backupContent = fileSnapshots.get(fullPath);
        fs.writeFileSync(fullPath, backupContent, 'utf8');
      }
    }
  }
}

module.exports = {
  listFiles,
  readFile,
  searchCode,
  reproduceFailure,
  applyPatch,
  rollbackPatch,
  createSnapshot,
  rollbackAllWorkspacePatches,
  setActiveWorkspaceDir,
  DEMO_API_DIR
};
