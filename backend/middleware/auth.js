/**
 * Authentication Middleware
 *
 * JWT-based auth with httpOnly cookies.
 * Provides requireAuth and requireAdmin middleware.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * requireAuth - Validates JWT from httpOnly cookie.
 * Attaches req.user with { id, username, name, role }.
 * Returns 401 if not authenticated.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      name: decoded.name,
      role: decoded.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * requireAdmin - Must be used AFTER requireAuth.
 * Checks that req.user.role === 'admin'.
 * Returns 403 if not admin.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  JWT_SECRET,
};
