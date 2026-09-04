/**
 * APIFIX AI — Privacy-Conscious Product Analytics Service (Phase 25)
 * 
 * Tracks aggregate product lifecycle telemetry events (e.g. signup, onboarding,
 * first repair, upgrade) without recording PII or sensitive tenant payload data.
 */

const crypto = require('crypto');
const logger = require('./logger');

class ProductAnalyticsService {
  constructor() {
    this.events = [];
    this.maxBufferedEvents = 5000;
  }

  /**
   * Records a product lifecycle event with privacy safeguards.
   * @param {Object} params
   * @param {string} params.eventName - e.g. 'signup', 'onboarding_completed', 'first_api_connected', 'repair_verified'
   * @param {string} [params.workspaceId] - Workspace identifier (hashed or scoped)
   * @param {string} [params.userId] - User identifier (hashed for privacy)
   * @param {Object} [params.metadata] - Non-sensitive event metadata
   */
  trackEvent({ eventName, workspaceId, userId, metadata = {} }) {
    if (!eventName) {
      throw new Error('eventName is required for product analytics tracking');
    }

    // Scrub any accidental secrets or PII from metadata
    const sanitizedMetadata = this._sanitizeMetadata(metadata);

    const eventRecord = {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      eventName,
      workspaceId: workspaceId || 'unauthenticated',
      userHash: userId ? crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16) : null,
      timestamp: new Date().toISOString(),
      metadata: sanitizedMetadata
    };

    this.events.push(eventRecord);
    if (this.events.length > this.maxBufferedEvents) {
      this.events.shift();
    }

    logger.info('product_analytics_event', {
      eventName,
      workspaceId: eventRecord.workspaceId,
      timestamp: eventRecord.timestamp
    });

    return { success: true, eventId: eventRecord.id };
  }

  /**
   * Retrieves aggregated lifecycle metrics for product intelligence.
   * @param {string} [workspaceId]
   */
  getAggregateMetrics(workspaceId = null) {
    const targetEvents = workspaceId
      ? this.events.filter(e => e.workspaceId === workspaceId)
      : this.events;

    const eventCounts = {};
    for (const evt of targetEvents) {
      eventCounts[evt.eventName] = (eventCounts[evt.eventName] || 0) + 1;
    }

    return {
      classification: 'MEASURED',
      totalEventsRecorded: targetEvents.length,
      eventBreakdown: eventCounts,
      funnel: {
        signups: eventCounts['signup'] || 0,
        onboardingCompleted: eventCounts['onboarding_completed'] || 0,
        apisConnected: eventCounts['first_api_connected'] || 0,
        incidentsDetected: eventCounts['incident_detected'] || 0,
        repairsVerified: eventCounts['repair_verified'] || 0,
        upgrades: eventCounts['upgrade_tier'] || 0
      }
    };
  }

  /**
   * Clears buffered events (used in test resets).
   */
  resetEvents() {
    this.events = [];
  }

  _sanitizeMetadata(meta) {
    const cleaned = {};
    for (const [key, val] of Object.entries(meta)) {
      if (/key|secret|token|password|auth|cookie|cert/i.test(key)) {
        cleaned[key] = '[REDACTED]';
      } else if (typeof val === 'string' && (val.startsWith('sk_') || val.startsWith('ghp_'))) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = val;
      }
    }
    return cleaned;
  }
}

const productAnalyticsService = new ProductAnalyticsService();

module.exports = {
  ProductAnalyticsService,
  productAnalyticsService
};
