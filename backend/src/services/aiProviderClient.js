const path = require('path');
const fs = require('fs');
const { sanitizeSecrets, validateSafePath } = require('./securitySanitizer');
const { getCircuitBreaker } = require('./circuitBreaker');
const aiProviderObserver = require('./aiProviderObserver');
const logger = require('./logger');

const AI_REQUEST_TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '30000', 10);
const AI_MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES || '2', 10);

// Mock response hook for deterministic testing
let mockAiResponseHook = null;

function setMockAiResponse(hookFn) {
  mockAiResponseHook = hookFn;
}

function clearMockAiResponse() {
  mockAiResponseHook = null;
}

/**
 * Validates whether an AI provider is configured in environment variables.
 * @returns {boolean}
 */
function isAiProviderConfigured() {
  if (mockAiResponseHook) return true;

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey !== 'your_groq_api_key_here' && groqKey.trim().length > 0) {
    return true;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && anthropicKey !== 'your_anthropic_api_key_here' && anthropicKey.trim().length > 0) {
    return true;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey !== 'your_openai_api_key_here' && openaiKey.trim().length > 0) {
    return true;
  }

  return false;
}

/**
 * Returns ordered list of all configured providers for fallback execution.
 * @returns {Array<{ provider: string, model: string, apiKey: string }>}
 */
function getConfiguredProviders() {
  const providers = [];

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey !== 'your_groq_api_key_here' && groqKey.trim().length > 0) {
    providers.push({
      provider: 'groq',
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      apiKey: groqKey.trim()
    });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && anthropicKey !== 'your_anthropic_api_key_here' && anthropicKey.trim().length > 0) {
    providers.push({
      provider: 'anthropic',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      apiKey: anthropicKey.trim()
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey !== 'your_openai_api_key_here' && openaiKey.trim().length > 0) {
    providers.push({
      provider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      apiKey: openaiKey.trim()
    });
  }

  return providers;
}

/**
 * Returns metadata about the active AI provider.
 * @returns {{ provider: string, model: string, apiKey: string } | null}
 */
function getActiveProvider() {
  const providers = getConfiguredProviders();
  return providers.length > 0 ? providers[0] : null;
}

/**
 * Performs syntax integrity validation on JavaScript code
 * @param {string} code 
 * @returns {boolean}
 */
function checkJsSyntax(code) {
  try {
    new Function(code);
    return true;
  } catch (e) {
    if (code.includes('import ') || code.includes('export ')) {
      const opens = (code.match(/\{/g) || []).length;
      const closes = (code.match(/\}/g) || []).length;
      return opens === closes;
    }
    return false;
  }
}

/**
 * Validates the strict AI Response Contract schema.
 * @param {object} parsed - Parsed JSON from AI provider
 * @throws {Error} if schema is invalid
 */
function validateAiResponseContract(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response must be a JSON object.');
  }

  if (!parsed.rootCause || typeof parsed.rootCause !== 'object') {
    throw new Error('AI response missing required "rootCause" object.');
  }

  if (!parsed.rootCause.summary || typeof parsed.rootCause.summary !== 'string') {
    throw new Error('AI response missing "rootCause.summary" string.');
  }

  if (!parsed.rootCause.file || typeof parsed.rootCause.file !== 'string') {
    throw new Error('AI response missing "rootCause.file" string.');
  }

  if (typeof parsed.rootCause.line !== 'number') {
    parsed.rootCause.line = parseInt(parsed.rootCause.line, 10) || 1;
  }

  if (!parsed.rootCause.explanation || typeof parsed.rootCause.explanation !== 'string') {
    throw new Error('AI response missing "rootCause.explanation" string.');
  }

  if (!parsed.patch || typeof parsed.patch !== 'object') {
    throw new Error('AI response missing required "patch" object.');
  }

  if (!parsed.patch.filePath || typeof parsed.patch.filePath !== 'string') {
    throw new Error('AI response missing "patch.filePath" string.');
  }

  if (typeof parsed.patch.oldText !== 'string' || parsed.patch.oldText.length === 0) {
    throw new Error('AI response missing valid "patch.oldText" string.');
  }

  if (typeof parsed.patch.newText !== 'string') {
    throw new Error('AI response missing "patch.newText" string.');
  }

  if (parsed.patch.oldText === parsed.patch.newText) {
    throw new Error('Invalid patch: oldText and newText are identical (no repair performed).');
  }

  // Security: Prevent path traversal in proposed patch file path
  const normalizedPath = path.normalize(parsed.patch.filePath).replace(/^(\.\.[\/\\])+/, '');
  if (normalizedPath !== parsed.patch.filePath && parsed.patch.filePath.includes('..')) {
    throw new Error(`Security Violation: Patch filePath "${parsed.patch.filePath}" contains path traversal sequences.`);
  }

  // Truthful confidence: Do not allow fake arbitrary numbers without objective justification
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    parsed.confidence = null;
  }

  // Populate standardized Phase 9 failure taxonomy if absent
  if (!parsed.failureType) {
    const summary = (parsed.rootCause.summary || '').toLowerCase();
    if (summary.includes('null') || summary.includes('cannot read')) {
      parsed.failureType = 'RUNTIME_NULL_DEREFERENCE';
    } else if (summary.includes('typeerror') || summary.includes('is not a function')) {
      parsed.failureType = 'RUNTIME_TYPE_ERROR';
    } else if (summary.includes('syntax') || summary.includes('parse')) {
      parsed.failureType = 'SYNTAX_ERROR';
    } else if (summary.includes('auth') || summary.includes('credential')) {
      parsed.failureType = 'AUTHENTICATION_FAILURE';
    } else {
      parsed.failureType = 'INCORRECT_BUSINESS_LOGIC';
    }
  }

  if (!Array.isArray(parsed.verificationPlan)) {
    parsed.verificationPlan = [
      'Restart service on dynamic port',
      'Re-probe target endpoint with previous payload',
      'Run repository test suite to check for regressions'
    ];
  }

  return parsed;
}

