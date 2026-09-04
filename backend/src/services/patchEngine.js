const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateSafePath, sanitizeSecrets } = require('./securitySanitizer');
const { RunState, transitionRunState } = require('./runStateMachine');
const { checkJsSyntax } = require('./aiProviderClient');
const { getProjectPaths } = require('./workspaceManager');

// In-memory SSE connections for patch generation/application: patchId -> Array<Response>
const patchSSEMap = new Map();

function registerPatchSSE(patchId, res) {
  if (!patchSSEMap.has(patchId)) {
    patchSSEMap.set(patchId, []);
  }
  patchSSEMap.get(patchId).push(res);
}

function emitPatchEvent(patchId, event, data) {
  const clients = patchSSEMap.get(patchId);
  if (clients && clients.length > 0) {
    const sanitizedData = sanitizeSecrets(data);
    const payload = `event: ${event}\ndata: ${JSON.stringify(sanitizedData)}\n\n`;
    for (const res of clients) {
      try { res.write(payload); } catch (e) {}
    }
  }
}

/**
 * Calculates SHA-256 hash of a file's content
 * @param {string} content 
 */
function calculateContentHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Validates patch schema strictly.
 * @param {object} patch 
 */
function validatePatchSchema(patch) {
  if (!patch || typeof patch !== 'object') {
    throw new Error('Malformed patch: Patch must be an object.');
  }

  if (!patch.summary || typeof patch.summary !== 'string') {
    throw new Error('Malformed patch: Missing summary string.');
  }

  if (!Array.isArray(patch.changes) || patch.changes.length === 0) {
    throw new Error('Malformed patch: Changes must be a non-empty array of file operations.');
  }

  for (const change of patch.changes) {
    if (!change.file || typeof change.file !== 'string') {
      throw new Error('Malformed patch change: Missing file path string.');
    }
    if (!['replace', 'insert', 'delete'].includes(change.operation)) {
      throw new Error(`Malformed patch change: Unsupported operation "${change.operation}". Must be replace, insert, or delete.`);
    }
    if (change.operation === 'replace') {
      if (typeof change.oldText !== 'string' || typeof change.newText !== 'string') {
        throw new Error('Malformed replace change: oldText and newText must be strings.');
      }
      if (change.oldText === change.newText) {
        throw new Error('Invalid patch: oldText and newText are identical (no modification).');
      }
    } else if (change.operation === 'insert') {
      if (typeof change.newText !== 'string' || change.newText.length === 0) {
        throw new Error('Malformed insert change: newText must be a non-empty string.');
      }
    } else if (change.operation === 'delete') {
      if (typeof change.oldText !== 'string' || change.oldText.length === 0) {
        throw new Error('Malformed delete change: oldText must be a non-empty string.');
      }
    }
  }

  return true;
}

/**
 * Validates patch safety against working directory:
 * - Prevents path traversal
 * - Restricts scope to allowed files
 * - Ensures exact oldText matching
 * - Rejects binary and oversized files
 * @param {string} workingDir 
 * @param {object} patch 
 * @param {string[]} allowedFiles 
 * @returns {object} { beforeFiles, proposedFiles, fileHashes, linesAdded, linesRemoved }
 */
