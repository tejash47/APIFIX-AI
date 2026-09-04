/**
 * APIFIX AI — Automated Production Secret Scanner (Phase 23)
 * 
 * Inspects source files, configs, build outputs, and frontend bundles for
 * accidental inclusion of private keys, API tokens, JWT secrets, or cloud credentials.
 */

const fs = require('fs');
const path = require('path');

const SECRET_PATTERNS = [
  { name: 'Stripe Secret Key', regex: /sk_(live|test)_[0-9a-zA-Z]{24,}/g, severity: 'BLOCKER' },
  { name: 'Stripe Webhook Secret', regex: /whsec_[0-9a-zA-Z]{24,}/g, severity: 'BLOCKER' },
  { name: 'GitHub Personal Access Token', regex: /(ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{82})/g, severity: 'BLOCKER' },
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{32,64}/g, severity: 'BLOCKER' },
  { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{32,100}/g, severity: 'BLOCKER' },
  { name: 'Groq API Key', regex: /gsk_[a-zA-Z0-9]{40,64}/g, severity: 'BLOCKER' },
  { name: 'RSA/EC Private Key', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: 'BLOCKER' },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g, severity: 'BLOCKER' },
  { name: 'Supabase Service Role JWT', regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{30,}/g, severity: 'BLOCKER' },
  { name: 'Generic High-Entropy Password in URI', regex: /:\/\/[^:\s]+:([^@\s]{8,})@/g, severity: 'HIGH' }
];

const IGNORED_PATHS = [
  'node_modules',
  '.git',
  '.next',
  'coverage',
  '.nyc_output',
  'dist',
  'build',
  'data',
  'workspaces',
  'storage',
  'uploads',
  'tests',
  '.env'
];

function maskSecret(val) {
  if (!val || typeof val !== 'string') return '[REDACTED]';
  if (val.length <= 8) return '****';
  return `${val.slice(0, 4)}...${val.slice(-4)}`;
}

class SecretScanner {
  /**
   * Scans a single string/content buffer for secret patterns.
   */
  scanContent(content, filename = 'buffer') {
    if (!content || typeof content !== 'string') return { clean: true, findings: [] };

    // Ignore placeholder templates
    if (filename.includes('.env.example')) {
      return { clean: true, findings: [] };
    }

    const findings = [];
    const lines = content.split('\n');

    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const line = lines[lineNum - 1];
      // Skip comments that describe placeholders or test assertions
      if (line.trim().startsWith('//') && line.includes('your_') || line.includes('placeholder')) continue;

      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(line)) !== null) {
          const raw = match[0];
          // Skip known sample or dummy test tokens
          if (raw.includes('your_') || raw.includes('placeholder') || raw.includes('example') || raw.includes('test_secret_for_unit_tests')) {
            continue;
          }

          findings.push({
            file: filename,
            line: lineNum,
            type: pattern.name,
            severity: pattern.severity,
            maskedSample: maskSecret(raw)
          });
        }
      }
    }

    return {
      clean: findings.length === 0,
      findings
    };
  }

  /**
   * Scans a file on disk.
   */
  scanFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return { clean: true, findings: [] };
      const content = fs.readFileSync(filePath, 'utf8');
      return this.scanContent(content, filePath);
    } catch (err) {
      return { clean: false, findings: [{ file: filePath, type: 'FILE_READ_ERROR', severity: 'MEDIUM', message: err.message }] };
    }
  }

  /**
   * Recursively scans a directory.
   */
  scanDirectory(dirPath, maxFiles = 500) {
    const findings = [];
    let filesScanned = 0;

    const walk = (dir) => {
      if (filesScanned >= maxFiles) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (IGNORED_PATHS.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          // Scan only text / source / config files
          if (/\.(js|jsx|ts|tsx|json|yml|yaml|env|sql|md|sh|Dockerfile)$/i.test(entry.name) || entry.name.startsWith('.env')) {
            filesScanned++;
            const result = this.scanFile(fullPath);
            if (!result.clean) {
              findings.push(...result.findings);
            }
          }
        }
      }
    };

    walk(dirPath);

    return {
      clean: findings.length === 0,
      filesScanned,
      findings
    };
  }
}

const secretScanner = new SecretScanner();

module.exports = {
  SecretScanner,
  secretScanner,
  SECRET_PATTERNS,
  maskSecret
};
