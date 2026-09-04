# APIFIX AI — GitHub SCM Integration Guide

Automate Pull Request creation, commit signing, and branch isolation directly from verified repair cycles.

## Configuring GitHub Integration

1. Generate a GitHub Personal Access Token (PAT) with `repo` scope.
2. In APIFIX Dashboard -> Settings -> SCM Integration, add your token.
3. APIFIX validates repository access and branch permissions.

## Pull Request Lifecycle

1. **Branch Creation**: APIFIX generates a collision-free branch named `apifix/fix-<incident-id>`.
2. **Atomic Commit**: Sanitized commit with evidence metadata and regression test summary.
3. **Pull Request Body**: Includes original exception, root-cause reasoning, AST diff, and sandbox probe response.
4. **Merge Protection**: Supports GitHub Branch Protection Rules and required CI checks.
