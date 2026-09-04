/**
 * APIFIX AI — Operational Alert Storm Deduplicator (Phase 16)
 * Prevents alert flooding through fingerprint-based cooldown suppression,
 * occurrence counting, and burst rate-limiting.
 */

const crypto = require('crypto');
const observabilityEngine = require('./observabilityEngine');

class AlertDeduplicator {
  constructor(defaultCooldownMs = 5 * 60 * 1000) {
    this.defaultCooldownMs = defaultCooldownMs;
    this.alertRegistry = new Map(); // fingerprint -> { firstSeen, lastSeen, count, suppressedCount }
  }

  /**
   * Generates a stable deduplication fingerprint for an alert
   * @param {string} workspaceId
   * @param {string} eventType
   * @param {object} payload
   * @returns {string} SHA-256 fingerprint
   */
  generateFingerprint(workspaceId = 'global', eventType = 'alert', payload = {}) {
    const keyParts = [
      workspaceId,
      eventType,
      payload.targetEndpoint || payload.endpoint || '',
      payload.severity || '',
      payload.errorSignature || payload.summary || payload.message || ''
    ];
    return crypto.createHash('sha256').update(keyParts.join('::')).digest('hex').substring(0, 16);
  }

  /**
   * Evaluates whether an alert should be dispatched or suppressed under cooldown
   * @param {string} workspaceId
   * @param {string} eventType
   * @param {object} payload
   * @param {number} [customCooldownMs]
   * @returns {{ shouldDispatch: boolean, fingerprint: string, occurrenceCount: number, suppressedCount: number }}
   */
  shouldDispatchAlert(workspaceId, eventType, payload = {}, customCooldownMs) {
    const fingerprint = this.generateFingerprint(workspaceId, eventType, payload);
    const cooldownMs = customCooldownMs !== undefined ? customCooldownMs : this.defaultCooldownMs;
    const now = Date.now();

    const record = this.alertRegistry.get(fingerprint);

    if (!record) {
      // First occurrence: dispatch immediately
      this.alertRegistry.set(fingerprint, {
        fingerprint,
        workspaceId,
        eventType,
        firstSeen: now,
        lastSeen: now,
        lastDispatched: now,
        count: 1,
        suppressedCount: 0
      });

      return {
        shouldDispatch: true,
        fingerprint,
        occurrenceCount: 1,
        suppressedCount: 0
      };
    }

    record.count++;
    record.lastSeen = now;

    // Check cooldown
    const timeSinceLastDispatch = now - record.lastDispatched;
    if (timeSinceLastDispatch < cooldownMs) {
      record.suppressedCount++;

      observabilityEngine.recordEvent({
        event: 'alert_suppressed_by_deduplicator',
        category: 'ALERT',
        status: 'SUCCESS',
        severity: 'LOW',
        workspaceId,
        metadata: {
          fingerprint,
          eventType,
          suppressedCount: record.suppressedCount,
          timeRemainingMs: cooldownMs - timeSinceLastDispatch
        }
      });

      return {
        shouldDispatch: false,
        fingerprint,
        occurrenceCount: record.count,
        suppressedCount: record.suppressedCount
      };
    }

    // Cooldown elapsed: dispatch new notification and reset timer
    record.lastDispatched = now;
    const suppressedInWindow = record.suppressedCount;
    record.suppressedCount = 0;

    return {
      shouldDispatch: true,
      fingerprint,
      occurrenceCount: record.count,
      suppressedCount: suppressedInWindow
    };
  }

  /**
   * Resets registry (used in tests)
   */
  reset() {
    this.alertRegistry.clear();
  }
}

const alertDeduplicator = new AlertDeduplicator();

module.exports = alertDeduplicator;
