const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { waitForPortReady } = require('./portManager');

const STARTUP_TIMEOUT_MS = parseInt(process.env.STARTUP_TIMEOUT_MS || '15000', 10);
const MAX_RUN_TIME_MS = parseInt(process.env.MAX_RUN_TIME_MS || '60000', 10);
const MAX_LOG_SIZE_BYTES = 100 * 1024; // 100 KB

// Tracks active child processes by runId: runId -> { process, port, workingDir, stdout, stderr, startTime }
const activeProcesses = new Map();

/**
 * Sanitizes the host environment to prevent exposing APIFIX control plane secrets to child processes.
 * @param {number} port 
 */
function createSanitizedEnv(port) {
  const allowedKeys = [
    'PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP',
    'HOMEDRIVE', 'HOMEPATH', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'COMSPEC', 'windir', 'PROGRAMFILES', 'ProgramFiles(x86)',
    'NODE_PATH', 'NODE_OPTIONS', 'LANG', 'LC_ALL'
  ];

  const sanitized = {};
  for (const key of allowedKeys) {
    if (process.env[key]) {
      sanitized[key] = process.env[key];
    }
  }

  // Inject execution runtime settings
  sanitized['PORT'] = String(port);
  sanitized['HOST'] = '127.0.0.1';
  sanitized['NODE_ENV'] = 'development';
  sanitized['CI'] = 'true';

  // Explicit safety block against any secrets
  const forbiddenSubstrings = ['SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'SUPABASE', 'OPENAI', 'ANTHROPIC', 'GEMINI', 'AUTH', 'STRIPE', 'GITHUB'];
  for (const key of Object.keys(sanitized)) {
    if (forbiddenSubstrings.some(sub => key.toUpperCase().includes(sub))) {
      delete sanitized[key];
    }
  }

  return sanitized;
}

/**
 * Determines the startup command and arguments from package.json or source files.
 * @param {string} workingDir 
 */
function resolveStartCommand(workingDir) {
  const pkgPath = path.join(workingDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const scripts = pkg.scripts || {};

      if (scripts.start) {
        return {
          type: 'npm',
          command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
          args: ['start'],
          displayCommand: 'npm start',
          framework: pkg.dependencies?.express ? 'Express' : (pkg.dependencies?.fastify ? 'Fastify' : 'Node.js')
        };
      }

      if (scripts.dev) {
        return {
          type: 'npm',
          command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
          args: ['run', 'dev'],
          displayCommand: 'npm run dev',
          framework: pkg.dependencies?.next ? 'Next.js' : 'Node.js'
        };
      }

      if (scripts.serve) {
        return {
          type: 'npm',
          command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
          args: ['run', 'serve'],
          displayCommand: 'npm run serve',
          framework: 'Node.js'
        };
      }

      if (pkg.main && fs.existsSync(path.join(workingDir, pkg.main))) {
        return {
          type: 'node',
          command: 'node',
          args: [pkg.main],
          displayCommand: `node ${pkg.main}`,
          framework: 'Node.js'
        };
      }
    } catch (e) {}
  }

  // Check common entry files
  const candidates = [
    'src/server.js',
    'src/index.js',
    'src/app.js',
    'src/main.js',
    'server.js',
    'index.js',
    'app.js',
    'main.js'
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(workingDir, candidate))) {
      return {
        type: 'node',
        command: 'node',
        args: [candidate],
        displayCommand: `node ${candidate}`,
        framework: 'Node.js'
      };
    }
  }

  throw new Error('START COMMAND NOT DETECTED: No executable start script or entrypoint found in project.');
}

/**
 * Starts the application child process in the isolated working workspace.
 * @param {string} runId 
 * @param {string} workingDir 
 * @param {number} port 
 * @param {Function} onLog 
 * @returns {Promise<object>}
 */