/**
 * Extracts and parses JSON from raw LLM text (handling markdown fences if present).
 * @param {string} rawText 
 * @returns {object}
 */
function parseAiJsonResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty AI response.');
  }

  // 1. Try direct parse
  try {
    return JSON.parse(rawText.trim());
  } catch (e) {}

  // 2. Try extraction from ```json ... ``` code fence
  const jsonFenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonFenceMatch && jsonFenceMatch[1]) {
    try {
      return JSON.parse(jsonFenceMatch[1].trim());
    } catch (e) {}
  }

  // 3. Try finding outer curly braces
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const extracted = rawText.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(extracted.trim());
    } catch (e) {}
  }

  throw new Error(`Malformed AI response: Could not parse valid JSON from model output.`);
}

/**
 * Executes a single AI provider call wrapped with timeout and AbortController
 */
async function callSingleProvider(providerConfig, systemPrompt, userPrompt, timeoutMs, abortSignal) {
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (abortSignal) {
    if (abortSignal.aborted) {
      clearTimeout(timeoutTimer);
      const err = new Error('AI request aborted before execution.');
      err.code = 'AI_ABORTED';
      throw err;
    }
    abortSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    let rawResponseText = '';

    if (providerConfig.provider === 'groq' || providerConfig.provider === 'openai') {
      const url = providerConfig.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${providerConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: providerConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        const providerName = providerConfig.provider.charAt(0).toUpperCase() + providerConfig.provider.slice(1);
        const err = new Error(`${providerName} API request failed (HTTP ${response.status}): ${sanitizeSecrets(errorText)}`);
        err.statusCode = response.status;
        err.isTransient = [429, 500, 502, 503, 504].includes(response.status);
        throw err;
      }

      const data = await response.json();
      rawResponseText = data.choices?.[0]?.message?.content || '';
    } else if (providerConfig.provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': providerConfig.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: providerConfig.model,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: 2048,
          temperature: 0.1
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(`Anthropic API request failed (HTTP ${response.status}): ${sanitizeSecrets(errorText)}`);
        err.statusCode = response.status;
        err.isTransient = [429, 500, 502, 503, 504].includes(response.status);
        throw err;
      }

      const data = await response.json();
      const textBlock = data.content?.find(c => c.type === 'text');
      rawResponseText = textBlock?.text || '';
    }

    clearTimeout(timeoutTimer);
    return rawResponseText;
  } catch (err) {
    clearTimeout(timeoutTimer);
    if (err.name === 'AbortError' || controller.signal.aborted) {
      if (abortSignal && abortSignal.aborted) {
        const abortErr = new Error('AI request was cancelled.');
        abortErr.code = 'AI_CANCELLED';
        throw abortErr;
      }
      const providerName = providerConfig.provider.charAt(0).toUpperCase() + providerConfig.provider.slice(1);
      const timeoutErr = new Error(`AI_TIMEOUT: Request to ${providerName} timed out after ${timeoutMs}ms.`);
      timeoutErr.code = 'AI_TIMEOUT';
      timeoutErr.isTransient = true;
      throw timeoutErr;
    }
    throw err;
  }
}

