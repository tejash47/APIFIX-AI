const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const INSTALL_TIMEOUT_MS = parseInt(process.env.INSTALL_TIMEOUT_MS || '120000', 10); // 2 minutes max

/**
 * Determines appropriate package manager and install command based on lockfiles.
 * @param {string} workingDir 
 */
function resolveInstallCommand(workingDir) {
  const hasPackageLock = fs.existsSync(path.join(workingDir, 'package-lock.json'));
  const hasNpmShrinkwrap = fs.existsSync(path.join(workingDir, 'npm-shrinkwrap.json'));
  const hasYarnLock = fs.existsSync(path.join(workingDir, 'yarn.lock'));
  const hasPnpmLock = fs.existsSync(path.join(workingDir, 'pnpm-lock.yaml'));

  if (hasPackageLock || hasNpmShrinkwrap) {
    return {
      manager: 'npm',
      command: 'npm ci --no-audit --no-fund --ignore-scripts',
      fallbackCommand: 'npm install --no-audit --no-fund --ignore-scripts'
    };
  }

  if (hasYarnLock) {
    return {
      manager: 'yarn',
      command: 'yarn install --frozen-lockfile --ignore-scripts --non-interactive',
      fallbackCommand: 'npm install --no-audit --no-fund --ignore-scripts'
    };
  }

  if (hasPnpmLock) {
    return {
      manager: 'pnpm',
      command: 'pnpm install --frozen-lockfile --ignore-scripts',
      fallbackCommand: 'npm install --no-audit --no-fund --ignore-scripts'
    };
  }

  return {
    manager: 'npm',
    command: 'npm install --no-audit --no-fund --ignore-scripts',
    fallbackCommand: 'npm install --no-audit --no-fund --ignore-scripts'
  };
}

/**
 * Prepares dependencies for a Node.js project in working directory.
 * @param {string} workingDir - Path to working workspace
 * @param {Function} onLog - Optional logger callback
 * @returns {Promise<object>}
 */
async function ensureDependencies(workingDir, onLog = console.log) {
  const pkgJsonPath = path.join(workingDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error('Cannot install dependencies: package.json not found in working directory.');
  }

  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch (e) {
    throw new Error(`Malformed package.json: ${e.message}`);
  }

  const hasDeps = Boolean(
    (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
    (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0)
  );

  if (!hasDeps) {
    onLog('[DependencyInstaller] No dependencies declared in package.json.');
    return { success: true, skipped: true, reason: 'No dependencies required' };
  }

  // Check if node_modules already exists and has contents
  const nodeModulesDir = path.join(workingDir, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    const entries = fs.readdirSync(nodeModulesDir);
    if (entries.length > 0) {
      onLog('[DependencyInstaller] node_modules already present in workspace, reusing existing modules.');
      return { success: true, skipped: true, reason: 'node_modules already populated' };
    }
  }

  // Fast dependency cache check:
  const cacheCandidates = [
    path.resolve(__dirname, '../../../demo-api/node_modules'),
    path.resolve(__dirname, '../../storage/cache/node_modules'),
    path.resolve(__dirname, '../../node_modules')
  ];

  const requiredPackages = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
  for (const cacheDir of cacheCandidates) {
    if (fs.existsSync(cacheDir)) {
      const allPresent = requiredPackages.every(pkgName => {
        return fs.existsSync(path.join(cacheDir, pkgName)) || fs.existsSync(path.join(cacheDir, pkgName.split('/')[0]));
      });

      if (allPresent && requiredPackages.length > 0) {
        try {
          onLog(`[DependencyInstaller] Fast-copying pre-warmed dependency cache from ${path.basename(path.dirname(cacheDir))}...`);
          fs.cpSync(cacheDir, nodeModulesDir, { recursive: true });
          onLog('[DependencyInstaller] Dependencies successfully populated from fast local cache.');
          return { success: true, manager: 'cache', cached: true };
        } catch (copyErr) {
          onLog(`[DependencyInstaller] Cache copy failed, falling back to package manager: ${copyErr.message}`);
        }
      }
    }
  }

  // Determine install command
  const plan = resolveInstallCommand(workingDir);
  onLog(`[DependencyInstaller] Executing dependency installation with ${plan.manager} (${plan.command})...`);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Dependency installation timed out after ${INSTALL_TIMEOUT_MS / 1000}s.`));
    }, INSTALL_TIMEOUT_MS);

    exec(plan.command, {
      cwd: workingDir,
      timeout: INSTALL_TIMEOUT_MS,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        CI: 'true'
      }
    }, (error, stdout, stderr) => {
      clearTimeout(timer);
      if (error) {
        onLog(`[DependencyInstaller] Primary install command failed: ${error.message}. Attempting fallback...`);
        // Attempt fallback command
        exec(plan.fallbackCommand, {
          cwd: workingDir,
          timeout: INSTALL_TIMEOUT_MS,
          env: {
            ...process.env,
            NODE_ENV: 'development',
            CI: 'true'
          }
        }, (fbError, fbStdout, fbStderr) => {
          if (fbError) {
            return reject(new Error(`Dependency installation failed: ${fbError.message}\n${fbStderr || fbStdout}`));
          }
          onLog('[DependencyInstaller] Dependencies successfully installed via fallback.');
          resolve({ success: true, manager: plan.manager, output: fbStdout });
        });
      } else {
        onLog('[DependencyInstaller] Dependencies successfully installed.');
        resolve({ success: true, manager: plan.manager, output: stdout });
      }
    });
  });
}

module.exports = {
  resolveInstallCommand,
  ensureDependencies
};
