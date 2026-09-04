const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', 'coverage', '.turbo']);

/**
 * Searches for OpenAPI / Swagger specifications in the workspace.
 * @param {string} workingDir 
 * @returns {Array<object>} Discovered OpenAPI endpoints
 */
function discoverOpenApiEndpoints(workingDir) {
  const endpoints = [];
  const specFiles = ['swagger.json', 'openapi.json', 'swagger.yaml', 'openapi.yaml'];

  for (const specName of specFiles) {
    const specPath = path.join(workingDir, specName);
    if (fs.existsSync(specPath) && specName.endsWith('.json')) {
      try {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const paths = spec.paths || {};

        for (const [routePath, operations] of Object.entries(paths)) {
          for (const [method, opDetails] of Object.entries(operations)) {
            const normalizedMethod = method.toUpperCase();
            if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(normalizedMethod)) {
              const hasSecurity = Boolean(opDetails.security || spec.security);
              endpoints.push({
                id: `ep_openapi_${endpoints.length + 1}`,
                method: normalizedMethod,
                path: routePath,
                sourceFile: specName,
                sourceLine: 1,
                discoveryMethod: 'openapi',
                authRequired: hasSecurity,
                description: opDetails.summary || opDetails.description || '',
                suggestedPayload: opDetails.requestBody ? {} : null
              });
            }
          }
        }
      } catch (e) {
        console.warn(`[ApiDiscovery] Warning parsing ${specName}:`, e.message);
      }
    }
  }

  return endpoints;
}

/**
 * Recursively inspects JavaScript/TypeScript files in workspace to extract routes.
 * @param {string} workingDir 
 * @returns {Array<object>} Discovered source endpoints
 */
