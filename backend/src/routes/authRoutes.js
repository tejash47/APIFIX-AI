const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const userStore = require('../services/userStore');
const workspaceService = require('../services/workspaceService');
const { recordAuditEvent } = require('../services/auditLogger');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'apifix_secret_key_2026_super_secure';

/**
 * Register User
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const displayName = name ? name.trim() : normalizedEmail.split('@')[0];

    let user = null;

    // Fast disk store check
    const existing = userStore.findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    if (process.env.NODE_ENV !== 'test' && isSupabaseConfigured()) {
      try {
        const { data: remoteExisting, error: checkErr } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (!checkErr && remoteExisting) {
          return res.status(400).json({ error: 'An account with this email already exists' });
        }

        if (!checkErr) {
          const hashedPassword = await bcrypt.hash(password, 10);
          const { data: newUser, error: insertErr } = await supabase
            .from('users')
            .insert({
              email: normalizedEmail,
              name: displayName,
              password: hashedPassword,
              role: 'developer'
            })
            .select('id, email, name, role')
            .single();

          if (!insertErr && newUser) {
            user = newUser;
          }
        }
      } catch (err) {
        console.warn('[Auth Register] Supabase error, falling back to disk:', err.message);
      }
    }

    if (!user) {
      // Persistent disk-backed store fallback
      const hashedPassword = await bcrypt.hash(password, 10);
      user = userStore.createUser({
        email: normalizedEmail,
        name: displayName,
        password: hashedPassword,
        role: 'developer'
      });
    }

    // Auto-provision default personal workspace
    const defaultWorkspace = await workspaceService.ensureDefaultWorkspace(user);

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    await recordAuditEvent({
      workspaceId: defaultWorkspace?.id || 'ws_default',
      actorId: user.id,
      actorEmail: user.email,
      action: 'LOGIN',
      resourceType: 'AUTH',
      resourceId: user.id,
      metadata: { event: 'registration' }
    });

    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      defaultWorkspace
    });
  } catch (err) {
    console.error('[Auth Register Error]', err);
    return res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

/**
 * Login User
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = null;

    // Fast disk store check
    const foundUser = userStore.findUserByEmail(normalizedEmail);
    if (foundUser) {
      const isValid = await bcrypt.compare(password, foundUser.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect password. Please try again.' });
      }
      user = { id: foundUser.id, email: foundUser.email, name: foundUser.name, role: foundUser.role };
    } else if (process.env.NODE_ENV !== 'test' && isSupabaseConfigured()) {
      try {
        const { data, error: fetchErr } = await supabase
          .from('users')
          .select('*')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (!fetchErr && data) {
          const isValid = await bcrypt.compare(password, data.password);
          if (isValid) {
            user = { id: data.id, email: data.email, name: data.name, role: data.role };
          }
        }
      } catch (err) {
        console.warn('[Auth Login] Supabase error, falling back to disk:', err.message);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'No account found with this email. Please create an account or verify spelling.' });
    }

    // Ensure workspace exists
    const defaultWorkspace = await workspaceService.ensureDefaultWorkspace(user);
    const workspaces = await workspaceService.listUserWorkspaces(user.id, user.email);

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    await recordAuditEvent({
      workspaceId: defaultWorkspace?.id || 'ws_default',
      actorId: user.id,
      actorEmail: user.email,
      action: 'LOGIN',
      resourceType: 'AUTH',
      resourceId: user.id,
      metadata: { event: 'login' }
    });

    return res.status(200).json({
      token,
      user,
      workspaces,
      defaultWorkspace
    });
  } catch (err) {
    console.error('[Auth Login Error]', err);
    return res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

/**
 * Get Current User
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    let user = null;

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, name, role')
          .eq('id', decoded.id)
          .maybeSingle();

        if (!error && data) {
          user = data;
        }
      } catch (e) {}
    }

    if (!user) {
      user = userStore.findUserById(decoded.id) || userStore.findUserByEmail(decoded.email);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      user = { id: user.id, email: user.email, name: user.name, role: user.role };
    }

    const workspaces = await workspaceService.listUserWorkspaces(user.id, user.email);

    return res.status(200).json({
      user,
      workspaces
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
