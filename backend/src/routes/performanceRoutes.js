/**
 * APIFIX AI — Performance, Capacity, Chaos & Certification API Routes (Phase 24)
 */

const express = require('express');
const router = express.Router();
const { benchmarkRunner } = require('../services/benchmarkRunner');
const { hotPathCache } = require('../services/hotPathCache');
const { resourceProfiler } = require('../services/resourceProfiler');
const { advancedSloEngine } = require('../services/advancedSloEngine');
const { capacityPlanningService } = require('../services/capacityPlanningService');
const { chaosInjectionService } = require('../services/chaosInjectionService');
const { performanceGateService } = require('../services/performanceGateService');
const { enterpriseLaunchCertification } = require('../services/enterpriseLaunchCertification');

// GET /api/performance/profile
router.get('/profile', (req, res) => {
  const profile = resourceProfiler.getCurrentProfile();
  res.status(200).json(profile);
});

// GET /api/performance/benchmarks
router.get('/benchmarks', (req, res) => {
  res.status(200).json({
    classification: 'MEASURED',
    results: benchmarkRunner.getResults()
  });
});

// POST /api/performance/benchmark/run
router.post('/benchmark/run', async (req, res, next) => {
  try {
    const { name = 'api_health_benchmark', concurrency = 10, iterations = 50 } = req.body;
    const result = await benchmarkRunner.runBenchmark({
      name,
      concurrency: Math.min(concurrency, 50),
      iterations: Math.min(iterations, 200),
      fn: async () => {
        // Fast in-process test ping
        await new Promise(r => setImmediate(r));
      }
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/performance/slo
router.get('/slo', (req, res) => {
  const sloStatus = advancedSloEngine.evaluateSloStatus();
  res.status(200).json(sloStatus);
});

// POST /api/performance/capacity
router.post('/capacity', (req, res) => {
  const plan = capacityPlanningService.calculateCapacity(req.body);
  res.status(200).json(plan);
});

// GET /api/performance/chaos/status
router.get('/chaos/status', (req, res) => {
  res.status(200).json(chaosInjectionService.getStatus());
});

// POST /api/performance/chaos/enable
router.post('/chaos/enable', (req, res, next) => {
  try {
    const { scenario, config } = req.body;
    const result = chaosInjectionService.enableScenario(scenario, config);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/performance/chaos/disable
router.post('/chaos/disable', (req, res) => {
  const { scenario } = req.body;
  const result = chaosInjectionService.disableScenario(scenario);
  res.status(200).json(result);
});

// GET /api/performance/certification
router.get('/certification', (req, res) => {
  const report = enterpriseLaunchCertification.evaluateLaunchReadiness();
  res.status(200).json(report);
});

// GET /api/performance/cache/stats
router.get('/cache/stats', (req, res) => {
  res.status(200).json(hotPathCache.getStats());
});

// POST /api/performance/gate/evaluate
router.post('/gate/evaluate', (req, res) => {
  const evalResult = performanceGateService.evaluatePerformanceGate(req.body);
  res.status(200).json(evalResult);
});

module.exports = router;
