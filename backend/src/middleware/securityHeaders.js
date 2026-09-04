/**
 * APIFIX AI — Production HTTP Security Headers Middleware (Phase 17)
 * Injects hardened security headers to mitigate XSS, clickjacking, MIME-sniffing,
 * and enforce strict transport security without external heavy dependencies.
 */

function securityHeadersMiddleware(req, res, next) {
  // Content-Security-Policy (Permissive for Next.js hydration while blocking framing and object injection)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' http: https: ws: wss:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';"
  );

  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent Clickjacking / Framing
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS filtering in browsers that support it
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer information sent with requests
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict feature permissions
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Cross-Origin Isolation & Opener Policy
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // Restrict Adobe Flash / PDF cross-domain policy
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Enforce HSTS in production or when connection is HTTPS
  const isSecure = Boolean(
    (req.socket && req.socket.encrypted) ||
    (req.connection && req.connection.encrypted) ||
    (req.headers && req.headers['x-forwarded-proto'] === 'https')
  );
  if (process.env.NODE_ENV === 'production' || isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Remove identifying Express signature
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = securityHeadersMiddleware;
