/**
 * APIFIX AI — CI/CD Integration Service
 * 
 * Provides automated workflow template generation, CI/CD pipeline webhook ingestion,
 * deterministic exit code mapping, and automated PR/commit annotation.
 */

const { sanitizeSecrets } = require('./securitySanitizer');
const { getSourceControlProvider } = require('./sourceControlProvider');
const runController = require('./runController');

/**
 * Deterministic Exit Codes supported by APIFIX CLI and CI/CD integrations
 */
const EXIT_CODES = {
  SUCCESS: 0,
  VERIFICATION_FAILURE: 1,
  CONFIG_OR_AUTH_ERROR: 2,
  RATE_LIMIT_OR_QUOTA_EXCEEDED: 3,
  NETWORK_OR_TIMEOUT_ERROR: 4,
  INTERNAL_SERVER_ERROR: 5
};

class CiCdService {
  constructor() {
    this.supportedPlatforms = ['github', 'gitlab', 'bitbucket', 'azure'];
  }

  /**
   * Generates a CI/CD workflow definition for the target platform
   * @param {string} platform - 'github', 'gitlab', 'bitbucket', 'azure'
   * @param {Object} options - Configuration options (projectId, apiKeyEnv, branch, autoRepair)
   */
  generateWorkflow(platform = 'github', options = {}) {
    const {
      projectId = 'proj_enterprise_demo',
      apiKeyEnv = 'APIFIX_API_KEY',
      baseUrl = 'https://api.apifix.ai',
      branch = 'main',
      autoRepair = true,
      failOnWarning = false
    } = options;

    const normalized = String(platform).toLowerCase();

    switch (normalized) {
      case 'github':
        return {
          filename: '.github/workflows/apifix-ci.yml',
          content: `name: APIFIX AI Automated Quality Gate & Self-Healing

on:
  push:
    branches: [ ${branch} ]
  pull_request:
    branches: [ ${branch} ]
  workflow_dispatch:

jobs:
  apifix-gate:
    name: APIFIX Verification & Self-Healing
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install APIFIX CLI
        run: npm install -g @apifix/cli

      - name: Run API Verification Gate
        id: apifix_verify
        env:
          APIFIX_API_KEY: \${{ secrets.${apiKeyEnv} }}
          APIFIX_BASE_URL: ${baseUrl}
        run: |
          echo "Executing APIFIX verification gate for project: ${projectId}..."
          apifix verify --project "${projectId}" --json > apifix-report.json || EXIT_CODE=$?
          
          if [ "\$EXIT_CODE" -eq "0" ]; then
            echo "APIFIX Gate Passed: 0 regressions detected."
          elif [ "\$EXIT_CODE" -eq "1" ]; then
            echo "APIFIX Gate Warning: API regressions or contract drifts detected."
            ${autoRepair ? `echo "Auto-repair triggered..."
            apifix repair analyze --project "${projectId}"
            ` : ''}
            ${failOnWarning ? 'exit 1' : 'exit 0'}
          else
            echo "APIFIX Gate Failed with exit code \$EXIT_CODE"
            exit \$EXIT_CODE
          fi

      - name: Upload Verification Artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: apifix-verification-report
          path: apifix-report.json
`
        };

      case 'gitlab':
        return {
          filename: '.gitlab-ci.yml',
          content: `stages:
  - test
  - apifix

apifix-quality-gate:
  stage: apifix
  image: node:20-alpine
  script:
    - npm install -g @apifix/cli
    - export APIFIX_API_KEY="\${${apiKeyEnv}}"
    - export APIFIX_BASE_URL="${baseUrl}"
    - apifix verify --project "${projectId}" --json > apifix-report.json || EXIT_CODE=$?
    - |
      if [ "$EXIT_CODE" -eq 0 ]; then
        echo "APIFIX Gate Passed."
      elif [ "$EXIT_CODE" -eq 1 ]; then
        echo "API drifts detected."
        ${autoRepair ? `apifix repair analyze --project "${projectId}"` : ''}
        ${failOnWarning ? 'exit 1' : 'exit 0'}
      else
        exit $EXIT_CODE
      fi
  artifacts:
    when: always
    paths:
      - apifix-report.json
`
        };

      case 'bitbucket':
        return {
          filename: 'bitbucket-pipelines.yml',
          content: `image: node:20

pipelines:
  default:
    - step:
        name: APIFIX Gate & Verification
        script:
          - npm install -g @apifix/cli
          - export APIFIX_API_KEY="$${apiKeyEnv}"
          - export APIFIX_BASE_URL="${baseUrl}"
          - apifix verify --project "${projectId}" --json > apifix-report.json
        artifacts:
          - apifix-report.json
`
        };

      case 'azure':
      case 'azure_devops':
        return {
          filename: 'azure-pipelines.yml',
          content: `trigger:
  - ${branch}

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: 'Install Node.js'

  - script: |
      npm install -g @apifix/cli
      apifix verify --project "${projectId}" --json > apifix-report.json
    displayName: 'Run APIFIX Quality Gate'
    env:
      APIFIX_API_KEY: $( ${apiKeyEnv} )
      APIFIX_BASE_URL: '${baseUrl}'
`
        };

      default:
        throw new Error(`Unsupported CI/CD platform: ${platform}. Supported platforms: ${this.supportedPlatforms.join(', ')}`);
    }
  }