function discoverSourceEndpoints(workingDir) {
  const endpoints = [];
  const routerMounts = new Map(); // VariableName -> BasePrefix (e.g. 'authRoutes' -> '/api/auth')

  // Step 1: Find all js/ts files
  const files = [];
  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (/\.(js|ts|mjs|cjs)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  scan(workingDir);

  // Step 2: Scan for router mounts in server/app files (e.g. app.use('/api/auth', authRouter))
  for (const fullPath of files) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        // Match app.use('/api/auth', authRoutes) or app.use('/api', apiRouter)
        const mountMatch = line.match(/(?:app|router)\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z0-9_$]+)\s*\)/);
        if (mountMatch) {
          const prefix = mountMatch[1];
          const routerVar = mountMatch[2];
          routerMounts.set(routerVar, prefix);
        }
      }
    } catch (e) {}
  }

  // Step 3: Scan each file for route definitions
  for (const fullPath of files) {
    const relFile = path.relative(workingDir, fullPath).replace(/\\/g, '/');
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      // Check if file is associated with a router mount prefix
      let filePrefix = '';
      const baseName = path.basename(fullPath, path.extname(fullPath));
      for (const [varName, prefix] of routerMounts.entries()) {
        if (varName.toLowerCase().includes(baseName.toLowerCase()) || relFile.toLowerCase().includes(varName.toLowerCase())) {
          filePrefix = prefix;
          break;
        }
      }

      // If in routes directory with name like authRoutes.js -> default prefix /api/auth
      if (!filePrefix && relFile.includes('routes/')) {
        const routeName = baseName.replace(/(Routes|Router|Controller)$/i, '');
        if (routeName && routeName !== 'index') {
          filePrefix = `/api/${routeName.toLowerCase()}`;
        }
      }

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();

        // Express / Fastify style: (app|router).(get|post|put|delete|patch)('path', ...)
        const routeMatch = trimmed.match(/(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/i);
        if (routeMatch) {
          const method = routeMatch[1].toUpperCase();
          let subPath = routeMatch[2];

          // Construct full path
          let fullRoute = subPath;
          if (filePrefix && !subPath.startsWith(filePrefix)) {
            fullRoute = `${filePrefix.replace(/\/$/, '')}/${subPath.replace(/^\//, '')}`;
          }
          if (!fullRoute.startsWith('/')) {
            fullRoute = '/' + fullRoute;
          }

          // Check if auth is required on this line
          const hasAuth = /(requireAuth|authMiddleware|verifyToken|passport\.authenticate|isAuthenticated|jwtAuth|protect)/i.test(trimmed);

          // Build suggested payload based on route keywords
          let suggestedPayload = null;
          if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            if (/login/i.test(fullRoute)) {
              suggestedPayload = { email: 'nonexistent_test_user@apifix.ai', password: 'testpassword123' };
            } else if (/register|signup/i.test(fullRoute)) {
              suggestedPayload = { email: `test_${Date.now()}@apifix.ai`, password: 'Password123!', name: 'Test User' };
            } else {
              suggestedPayload = { testProbe: true };
            }
          }

          // Avoid duplicate entries
          const exists = endpoints.some(e => e.method === method && e.path === fullRoute);
          if (!exists) {
            endpoints.push({
              id: `ep_src_${endpoints.length + 1}`,
              method,
              path: fullRoute,
              sourceFile: relFile,
              sourceLine: lineNum,
              discoveryMethod: 'source-analysis',
              authRequired: hasAuth,
              suggestedPayload
            });
          }
        }

        // NestJS style: @Get('users') / @Post('login')
        const nestMatch = trimmed.match(/@(Get|Post|Put|Delete|Patch)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/i);
        if (nestMatch) {
          const method = nestMatch[1].toUpperCase();
          const sub = nestMatch[2] || '';
          let fullRoute = sub ? (sub.startsWith('/') ? sub : `/${sub}`) : '/';
          if (filePrefix) {
            fullRoute = `${filePrefix.replace(/\/$/, '')}${fullRoute}`;
          }

          const hasAuth = /UseGuards\s*\(\s*AuthGuard/i.test(content);
          const exists = endpoints.some(e => e.method === method && e.path === fullRoute);
          if (!exists) {
            endpoints.push({
              id: `ep_nest_${endpoints.length + 1}`,
              method,
              path: fullRoute,
              sourceFile: relFile,
              sourceLine: lineNum,
              discoveryMethod: 'source-analysis',
              authRequired: hasAuth,
              suggestedPayload: method !== 'GET' ? { testProbe: true } : null
            });
          }
        }
      });
    } catch (e) {}
  }

  // Step 4: Next.js API Routes (pages/api/** or app/api/**/route.ts)
  for (const fullPath of files) {
    const relFile = path.relative(workingDir, fullPath).replace(/\\/g, '/');
    if (relFile.startsWith('pages/api/') || relFile.startsWith('src/pages/api/')) {
      const routePath = '/' + relFile.replace(/^(src\/)?pages\//, '').replace(/\.(js|ts)$/, '');
      if (!endpoints.some(e => e.path === routePath)) {
        endpoints.push({
          id: `ep_next_${endpoints.length + 1}`,
          method: 'GET',
          path: routePath,
          sourceFile: relFile,
          sourceLine: 1,
          discoveryMethod: 'source-analysis',
          authRequired: false,
          suggestedPayload: null
        });
      }
    }
  }

  return endpoints;
}

/**
 * Discovers all API endpoints for a project in working directory.
 * @param {string} workingDir 
 * @returns {Array<object>} Unified list of discovered endpoints
 */
function discoverProjectEndpoints(workingDir) {
  if (!fs.existsSync(workingDir)) {
    throw new Error(`Working directory does not exist: ${workingDir}`);
  }

  const openApiEndpoints = discoverOpenApiEndpoints(workingDir);
  const sourceEndpoints = discoverSourceEndpoints(workingDir);

  // Combine and deduplicate
  const seen = new Set();
  const combined = [];

  for (const ep of [...openApiEndpoints, ...sourceEndpoints]) {
    const key = `${ep.method}:${ep.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(ep);
    }
  }

  return combined;
}

module.exports = {
  discoverOpenApiEndpoints,
  discoverSourceEndpoints,
  discoverProjectEndpoints
};
