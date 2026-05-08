/**
 * User Management Routes (Admin Only)
 *
 * GET    /api/users            - List all users
 * POST   /api/users            - Create user
 * PUT    /api/users/:id        - Update user
 * PUT    /api/users/:id/reset-password - Reset password
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../database/pg');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All user routes require admin
router.use(requireAuth, requireAdmin);

// Random avatar colors
const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, username, name, role, avatar_color, is_active, last_login, created_at, updated_at FROM users ORDER BY created_at ASC'
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', message: err.message });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;

    if (!username || !password || !name || !role) {
      return res.status(400).json({ error: 'username, password, name, and role are required' });
    }

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or member' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const avatarColor = randomColor();

    const { rows } = await query(
      `INSERT INTO users (username, password_hash, name, role, avatar_color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, name, role, avatar_color, is_active, created_at`,
      [username.toLowerCase().trim(), passwordHash, name, role, avatarColor]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.message && err.message.includes('unique')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create user', message: err.message });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { name, role, is_active } = req.body;

    // Cannot deactivate yourself
    if (is_active === false && userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      params.push(name);
    }
    if (role !== undefined) {
      if (!['admin', 'member'].includes(role)) {
        return res.status(400).json({ error: 'role must be admin or member' });
      }
      // Protect garrett's admin role — cannot be changed
      const { rows: targetRows } = await query('SELECT username FROM users WHERE id = $1', [userId]);
      if (targetRows.length > 0 && targetRows[0].username === 'garrett' && role !== 'admin') {
        return res.status(403).json({ error: 'Cannot change garrett\'s role — must remain admin' });
      }
      updates.push(`role = $${paramIdx++}`);
      params.push(role);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(userId);

    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, username, name, role, avatar_color, is_active, last_login, created_at, updated_at`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user', message: err.message });
  }
});

// PUT /api/users/:id/reset-password
router.put('/:id/reset-password', async (req, res) => {
  try {
    const userId = Number(req.params.id);

    // Generate a random temporary password
    const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 4);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { rowCount } = await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ data: { temporary_password: tempPassword } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password', message: err.message });
  }
});

module.exports = router;
