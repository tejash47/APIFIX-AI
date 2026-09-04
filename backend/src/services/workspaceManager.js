const fs = require('fs');
const path = require('path');

const STORAGE_ROOT = path.resolve(__dirname, '../../storage/projects');

// Ensure root storage directory exists
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

/**
 * Get filesystem paths for a project workspace
 * @param {string} projectId 
 */
function getProjectPaths(projectId) {
  const projectDir = path.join(STORAGE_ROOT, projectId);
  return {
    projectDir,
    originalDir: path.join(projectDir, 'original'),
    workingDir: path.join(projectDir, 'working'),
    runsDir: path.join(projectDir, 'runs')
  };
}

/**
 * Deep copy directory recursively, filtering out volatile files
 * @param {string} src 
 * @param {string} dest 
 */
function copyDirectorySync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (['node_modules', '.git', '.next', '.turbo', 'dist', 'build', '__pycache__', '.DS_Store'].includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Initializes workspace directory layout for a new project
 * @param {string} projectId 
 * @returns {object} Workspace paths
 */
function initializeProjectWorkspace(projectId) {
  const paths = getProjectPaths(projectId);

  if (!fs.existsSync(paths.originalDir)) {
    fs.mkdirSync(paths.originalDir, { recursive: true });
  }
  if (!fs.existsSync(paths.workingDir)) {
    fs.mkdirSync(paths.workingDir, { recursive: true });
  }
  if (!fs.existsSync(paths.runsDir)) {
    fs.mkdirSync(paths.runsDir, { recursive: true });
  }

  return paths;
}

/**
 * Prepares the working copy from the immutable original workspace
 * @param {string} projectId 
 * @param {string} selectedRelativePath - Relative subpath of selected project root (e.g. '.' or 'backend')
 */
function prepareWorkingWorkspace(projectId, selectedRelativePath = '.') {
  const paths = getProjectPaths(projectId);
  const targetSource = selectedRelativePath === '.' 
    ? paths.originalDir 
    : path.join(paths.originalDir, selectedRelativePath);

  if (!fs.existsSync(targetSource)) {
    throw new Error(`Target source path does not exist in immutable original workspace: ${selectedRelativePath}`);
  }

  // Clear existing working directory cleanly before copying
  if (fs.existsSync(paths.workingDir)) {
    fs.rmSync(paths.workingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(paths.workingDir, { recursive: true });

  // Copy from original to working
  copyDirectorySync(targetSource, paths.workingDir);

  return {
    workingDir: paths.workingDir,
    sourceOriginal: targetSource
  };
}

/**
 * Creates an isolated run directory under the project workspace
 * @param {string} projectId 
 * @param {string} runId 
 */
function initializeRunWorkspace(projectId, runId) {
  const paths = getProjectPaths(projectId);
  const runPath = path.join(paths.runsDir, runId);

  if (!fs.existsSync(runPath)) {
    fs.mkdirSync(runPath, { recursive: true });
  }

  return runPath;
}

module.exports = {
  STORAGE_ROOT,
  getProjectPaths,
  copyDirectorySync,
  initializeProjectWorkspace,
  prepareWorkingWorkspace,
  initializeRunWorkspace
};