  async handlePipelineFailureWebhook(payload = {}) {
    return this.handlePipelineFailure(payload);
  }

  /**
   * Evaluates an incoming CI/CD test failure webhook and triggers self-healing
   * @param {Object} payload - Webhook payload from GitHub Actions / GitLab CI / etc.
   */
  async handlePipelineFailure(payload = {}) {
    const {
      provider = 'github',
      repository,
      branch = 'main',
      commitSha,
      failedTests = [],
      logs = '',
      projectId
    } = payload;

    if (!projectId && !repository) {
      throw new Error('projectId or repository is required');
    }

    const sanitizedLogs = sanitizeSecrets(String(logs).substring(0, 10000));
    
    // Trigger automated run or investigation
    const targetProject = projectId || `proj_${repository.replace('/', '_')}`;
    const runId = `run_ci_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let runResult = { runId, status: 'QUEUED' };
    try {
      if (typeof runController.triggerRun === 'function') {
        runResult = await runController.triggerRun({
          projectId: targetProject,
          triggerSource: `ci_pipeline_${provider}`,
          commitSha,
          branch,
          context: {
            failedTestsCount: failedTests.length,
            sanitizedLogsSnippet: sanitizedLogs.substring(0, 500)
          }
        });
      } else if (typeof runController.registerActiveRun === 'function') {
        runController.registerActiveRun({
          runId,
          workspaceId: targetProject,
          targetKey: targetProject
        });
      }
    } catch (e) {}

    // Notify PR/Commit status check
    if (commitSha && repository) {
      const scm = getSourceControlProvider(provider);
      try {
        await scm.setStatusCheck(
          repository,
          commitSha,
          'pending',
          `APIFIX Run ${runResult.runId || 'initiated'} diagnosing build failure`
        );
      } catch (err) {
        // Log & proceed
      }
    }

    return {
      success: true,
      status: 'investigation_triggered',
      projectId: targetProject,
      runId: runResult.runId,
      commitSha,
      branch
    };
  }

  /**
   * Maps an internal error or execution outcome to a deterministic CLI exit code
   * @param {Error|Object|string} errorOrStatus 
   * @returns {number} Exit code (0-5)
   */
  getExitCode(errorOrStatus) {
    if (!errorOrStatus) return EXIT_CODES.SUCCESS;

    if (typeof errorOrStatus === 'number') {
      return Object.values(EXIT_CODES).includes(errorOrStatus) ? errorOrStatus : EXIT_CODES.INTERNAL_SERVER_ERROR;
    }

    const message = (errorOrStatus.message || errorOrStatus.code || String(errorOrStatus)).toLowerCase();

    if (message.includes('verification_failed') || message.includes('test_failed') || message.includes('drift_detected') || message.includes('patch_rejected')) {
      return EXIT_CODES.VERIFICATION_FAILURE;
    }

    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden') || message.includes('invalid_api_key') || message.includes('config_error')) {
      return EXIT_CODES.CONFIG_OR_AUTH_ERROR;
    }

    if (message.includes('rate_limit') || message.includes('too_many_requests') || message.includes('quota_exceeded') || message.includes('insufficient_credits')) {
      return EXIT_CODES.RATE_LIMIT_OR_QUOTA_EXCEEDED;
    }

    if (message.includes('timeout') || message.includes('econnrefused') || message.includes('enotfound') || message.includes('network_error')) {
      return EXIT_CODES.NETWORK_OR_TIMEOUT_ERROR;
    }

    return EXIT_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = new CiCdService();
module.exports.CiCdService = CiCdService;
module.exports.EXIT_CODES = EXIT_CODES;
