const fs = require('fs');
const path = require('path');

const MAX_SNIPPET_LINES = 100;
const MAX_SEARCH_RESULTS = 10;
const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', 'coverage', '.turbo']);

/**
 * Extracts stack trace file locations and error messages from stderr logs.
 * @param {string} stderrText 
 * @returns {object} { errorMessage, errorType, frames: Array<{ file, line, column, raw }> }
 */
function parseStackTrace(stderrText) {
  if (!stderrText || typeof stderrText !== 'string') {
    return { errorMessage: '', errorType: '', frames: [] };
  }

  // Match Error Type and Message (e.g. "TypeError: Cannot read properties of null (reading 'password')")
  const errorMatch = stderrText.match(/([A-Z][a-zA-Z0-9_$]*Error):\s*([^\n\r]+)/);
  const errorType = errorMatch ? errorMatch[1] : '';
  const errorMessage = errorMatch ? errorMatch[2].trim() : '';

  const frames = [];
  // Match standard Node.js V8 stack frame lines: "at functionName (path/to/file.js:14:22)" or "at path/to/file.js:14:22"
  const frameRegex = /at\s+(?:([^\s(]+)\s+\(([^)]+)\)|([^\s]+))/g;
  let match;

  while ((match = frameRegex.exec(stderrText)) !== null) {
    const locationStr = match[2] || match[3] || '';
    const locMatch = locationStr.match(/(.+?):(\d+)(?::(\d+))?$/);
    if (locMatch) {
      const rawFilePath = locMatch[1];
      const line = parseInt(locMatch[2], 10);
      const column = locMatch[3] ? parseInt(locMatch[3], 10) : null;

      // Ignore node internal modules (e.g. node:internal/*)
      if (!rawFilePath.startsWith('node:') && !rawFilePath.includes('node_modules')) {
        frames.push({
          raw: match[0],
          file: rawFilePath.replace(/\\/g, '/'),
          line,
          column
        });
      }
    }
  }

  return {
    errorType,
    errorMessage,
    frames
  };
}

/**
 * Reads bounded source lines safely from working workspace, blocking any path traversal.
 * @param {string} workingDir - Base working workspace
 * @param {string} relativeFilePath - Relative or normalized path to file
 * @param {number} startLine - 1-indexed start line
 * @param {number} endLine - 1-indexed end line
 * @returns {object} { file, startLine, endLine, content, totalLines }
 */
function readSourceSnippet(workingDir, relativeFilePath, startLine = 1, endLine = 100) {
  // Normalize and prevent traversal escaping workingDir
  const normalizedRel = path.normalize(relativeFilePath).replace(/^[\\\/]+/, '');
  const absoluteTarget = path.resolve(workingDir, normalizedRel);

  if (!absoluteTarget.startsWith(workingDir)) {
    throw new Error(`Security Violation: Path traversal outside working workspace detected: "${relativeFilePath}".`);
  }

  if (!fs.existsSync(absoluteTarget)) {
    throw new Error(`Source file not found in workspace: "${relativeFilePath}".`);
  }

  const rawContent = fs.readFileSync(absoluteTarget, 'utf8');
  const allLines = rawContent.split('\n');

  const sLine = Math.max(1, startLine);
  const eLine = Math.min(allLines.length, Math.max(sLine, endLine));

  if (eLine - sLine > MAX_SNIPPET_LINES) {
    throw new Error(`Requested line range (${eLine - sLine + 1} lines) exceeds maximum allowed snippet limit of ${MAX_SNIPPET_LINES} lines.`);
  }

  const sliced = allLines.slice(sLine - 1, eLine);
  const numberedContent = sliced
    .map((line, idx) => `${String(sLine + idx).padStart(4, ' ')} | ${line}`)
    .join('\n');

  return {
    file: relativeFilePath.replace(/\\/g, '/'),
    startLine: sLine,
    endLine: eLine,
    content: numberedContent,
    rawLines: sliced,
    totalLines: allLines.length
  };
}

/**
 * Read-only search within working workspace files for symbol/query.
 * @param {string} workingDir 
 * @param {string} query 
 */
function searchWorkspaceSymbols(workingDir, query) {
  const matches = [];
  function scan(dir) {
    if (!fs.existsSync(dir) || matches.length >= MAX_SEARCH_RESULTS) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (/\.(js|ts|json|py|mjs|cjs)$/.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
              matches.push({
                file: path.relative(workingDir, fullPath).replace(/\\/g, '/'),
                line: i + 1,
                snippet: lines[i].trim()
              });
              if (matches.length >= MAX_SEARCH_RESULTS) break;
            }
          }
        } catch (e) {}
      }
    }
  }
  scan(workingDir);
  return matches;
}

/**
 * Retrieves structured failure evidence for a run from runs storage.
 * @param {string} workingDir 
 * @param {string} runId 
 */
function getRunEvidence(workingDir, runId) {
  const evidencePath = path.resolve(workingDir, '../runs', runId, 'evidence.json');
  if (!fs.existsSync(evidencePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

module.exports = {
  parseStackTrace,
  readSourceSnippet,
  searchWorkspaceSymbols,
  getRunEvidence
};
