const express = require('express');
const jwt = require('jsonwebtoken');
const {
  getUserHistory,
  getHistoryItem,
  deleteHistoryItem,
  getUserStats
} = require('../services/historyService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'apifix_secret_key_2026_super_secure';

// Helper to extract user identity from Authorization header
function extractUser(req) {
  const authHeader = req.headers.authorization || req.headers.token;
  if (!authHeader) return null;

  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * GET /api/history
 * Fetch run & repair history for the authenticated user
 */
router.get('/history', async (req, res) => {
  try {
    const user = extractUser(req);
    const userIdentifier = user ? (user.email || user.id) : (req.query.email || 'dev@apifix.ai');

    const history = await getUserHistory(userIdentifier);
    const stats = await getUserStats(userIdentifier);

    return res.status(200).json({
      history,
      stats,
      user: user || { email: userIdentifier, isDemo: true }
    });
  } catch (err) {
    console.error('[History Route Error]', err);
    return res.status(500).json({ error: 'Failed to retrieve usage history', details: err.message });
  }
});

/**
 * GET /api/history/stats
 * Summary stats for dashboard
 */
router.get('/history/stats', async (req, res) => {
  try {
    const user = extractUser(req);
    const userIdentifier = user ? (user.email || user.id) : (req.query.email || 'dev@apifix.ai');
    const stats = await getUserStats(userIdentifier);
    return res.status(200).json(stats);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve user stats', details: err.message });
  }
});

/**
 * GET /api/history/:runId
 * Detailed historical run inspection
 */
router.get('/history/:runId', async (req, res) => {
  try {
    const user = extractUser(req);
    const userIdentifier = user ? (user.email || user.id) : (req.query.email || 'dev@apifix.ai');
    const item = getHistoryItem(req.params.runId, userIdentifier);

    if (!item) {
      return res.status(404).json({ error: 'History record not found' });
    }

    return res.status(200).json({ historyItem: item });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve history item', details: err.message });
  }
});

/**
 * DELETE /api/history/:runId
 * Remove a history item
 */
router.delete('/history/:runId', (req, res) => {
  const user = extractUser(req);
  const userIdentifier = user ? (user.email || user.id) : (req.query.email || 'dev@apifix.ai');
  const deleted = deleteHistoryItem(req.params.runId, userIdentifier);

  if (deleted) {
    return res.status(200).json({ success: true, message: 'History record deleted' });
  }
  return res.status(404).json({ error: 'History record not found or could not be deleted' });
});

module.exports = router;
