# APIFIX AI — CI/CD Platform Integration & Automated Quality Gates

## 1. Overview

APIFIX AI integrates natively with CI/CD platforms to serve as an automated API contract verification gate and self-healing engine. When pipeline runs fail due to broken API endpoints or schema regressions, APIFIX AI investigates the root cause, synthesizes a fix, runs regression testing in an isolated sandbox, and opens a Pull Request automatically.

---

## 2. GitHub Actions Integration

Create `.github/workflows/apifix-ci.yml`:

```yaml
name: APIFIX AI Quality Gate & Self-Healing

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

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
        env:
          APIFIX_API_KEY: ${{ secrets.APIFIX_API_KEY }}
          APIFIX_BASE_URL: https://api.apifix.ai
        run: |
          apifix verify --project "proj_api_gateway" --json > apifix-report.json || EXIT_CODE=$?
          
          if [ "$EXIT_CODE" -eq "0" ]; then
            echo "APIFIX Gate Passed: 0 regressions detected."
          elif [ "$EXIT_CODE" -eq "1" ]; then
            echo "APIFIX Gate Warning: API regressions detected. Triggering self-healing..."
            apifix repair analyze --project "proj_api_gateway"
            exit 1
          else
            echo "APIFIX Gate Failed with error code $EXIT_CODE"
            exit $EXIT_CODE
          fi

      - name: Upload Verification Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: apifix-report
          path: apifix-report.json
```

---

## 3. GitLab CI Integration

Create `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - apifix

apifix-quality-gate:
  stage: apifix
  image: node:20-alpine
  script:
    - npm install -g @apifix/cli
    - export APIFIX_API_KEY="${APIFIX_API_KEY}"
    - export APIFIX_BASE_URL="https://api.apifix.ai"
    - apifix verify --project "proj_api_gateway" --json > apifix-report.json || EXIT_CODE=$?
    - |
      if [ "$EXIT_CODE" -eq 0 ]; then
        echo "APIFIX Gate Passed."
      elif [ "$EXIT_CODE" -eq 1 ]; then
        echo "API drifts detected. Triggering repair..."
        apifix repair analyze --project "proj_api_gateway"
        exit 1
      else
        exit $EXIT_CODE
      fi
  artifacts:
    when: always
    paths:
      - apifix-report.json
```

---

## 4. Bitbucket Pipelines Integration

Create `bitbucket-pipelines.yml`:

```yaml
image: node:20

pipelines:
  default:
    - step:
        name: APIFIX Gate & Verification
        script:
          - npm install -g @apifix/cli
          - export APIFIX_API_KEY="$APIFIX_API_KEY"
          - export APIFIX_BASE_URL="https://api.apifix.ai"
          - apifix verify --project "proj_api_gateway" --json > apifix-report.json
        artifacts:
          - apifix-report.json
```

---

## 5. Azure DevOps Integration

Create `azure-pipelines.yml`:

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: 'Install Node.js'

  - script: |
      npm install -g @apifix/cli
      apifix verify --project "proj_api_gateway" --json > apifix-report.json
    displayName: 'Run APIFIX Quality Gate'
    env:
      APIFIX_API_KEY: $(APIFIX_API_KEY)
      APIFIX_BASE_URL: 'https://api.apifix.ai'
```
