const fs = require('fs');
const path = require('path');

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  '__pycache__',
  'venv',
  '.venv',
  'env',
  '.env',
  '.idea',
  '.vscode',
  '.DS_Store'
]);

/**
 * Classifies a Node.js project using package.json contents
 * @param {string} packageJsonPath - Path to package.json
 */
function classifyNodeProject(packageJsonPath) {
  let pkg = {};
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    pkg = JSON.parse(raw);
  } catch (e) {
    // Malformed JSON package.json
    return {
      name: path.basename(path.dirname(packageJsonPath)),
      framework: 'node-generic',
      frameworkDisplay: 'Node.js Application',
      dependencies: []
    };
  }

  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {})
  };

  const name = pkg.name || path.basename(path.dirname(packageJsonPath));

  if (allDeps['@nestjs/core'] || allDeps['@nestjs/common']) {
    return { name, framework: 'nestjs', frameworkDisplay: 'NestJS', pkg };
  }
  if (allDeps['next']) {
    return { name, framework: 'nextjs', frameworkDisplay: 'Next.js', pkg };
  }
  if (allDeps['express']) {
    return { name, framework: 'express', frameworkDisplay: 'Express', pkg };
  }
  if (allDeps['fastify']) {
    return { name, framework: 'fastify', frameworkDisplay: 'Fastify', pkg };
  }
  if (allDeps['vite'] || allDeps['react'] || allDeps['vue'] || allDeps['svelte']) {
    return { name, framework: 'vite', frameworkDisplay: 'Vite / Frontend', pkg };
  }

  return { name, framework: 'node-generic', frameworkDisplay: 'Node.js Application', pkg };
}

/**
 * Classifies a Python project using requirements.txt or pyproject.toml
 * @param {string} manifestPath - Path to requirements.txt or pyproject.toml
 */
function classifyPythonProject(manifestPath) {
  const dirName = path.basename(path.dirname(manifestPath));
  let content = '';
  try {
    content = fs.readFileSync(manifestPath, 'utf8').toLowerCase();
  } catch (e) {}

  let framework = 'python-generic';
  let frameworkDisplay = 'Python Application';

  if (content.includes('fastapi')) {
    framework = 'fastapi';
    frameworkDisplay = 'FastAPI';
  } else if (content.includes('django')) {
    framework = 'django';
    frameworkDisplay = 'Django';
  } else if (content.includes('flask')) {
    framework = 'flask';
    frameworkDisplay = 'Flask';
  }

  return {
    name: dirName,
    framework,
    frameworkDisplay
  };
}

/**
 * Recursively scans an extracted workspace directory to locate all project manifests.
 * @param {string} rootDir - Base extracted directory path
 * @param {string} currentDir - Current traversal directory path
 * @param {Array} candidates - Collected candidate projects
 * @param {number} depth - Recursion depth limit
 */
function scanForProjects(rootDir, currentDir = rootDir, candidates = [], depth = 0) {
  if (depth > 6) return candidates; // Safety depth limit

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  const hasPackageJson = entries.some(e => e.isFile() && e.name === 'package.json');
  const hasRequirementsTxt = entries.some(e => e.isFile() && e.name === 'requirements.txt');
  const hasPyprojectToml = entries.some(e => e.isFile() && e.name === 'pyproject.toml');

  const relPath = path.relative(rootDir, currentDir) || '.';
  const hasSrc = entries.some(e => e.isDirectory() && (e.name === 'src' || e.name === 'lib' || e.name === 'app'));
  const hasTests = entries.some(e => e.isDirectory() && (e.name === 'tests' || e.name === 'test' || e.name === '__tests__'));

  if (hasPackageJson) {
    const pkgPath = path.join(currentDir, 'package.json');
    const nodeInfo = classifyNodeProject(pkgPath);

    candidates.push({
      id: `proj_cand_${candidates.length + 1}`,
      name: nodeInfo.name,
      technology: 'node',
      technologyDisplay: 'Node.js',
      framework: nodeInfo.framework,
      frameworkDisplay: nodeInfo.frameworkDisplay,
      manifest: 'package.json',
      relativePath: relPath.replace(/\\/g, '/'),
      absolutePath: currentDir,
      hasSrc,
      hasTests,
      status: 'ready',
      supported: true,
      confidence: 'high'
    });
  } else if (hasRequirementsTxt || hasPyprojectToml) {
    const manifest = hasRequirementsTxt ? 'requirements.txt' : 'pyproject.toml';
    const manifestPath = path.join(currentDir, manifest);
    const pyInfo = classifyPythonProject(manifestPath);

    candidates.push({
      id: `proj_cand_${candidates.length + 1}`,
      name: pyInfo.name,
      technology: 'python',
      technologyDisplay: 'Python',
      framework: pyInfo.framework,
      frameworkDisplay: pyInfo.frameworkDisplay,
      manifest,
      relativePath: relPath.replace(/\\/g, '/'),
      absolutePath: currentDir,
      hasSrc,
      hasTests,
      status: 'DETECTED / NOT YET SUPPORTED FOR EXECUTION',
      supported: false,
      confidence: 'high'
    });
  }

  // Recurse into subdirectories
  for (const entry of entries) {
    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
      const subDir = path.join(currentDir, entry.name);
      scanForProjects(rootDir, subDir, candidates, depth + 1);
    }
  }

  return candidates;
}

/**
 * Discovers and inspects projects within an extracted directory.
 * @param {string} extractedPath - Absolute path to extracted archive root
 * @returns {object} Structured discovery result
 */
function discoverProjects(extractedPath) {
  if (!fs.existsSync(extractedPath)) {
    throw new Error('Extracted directory does not exist.');
  }

  const candidates = scanForProjects(extractedPath);

  if (candidates.length === 0) {
    return {
      success: false,
      error: 'No supported project manifest found (package.json, requirements.txt, pyproject.toml)',
      candidates: []
    };
  }

  const primary = candidates[0];

  return {
    success: true,
    multipleDetected: candidates.length > 1,
    candidateCount: candidates.length,
    selectedCandidate: primary,
    candidates
  };
}

module.exports = {
  discoverProjects,
  classifyNodeProject,
  classifyPythonProject
};
