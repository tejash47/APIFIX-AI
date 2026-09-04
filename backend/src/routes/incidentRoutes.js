const express = require('express');
const { supabase, isSupabaseConfigured } = require('../config/supabase');

const router = express.Router();

const mockIncidents = [
  {
    id: 'inc_500_auth_login',
    endpoint: '/api/auth/login',
    method: 'POST',
    status: 500,
    latency: '142ms',
    errorRate: '14.2%',
    error: 'TypeError: Cannot read properties of null (reading password)',
    lastChecked: 'Just now',
    state: 'OPEN'
  },
  {
    id: 'inc_200_users',
    endpoint: '/api/users',
    method: 'GET',
    status: 200,
    latency: '18ms',
    errorRate: '0.0%',
    error: null,
    lastChecked: '2 mins ago',
    state: 'HEALTHY'
  },
  {
    id: 'inc_200_products',
    endpoint: '/api/products',
    method: 'GET',
    status: 200,
    latency: '24ms',
    errorRate: '0.0%',
    error: null,
    lastChecked: '5 mins ago',
    state: 'HEALTHY'
  }
];

router.get('/incidents', async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.from('incidents').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        return res.status(200).json({ incidents: data, total: data.length });
      }
    }
    return res.status(200).json({ incidents: mockIncidents, total: mockIncidents.length });
  } catch (err) {
    return res.status(200).json({ incidents: mockIncidents, total: mockIncidents.length });
  }
});

router.get('/incidents/:id', async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.from('incidents').select('*').eq('id', req.params.id).maybeSingle();
      if (!error && data) {
        return res.status(200).json({ incident: data });
      }
    }
    const inc = mockIncidents.find(i => i.id === req.params.id) || mockIncidents[0];
    return res.status(200).json({ incident: inc });
  } catch (err) {
    const inc = mockIncidents.find(i => i.id === req.params.id) || mockIncidents[0];
    return res.status(200).json({ incident: inc });
  }
});

module.exports = router;