/**
 * Calculates exponential backoff delay with random jitter to prevent retry storms
 */
function calculateJitteredBackoff(attempt, baseDelayMs = 250, maxDelayMs = 2000) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 150);
  return exponential + jitter;
}

/**
 * Executes a resilient AI investigation and patch generation request with
 * Circuit Breakers, Jittered Exponential Backoff, and Multi-Tier Provider Fallback.
 * 
 * @param {object} params - { workspaceDir, failureData, parsedTrace, sourceSnippet, customTimeoutMs, abortSignal, workspaceId }
 * @returns {Promise<object>} Structured AI response conforming to contract
 */
async function requestAiInvestigationAndPatch({
  workspaceDir,
  failureData,
  parsedTrace,
  sourceSnippet,
  customTimeoutMs = AI_REQUEST_TIMEOUT_MS,
  abortSignal = null,
  workspaceId = 'system'
}) {
  // If test mock hook is registered, execute directly
  if (mockAiResponseHook) {
    const mockOutput = await mockAiResponseHook({ failureData, parsedTrace, sourceSnippet });
    const parsed = typeof mockOutput === 'string' ? parseAiJsonResponse(mockOutput) : mockOutput;
    return validateAiResponseContract(parsed);
  }

  const configuredProviders = getConfiguredProviders();
  if (configuredProviders.length === 0) {
    throw new Error('AI_PROVIDER_NOT_CONFIGURED: No valid GROQ_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY found in backend environment.');
  }

  const endpointStr = typeof failureData.endpoint === 'string'
    ? failureData.endpoint
    : `${failureData.endpoint?.method || 'POST'} ${failureData.endpoint?.path || '/api'}`;

  const systemPrompt = `You are APIFIX AI, an expert autonomous software engineer and API reliability agent.
Your job is to analyze real runtime failure evidence and generate a minimal, safe, and precise code patch.

CRITICAL REPAIR RULES:
1. You must return ONLY a single valid JSON object strictly conforming to the requested schema. No conversational filler or text outside JSON.
2. The patch must contain the EXACT verbatim snippet in "oldText" currently present in the source file.
3. The "newText" must provide the minimal safe fix (e.g. null check guard, type validation, or defensive error response).
4. Do NOT attempt to rewrite the entire file. Target only the specific defect.
5. Set confidence to null unless proven by exhaustive mathematical or type invariants.

OUTPUT JSON SCHEMA:
{
  "rootCause": {
    "summary": "Short 1-line summary of root cause",
    "file": "relative/path/to/file.js",
    "line": 12,
    "explanation": "Detailed explanation of why the crash occurred"
  },
  "patch": {
    "filePath": "relative/path/to/file.js",
    "oldText": "verbatim text to replace",
    "newText": "replacement text",
    "reason": "Why this change fixes the issue"
  },
  "confidence": null,
  "verificationPlan": [
    "Step 1: Re-probe endpoint",
    "Step 2: Run test suite"
  ]
}`;

  const userPrompt = `A real runtime failure was captured during API execution:

FAILURE TELEMETRY:
- Target Endpoint: ${endpointStr}
- HTTP Status Code: ${failureData.statusCode || 500}
- Error Category: ${failureData.category || 'RUNTIME_EXCEPTION'}
- Error Message: ${sanitizeSecrets(parsedTrace?.errorMessage || failureData.error || 'Internal Server Error')}

STACK TRACE FRAMES:
${(parsedTrace?.frames || []).slice(0, 3).map((f, i) => `  #${i + 1} at ${f.function || 'anonymous'} in ${f.file}:${f.line}:${f.column}`).join('\n') || '  (No stack frames parsed)'}

TARGET SOURCE CONTEXT (${sourceSnippet?.file || 'unknown file'}, lines ${sourceSnippet?.startLine || 1}-${sourceSnippet?.endLine || 1}):
\`\`\`
${sourceSnippet?.content || '(Source snippet unavailable)'}
\`\`\`

Please analyze this failure, determine the exact root cause, and return the structured JSON patch.`;

  let lastError = null;

  // Fallback loop over configured providers
  for (let pIndex = 0; pIndex < configuredProviders.length; pIndex++) {
    const provider = configuredProviders[pIndex];
    const breaker = getCircuitBreaker(`ai:${provider.provider}`, {
      failureThreshold: 3,
      cooldownMs: 30000,
      category: 'AI_PROVIDER'
    });

    const startTime = Date.now();

    try {
      const rawText = await breaker.execute(async () => {
        let attempt = 0;
        while (attempt <= AI_MAX_RETRIES) {
          try {
            return await callSingleProvider(provider, systemPrompt, userPrompt, customTimeoutMs, abortSignal);
          } catch (err) {
            if (err.code === 'AI_CANCELLED' || !err.isTransient || attempt >= AI_MAX_RETRIES) {
              throw err;
            }
            attempt++;
            const backoff = calculateJitteredBackoff(attempt);
            logger.warn('ai_provider_retry', {
              provider: provider.provider,
              attempt,
              backoffMs: backoff,
              reason: err.message
            });
            await new Promise(r => setTimeout(r, backoff));
          }
        }
      });

      const durationMs = Date.now() - startTime;
      aiProviderObserver.recordLatency(provider.provider, durationMs, true);

      const parsed = parseAiJsonResponse(rawText);
      const validated = validateAiResponseContract(parsed);

      return {
        ...validated,
        provider: provider.provider,
        model: provider.model
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      aiProviderObserver.recordLatency(provider.provider, durationMs, false, err.message);
      lastError = err;

      // If next fallback provider exists, record transition and continue
      if (pIndex + 1 < configuredProviders.length) {
        const nextProvider = configuredProviders[pIndex + 1];
        logger.warn('ai_provider_fallback_triggered', {
          from: provider.provider,
          to: nextProvider.provider,
          reason: err.message,
          workspaceId
        });

        aiProviderObserver.recordFallback({
          fromProvider: provider.provider,
          toProvider: nextProvider.provider,
          reason: err.message,
          workspaceId
        });
      }
    }
  }

  throw lastError || new Error('All configured AI providers failed to generate repair patch.');
}

module.exports = {
  isAiProviderConfigured,
  getConfiguredProviders,
  getActiveProvider,
  validateAiResponseContract,
  parseAiJsonResponse,
  requestAiInvestigationAndPatch,
  checkJsSyntax,
  setMockAiResponse,
  clearMockAiResponse,
  calculateJitteredBackoff,
  AI_REQUEST_TIMEOUT_MS
};