async function startApplicationProcess(runId, workingDir, port, onLog = console.log) {
  // Ensure any previous process for this runId is cleaned up
  await stopProcess(runId);

  const startPlan = resolveStartCommand(workingDir);
  const env = createSanitizedEnv(port);

  onLog(`[ProcessManager] Launching application on port ${port} using: "${startPlan.displayCommand}" in working workspace...`);

  const child = spawn(startPlan.command, startPlan.args, {
    cwd: workingDir,
    env,
    shell: true,
    windowsHide: true
  });

  const record = {
    runId,
    pid: child.pid,
    process: child,
    port,
    workingDir,
    displayCommand: startPlan.displayCommand,
    framework: startPlan.framework,
    stdout: '',
    stderr: '',
    exitCode: null,
    crashed: false,
    startTime: Date.now()
  };

  activeProcesses.set(runId, record);

  child.stdout.on('data', (data) => {
    const text = data.toString();
    if (record.stdout.length < MAX_LOG_SIZE_BYTES) {
      record.stdout += text;
    }
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    if (record.stderr.length < MAX_LOG_SIZE_BYTES) {
      record.stderr += text;
    }
  });

  child.on('exit', (code, signal) => {
    record.exitCode = code;
    if (code !== 0 && code !== null) {
      record.crashed = true;
      onLog(`[ProcessManager] Child process exited with code ${code}, signal: ${signal}`);
    }
  });

  // Setup maximum lifetime guard
  const runTimer = setTimeout(() => {
    onLog(`[ProcessManager] Run ${runId} exceeded MAX_RUN_TIME limit (${MAX_RUN_TIME_MS / 1000}s). Terminating process.`);
    stopProcess(runId);
  }, MAX_RUN_TIME_MS);
  record.runTimer = runTimer;

  // Poll for port readiness
  onLog(`[ProcessManager] Waiting for port ${port} to open (timeout: ${STARTUP_TIMEOUT_MS / 1000}s)...`);
  const isReady = await waitForPortReady(port, STARTUP_TIMEOUT_MS);

  if (!isReady) {
    // Check if process crashed immediately
    if (record.crashed || record.exitCode !== null) {
      const errDetail = record.stderr.trim() || record.stdout.trim() || `Process exited with code ${record.exitCode}`;
      await stopProcess(runId);
      throw new Error(`STARTUP_FAILURE: Application process crashed during startup.\n${errDetail}`);
    }

    await stopProcess(runId);
    throw new Error(`TIMEOUT: Application failed to start listening on port ${port} within ${STARTUP_TIMEOUT_MS / 1000}s.`);
  }

  onLog(`[ProcessManager] Application successfully initialized on port ${port}.`);

  return {
    runId,
    pid: child.pid,
    port,
    command: startPlan.displayCommand,
    framework: startPlan.framework,
    workingDir
  };
}

/**
 * Safely stops and terminates the child process and its process tree.
 * @param {string} runId 
 */
async function stopProcess(runId) {
  const record = activeProcesses.get(runId);
  if (!record) return;

  if (record.runTimer) {
    clearTimeout(record.runTimer);
  }

  const pid = record.pid;
  if (pid) {
    try {
      if (process.platform === 'win32') {
        // Force kill process tree on Windows
        await new Promise((resolve) => {
          exec(`taskkill /pid ${pid} /T /F`, () => resolve());
        });
      } else {
        // Unix process group kill
        try {
          process.kill(-pid, 'SIGKILL');
        } catch (e) {
          try { record.process.kill('SIGKILL'); } catch (e2) {}
        }
      }
    } catch (err) {
      console.warn(`[ProcessManager] Warning stopping process ${pid}:`, err.message);
    }
  }

  activeProcesses.delete(runId);
}

/**
 * Gets logs for an active or completed process run
 * @param {string} runId 
 */
function getProcessLogs(runId) {
  const record = activeProcesses.get(runId);
  if (!record) return { stdout: '', stderr: '' };
  return {
    stdout: record.stdout,
    stderr: record.stderr,
    exitCode: record.exitCode
  };
}

/**
 * Stops and kills all currently active sandbox child processes.
 */
async function stopAllProcesses() {
  const runIds = Array.from(activeProcesses.keys());
  for (const runId of runIds) {
    try {
      await stopProcess(runId);
    } catch (e) {}
  }
}

module.exports = {
  STARTUP_TIMEOUT_MS,
  MAX_RUN_TIME_MS,
  createSanitizedEnv,
  resolveStartCommand,
  startApplicationProcess,
  stopProcess,
  stopAllProcesses,
  getProcessLogs
};