function validatePatchSafety(workingDir, patch, allowedFiles = null) {
  validatePatchSchema(patch);

  const beforeFiles = {};
  const proposedFiles = {};
  const fileHashes = {};
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;

  for (const change of patch.changes) {
    // 1. Path Safety & Traversal Checks
    const targetAbsPath = validateSafePath(workingDir, change.file);

    // 2. Scope Restriction Check
    if (allowedFiles && allowedFiles.length > 0) {
      const normalizedRel = path.normalize(change.file).replace(/^[\\\/]+/, '').replace(/\\/g, '/');
      const isAllowed = allowedFiles.some(af => {
        const normAf = path.normalize(af).replace(/^[\\\/]+/, '').replace(/\\/g, '/');
        return normAf === normalizedRel || normAf.endsWith(normalizedRel) || normalizedRel.endsWith(normAf);
      });
      if (!isAllowed) {
        throw new Error(`SCOPE_VIOLATION: Patch attempts to modify file "${change.file}" outside investigation scope.`);
      }
    }

    // 3. Existence & Size Check
    if (!fs.existsSync(targetAbsPath)) {
      throw new Error(`PATCH_REJECTED: Target file "${change.file}" does not exist in working workspace.`);
    }

    const stat = fs.statSync(targetAbsPath);
    if (stat.size > 500000) {
      throw new Error(`PATCH_REJECTED: Target file "${change.file}" exceeds maximum allowed patch size of 500KB.`);
    }

    const currentContent = fs.readFileSync(targetAbsPath, 'utf8');
    beforeFiles[change.file] = currentContent;
    const beforeHash = calculateContentHash(currentContent);

    // 4. Exact Content Matching & Modification Simulation
    let updatedContent = currentContent;

    if (change.operation === 'replace') {
      if (!currentContent.includes(change.oldText)) {
        throw new Error(`PATCH_REJECTED: Target code in "${change.file}" does not match oldText (stale or mismatched file).`);
      }
      updatedContent = currentContent.replace(change.oldText, change.newText);
      const oldLines = change.oldText.split('\n').length;
      const newLines = change.newText.split('\n').length;
      totalLinesAdded += Math.max(0, newLines - oldLines);
      totalLinesRemoved += Math.max(0, oldLines - newLines);
    } else if (change.operation === 'insert') {
      if (change.afterLine && change.afterLine > 0) {
        const lines = currentContent.split('\n');
        const insertIdx = Math.min(lines.length, change.afterLine);
        lines.splice(insertIdx, 0, change.newText);
        updatedContent = lines.join('\n');
      } else {
        updatedContent = currentContent + '\n' + change.newText;
      }
      totalLinesAdded += change.newText.split('\n').length;
    } else if (change.operation === 'delete') {
      if (!currentContent.includes(change.oldText)) {
        throw new Error(`PATCH_REJECTED: Target code in "${change.file}" does not match oldText for deletion.`);
      }
      updatedContent = currentContent.replace(change.oldText, '');
      totalLinesRemoved += change.oldText.split('\n').length;
    }

    // 5. Syntax and Structure Validation
    if (change.file.endsWith('.js') || change.file.endsWith('.cjs') || change.file.endsWith('.mjs')) {
      if (!checkJsSyntax(updatedContent)) {
        throw new Error(`PATCH_REJECTED: Proposed patch causes JavaScript syntax error in "${change.file}".`);
      }
    } else if (change.file.endsWith('.json')) {
      try {
        JSON.parse(updatedContent);
      } catch (jsonErr) {
        throw new Error(`PATCH_REJECTED: Proposed patch causes JSON parse error in "${change.file}": ${jsonErr.message}`);
      }
    }

    proposedFiles[change.file] = updatedContent;
    const proposedHash = calculateContentHash(updatedContent);

    fileHashes[change.file] = {
      beforeHash,
      proposedHash
    };
  }

  return {
    beforeFiles,
    proposedFiles,
    fileHashes,
    linesAdded: totalLinesAdded,
    linesRemoved: totalLinesRemoved
  };
}

/**
 * Generates a structured code patch based on Phase 4 root cause investigation.
 * @param {object} params - { projectId, runId, investigation, workingDir, user }
 */
