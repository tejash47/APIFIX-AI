const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    console.log('[APIFIX Database] Supabase client initialized successfully.');
  } catch (err) {
    console.warn('[APIFIX Database] Failed to initialize Supabase client:', err.message);
  }
} else {
  console.log('[APIFIX Database] Supabase credentials not set in .env. Running with fast memory fallback.');
}

function isSupabaseConfigured() {
  const isTestRunner = process.env.NODE_ENV === 'test' || process.argv.some(a => typeof a === 'string' && (a.includes('test') || a.includes('--test')));
  if (isTestRunner && process.env.SUPABASE_ENABLE_IN_TEST !== 'true') {
    return false;
  }
  return !!(supabase && SUPABASE_URL && SUPABASE_KEY);
}

module.exports = {
  supabase,
  isSupabaseConfigured
};
