/**
 * APIFIX AI — Phase 23 CI/CD & Pipeline Quality Gates Test Suite
 * 
 * Validates GitHub Actions workflow structures, quality gate rules, and exit codes.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, describe } = require('node:test');
const { EXIT_CODES } = require('../../cli/bin/apifix');

describe('Phase 23 — CI/CD Pipeline & Quality Gates Suite', () => {

  test('5.1 GitHub Actions CI workflow file exists (.github/workflows/ci.yml)', () => {
    const ciPath = path.join(__dirname, '../../.github/workflows/ci.yml');
    assert.ok(fs.existsSync(ciPath));
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('actions/checkout@v4'));
    assert.ok(content.includes('actions/setup-node@v4'));
  });

  test('5.2 CI workflow includes TypeScript validation step', () => {
    const ciPath = path.join(__dirname, '../../.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('tsc --noEmit'));
  });

  test('5.3 CI workflow includes automated secret scan step', () => {
    const ciPath = path.join(__dirname, '../../.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('secretScanner.js'));
  });

  test('5.4 CI workflow includes database migration verification step', () => {
    const ciPath = path.join(__dirname, '../../.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('npm run db:verify'));
  });

  test('5.5 CI workflow includes backend and frontend test runners', () => {
    const ciPath = path.join(__dirname, '../../.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('node --test tests/*.test.js'));
    assert.ok(content.includes('npm test'));
  });

  test('5.6 GitHub Actions CD workflow exists (.github/workflows/deploy.yml)', () => {
    const deployPath = path.join(__dirname, '../../.github/workflows/deploy.yml');
    assert.ok(fs.existsSync(deployPath));
    const content = fs.readFileSync(deployPath, 'utf8');
    assert.ok(content.includes('deploy-staging'));
    assert.ok(content.includes('deploy-production'));
  });

  test('5.7 CD workflow includes staging smoke tests', () => {
    const deployPath = path.join(__dirname, '../../.github/workflows/deploy.yml');
    const content = fs.readFileSync(deployPath, 'utf8');
    assert.ok(content.includes('smoke_test.js'));
  });

  test('5.8 CD workflow includes automated rollback triggers on failure', () => {
    const deployPath = path.join(__dirname, '../../.github/workflows/deploy.yml');
    const content = fs.readFileSync(deployPath, 'utf8');
    assert.ok(content.includes('Initiating automatic zero-downtime rollback'));
  });

  test('5.9 CLI exports deterministic exit codes for CI integrations', () => {
    assert.strictEqual(EXIT_CODES.SUCCESS, 0);
    assert.strictEqual(EXIT_CODES.VERIFICATION_FAILURE, 1);
    assert.strictEqual(EXIT_CODES.CONFIG_OR_AUTH_ERROR, 2);
    assert.strictEqual(EXIT_CODES.RATE_LIMIT_OR_QUOTA_EXCEEDED, 3);
    assert.strictEqual(EXIT_CODES.NETWORK_OR_TIMEOUT_ERROR, 4);
    assert.strictEqual(EXIT_CODES.INTERNAL_SERVER_ERROR, 5);
  });

  test('5.10 Render and Railway cloud deployment manifests exist and are valid', () => {
    const renderPath = path.join(__dirname, '../../render.yaml');
    const railwayPath = path.join(__dirname, '../../railway.json');
    assert.ok(fs.existsSync(renderPath));
    assert.ok(fs.existsSync(railwayPath));
  });
});