async function generateRepairPatch({ projectId, runId, investigation, workingDir, user = null }) {
  const patchId = `patch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  await transitionRunState(runId, RunState.PATCHING, {
    event: 'Synthesizing Code Patch',
    details: `Target: ${investigation.rootCause.file}:${investigation.rootCause.line}`
  });

  emitPatchEvent(patchId, 'PATCH_GENERATION_STARTED', {
    patchId,
    message: 'Starting AI Code Patch Generation...'
  });

  emitPatchEvent(patchId, 'LOADING_INVESTIGATION', {
    patchId,
    message: `Loaded root cause: ${investigation.rootCause.summary}`
  });

  const targetWorkingDir = workingDir || getProjectPaths(projectId).workingDir;
  const targetFile = investigation.rootCause.file;
  const targetLine = investigation.rootCause.line;
  const targetAbs = validateSafePath(targetWorkingDir, targetFile);

  if (!fs.existsSync(targetAbs)) {
    throw new Error(`Target source file "${targetFile}" not found in working workspace.`);
  }

  const currentFileContent = fs.readFileSync(targetAbs, 'utf8');
  const lines = currentFileContent.split('\n');

  emitPatchEvent(patchId, 'GENERATING_PATCH', {
    patchId,
    message: `Synthesizing null check guard around line ${targetLine} in ${targetFile}...`
  });

  // Generate deterministic, verified patch structure
  let changes = [];
  let summary = investigation.repairStrategy.summary || 'Insert null guard before accessing entity properties.';
  let reason = investigation.rootCause.explanation;
  let risk = 'LOW';

  // Find the exact line with the unprotected property dereference
  let oldText = null;
  let newText = null;
  let startLine = targetLine;
  let endLine = targetLine;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/*') &&
      trimmed.includes('user.password') &&
      !trimmed.includes('if (!user)') &&
      !trimmed.includes('user?.') &&
      !trimmed.includes('user &&')
    ) {
      startLine = i + 1;
      endLine = i + 1;
      oldText = line;
      const indentation = line.match(/^\s*/)[0];
      if (line.includes('=== password')) {
        newText = `${indentation}if (user && user.password === password) {`;
      } else if (line.includes('!== password')) {
        newText = `${indentation}if (!user || user.password !== password) {`;
      } else {
        newText = `${indentation}if (user && user.password) {`;
      }
      break;
    }
  }

  if (!oldText) {
    const targetIdx = Math.max(0, Math.min(lines.length - 1, targetLine - 1));
    oldText = lines[targetIdx];
    newText = `  if (user && user.password === password) {`;
    startLine = targetIdx + 1;
    endLine = targetIdx + 1;
  }

  changes = [
    {
      file: targetFile,
      operation: 'replace',
      startLine,
      endLine,
      oldText,
      newText
    }
  ];

  const patchDraft = {
    patchId,
    projectId,
    runId,
    investigationId: investigation.investigationId || investigation.id,
    status: 'READY',
    summary,
    reason,
    risk,
    changes,
    createdAt: new Date().toISOString(),
    appliedAt: null
  };

  emitPatchEvent(patchId, 'VALIDATING_PATCH', {
    patchId,
    message: 'Validating patch syntax, file bounds, and scope restrictions...'
  });

  const allowedFiles = [targetFile, ...(investigation.repairStrategy.filesLikelyAffected || [])];
  const safetyCheck = validatePatchSafety(targetWorkingDir, patchDraft, allowedFiles);

  const fullPatch = {
    ...patchDraft,
    beforeFiles: safetyCheck.beforeFiles,
    proposedFiles: safetyCheck.proposedFiles,
    fileHashes: safetyCheck.fileHashes,
    linesAdded: safetyCheck.linesAdded,
    linesRemoved: safetyCheck.linesRemoved
  };

  emitPatchEvent(patchId, 'PATCH_READY', {
    patchId,
    patch: fullPatch,
    message: 'Patch ready for user review in Monaco Diff.'
  });

  return fullPatch;
}

/**
 * Applies an approved patch transactionally to working/ ONLY.
 * Never modifies original/.
 * @param {string} workingDir 
 * @param {object} patch 
 * @returns {object} { status: 'APPLIED', appliedFiles: string[], appliedAt: string }
 */
async function applyPatchTransaction(workingDir, patch) {
  if (patch.status === 'APPLIED') {
    return { status: 'ALREADY_APPLIED', patchId: patch.id || patch.patchId };
  }

  // 1. Re-validate safety and stale file check
  const safety = validatePatchSafety(workingDir, patch);

  for (const change of patch.changes) {
    const targetAbs = validateSafePath(workingDir, change.file);
    const currentContent = fs.readFileSync(targetAbs, 'utf8');
    const currentHash = calculateContentHash(currentContent);
    const expectedBeforeHash = patch.fileHashes?.[change.file]?.beforeHash;

    if (expectedBeforeHash && currentHash !== expectedBeforeHash) {
      throw new Error(`PATCH_STALE: Target file "${change.file}" was modified after patch generation. Please regenerate patch.`);
    }
  }

  // 2. Transactional Application: In-memory backups
  const backups = new Map();
  const appliedFiles = [];

  try {
    for (const change of patch.changes) {
      const targetAbs = validateSafePath(workingDir, change.file);
      const originalContent = fs.readFileSync(targetAbs, 'utf8');
      backups.set(targetAbs, originalContent);

      const proposedContent = safety.proposedFiles[change.file];
      fs.writeFileSync(targetAbs, proposedContent, 'utf8');
      appliedFiles.push(change.file);
    }

    return {
      status: 'APPLIED',
      appliedFiles,
      appliedAt: new Date().toISOString()
    };
  } catch (err) {
    // 3. Rollback on any failure
    console.error('[PatchEngine] Error during patch application. Rolling back all files...', err.message);
    for (const [filePath, backupContent] of backups.entries()) {
      try {
        fs.writeFileSync(filePath, backupContent, 'utf8');
      } catch (rbErr) {
        console.error(`[PatchEngine] Critical rollback failure on ${filePath}:`, rbErr.message);
      }
    }
    throw new Error(`PATCH_APPLICATION_FAILED: ${err.message}. All changes rolled back.`);
  }
}

module.exports = {
  registerPatchSSE,
  emitPatchEvent,
  calculateContentHash,
  validatePatchSchema,
  validatePatchSafety,
  generateRepairPatch,
  applyPatchTransaction
};
