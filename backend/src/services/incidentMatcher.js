/**
 * APIFIX V2 — Phase 10: Similar Incident Detection
 * 
 * Compares incoming failure signatures against historical Repair Memory
 * to surface relevant previous repair strategies before calling expensive LLM models.
 */

const { getAllPatterns } = require('./repairMemory');

/**
 * Finds the closest matching historical repair pattern from memory.
 * 
 * @param {Object} params
 * @param {string} params.failureCategory - Category from failure classifier
 * @param {string} [params.errorMessage=''] - Error message text
 * @param {string} [params.endpoint=''] - API endpoint
 * @returns {{ matched: boolean, bestMatch: Object | null, similarity: number }}
 */
function findSimilarIncident({ failureCategory, errorMessage = '', endpoint = '' }) {
  const patterns = getAllPatterns();
  if (!patterns || patterns.length === 0) {
    return { matched: false, bestMatch: null, similarity: 0.0 };
  }

  const queryTokens = new Set([
    failureCategory.toLowerCase(),
    ...errorMessage.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 2),
    ...endpoint.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 2)
  ]);

  let bestMatch = null;
  let highestScore = 0.0;

  for (const pattern of patterns) {
    let score = 0.0;

    // Direct Category Match (+40%)
    if (pattern.failureType && pattern.failureType.toLowerCase() === failureCategory.toLowerCase()) {
      score += 0.40;
    }

    // Pattern Keyword Match (+40%)
    const patternTokens = (pattern.rootCausePattern || '').toLowerCase().split(/[^a-z0-9]+/);
    let tokenMatches = 0;
    for (const token of patternTokens) {
      if (token && queryTokens.has(token)) {
        tokenMatches++;
      }
    }
    if (patternTokens.length > 0) {
      score += Math.min(0.40, (tokenMatches / patternTokens.length) * 0.40);
    }

    // Framework compatibility (+20%)
    if (pattern.framework && pattern.framework.includes('Node')) {
      score += 0.20;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = pattern;
    }
  }

  const roundedSimilarity = parseFloat(highestScore.toFixed(2));
  const matched = roundedSimilarity >= 0.50;

  return {
    matched,
    bestMatch: matched ? { ...bestMatch, similarity: roundedSimilarity } : null,
    similarity: roundedSimilarity
  };
}

module.exports = {
  findSimilarIncident
};
