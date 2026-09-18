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
 * Register User (Name, Phone, Email, Password -> Custom User ID)
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const displayName = name ? name.trim() : normalizedEmail.split('@')[0];
    const rawPhone = phone ? String(phone).trim() : null;

    let user = null;

    // Fast check for existing email or phone
    const existing = userStore.findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    if (rawPhone) {
      const existingPhone = userStore.findUserByPhone(rawPhone);
      if (existingPhone) {
        return res.status(400).json({ error: 'An account with this phone number already exists' });
      }
    }

    const customUserId = userStore.generateCustomUserId(displayName, rawPhone);

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
              id: customUserId,
              email: normalizedEmail,
              name: displayName,
              phone: rawPhone,
              password: hashedPassword,
              role: 'developer'
            })
            .select('id, email, name, phone, role')
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
        id: customUserId,
        email: normalizedEmail,
        name: displayName,
        phone: rawPhone,
        password: hashedPassword,
        role: 'developer'
      });
    }

    // Auto-provision default personal workspace
    const defaultWorkspace = await workspaceService.ensureDefaultWorkspace(user);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await recordAuditEvent({
      workspaceId: defaultWorkspace?.id || 'ws_default',
      actorId: user.id,
      actorEmail: user.email,
      action: 'LOGIN',
      resourceType: 'AUTH',
      resourceId: user.id,
      metadata: { event: 'registration', userId: user.id, phone: user.phone }
    });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone || null,
        role: user.role
      },
      defaultWorkspace
    });
  } catch (err) {
    console.error('[Auth Register Error]', err);
    return res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

/**
 * Login User (Accepts Email, Phone Number, Name, or User ID + Password)
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, identifier, password } = req.body || {};
    const authIdentifier = (identifier || email || '').trim();

    if (!authIdentifier || !password) {
      return res.status(400).json({ error: 'Email, Phone, Name or User ID and password are required' });
    }

    let user = null;

    // Fast flexible identifier lookup (checks ID, Email, Phone, Name)
    const foundUser = userStore.findUserByIdentifier(authIdentifier);
    if (foundUser) {
      const isValid = await bcrypt.compare(password, foundUser.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect password. Please try again.' });
      }
      user = {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        phone: foundUser.phone || null,
        role: foundUser.role
      };
    } else if (process.env.NODE_ENV !== 'test' && isSupabaseConfigured()) {
      try {
        const { data, error: fetchErr } = await supabase
          .from('users')
          .select('*')
          .or(`email.eq.${authIdentifier.toLowerCase()},id.eq.${authIdentifier},phone.eq.${authIdentifier},name.eq.${authIdentifier}`)
          .maybeSingle();

        if (!fetchErr && data) {
          const isValid = await bcrypt.compare(password, data.password);
          if (isValid) {
            user = {
              id: data.id,
              email: data.email,
              name: data.name,
              phone: data.phone || null,
              role: data.role
            };
          }
        }
      } catch (err) {
        console.warn('[Auth Login] Supabase error, falling back to disk:', err.message);
      }
    }

    if (!user) {
      return res.status(401).json({
        error: 'No account found matching this credential. Please verify email/phone/name or register.'
      });
    }

    // Ensure workspace exists
    const defaultWorkspace = await workspaceService.ensureDefaultWorkspace(user);
    const workspaces = await workspaceService.listUserWorkspaces(user.id, user.email);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await recordAuditEvent({
      workspaceId: defaultWorkspace?.id || 'ws_default',
      actorId: user.id,
      actorEmail: user.email,
      action: 'LOGIN',
      resourceType: 'AUTH',
      resourceId: user.id,
      metadata: { event: 'login', identifierType: authIdentifier.includes('@') ? 'email' : 'identifier' }
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
          .select('id, email, name, phone, role')
          .eq('id', decoded.id)
          .maybeSingle();

        if (!error && data) {
          user = data;
        }
      } catch (e) {}
    }

    if (!user) {
      const match = userStore.findUserById(decoded.id) || userStore.findUserByEmail(decoded.email);
      if (!match) {
        return res.status(404).json({ error: 'User not found' });
      }
      user = {
        id: match.id,
        email: match.email,
        name: match.name,
        phone: match.phone || null,
        role: match.role
      };
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

// =========================================================================
// FORGOT PASSWORD & RESET SESSION ENDPOINTS
// =========================================================================

/**
 * Initiate Forgot Password Session
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier, email, phone } = req.body || {};
    const lookupKey = (identifier || email || phone || '').trim();

    if (!lookupKey) {
      return res.status(400).json({ error: 'Please provide your Email, Phone Number, Name, or User ID' });
    }

    const user = userStore.findUserByIdentifier(lookupKey);
    if (!user) {
      return res.status(404).json({
        error: 'No registered user found with that Email, Phone Number, or Username.'
      });
    }

    // Create secure 6-digit code & reset session
    const resetSession = userStore.createPasswordResetSession(user.id, lookupKey);

    await recordAuditEvent({
      workspaceId: 'ws_system',
      actorId: user.id,
      actorEmail: user.email,
      action: 'PASSWORD_RESET_REQUESTED',
      resourceType: 'AUTH',
      resourceId: resetSession.id,
      metadata: { sessionId: resetSession.id, userHint: user.email }
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset session initialized.',
      sessionId: resetSession.id,
      resetCode: resetSession.resetCode, // 6-digit verification code
      resetToken: resetSession.resetToken,
      expiresAt: resetSession.expiresAt,
      user: {
        id: user.id,
        name: user.name,
        emailHint: user.email ? user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : null,
        phoneHint: user.phone ? user.phone.slice(-4) : null
      }
    });
  } catch (err) {
    console.error('[Forgot Password Error]', err);
    return res.status(500).json({ error: 'Failed to initiate reset session', message: err.message });
  }
});

/**
 * Verify Reset Code / Token
 * POST /api/auth/verify-reset-code
 */
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { code, token, sessionId } = req.body || {};
    const key = code || token || sessionId;

    if (!key) {
      return res.status(400).json({ error: 'Verification code or reset token is required' });
    }

    const session = userStore.findResetSession(key);
    if (!session) {
      return res.status(400).json({ error: 'Invalid or expired password reset session' });
    }

    return res.status(200).json({
      valid: true,
      sessionId: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt
    });
  } catch (err) {
    return res.status(500).json({ error: 'Verification failed', message: err.message });
  }
});

/**
 * Complete Password Reset
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { code, token, sessionId, newPassword } = req.body || {};
    const key = code || token || sessionId;

    if (!key || !newPassword) {
      return res.status(400).json({ error: 'Verification code/token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters in length' });
    }

    const session = userStore.findResetSession(key);
    if (!session) {
      return res.status(400).json({ error: 'Reset session is invalid, expired, or has already been used' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    userStore.updateUserPassword(session.userId, hashedPassword);
    userStore.invalidateResetSession(session.id);

    // Also update Supabase if configured
    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('users')
          .update({ password: hashedPassword, updated_at: new Date().toISOString() })
          .eq('id', session.userId);
      } catch (e) {}
    }

    await recordAuditEvent({
      workspaceId: 'ws_system',
      actorId: session.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      resourceType: 'AUTH',
      resourceId: session.id,
      metadata: { sessionId: session.id }
    });

    return res.status(200).json({
      success: true,
      message: 'Password has been successfully updated. You can now sign in with your new password.'
    });
  } catch (err) {
    console.error('[Reset Password Error]', err);
    return res.status(500).json({ error: 'Failed to reset password', message: err.message });
  }
});

module.exports = router;
