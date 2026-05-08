import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, BarChart3, Calendar, Mail, Globe, Settings, Megaphone, Phone, LogOut, KeyRound, Menu, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { changePassword } from '../../api'
const tesseraIcon = '/logo-white.png'
import './Navbar.css'

const allNavItems = [
  { path: '/', label: 'Pipeline', icon: LayoutDashboard },
  { path: '/analytics', label: 'Call Analytics', icon: BarChart3 },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/emails', label: 'Email Hub', icon: Mail },
  { path: '/scraper', label: 'Scraper Control', icon: Globe, adminOnly: true },
  { path: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
]

const comingSoonItems = [
  { path: '/outreach', label: 'Outreach Queue', icon: Megaphone },
  { path: '/calls', label: 'Call Center', icon: Phone },
]

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', new: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Filter nav items by role
  const navItems = allNavItems.filter(item => !item.adminOnly || isAdmin);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (pwForm.new !== pwForm.confirm) {
      setPwError('New passwords do not match');
      return;
    }
    if (pwForm.new.length < 6) {
      setPwError('New password must be at least 6 characters');
      return;
    }

    setPwLoading(true);
    try {
      await changePassword(pwForm.current, pwForm.new);
      setPwSuccess('Password changed successfully');
      setPwForm({ current: '', new: '', confirm: '' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPwSuccess('');
      }, 1500);
    } catch (err) {
      setPwError(err.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  // Get current page title for mobile header
  const currentPageTitle = (() => {
    const allItems = [...allNavItems, ...comingSoonItems];
    const match = allItems.find(item =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
    );
    return match?.label || 'TesseraFlow';
  })();

  return (
    <>
      {/* Mobile header bar */}
      <div className="mobile-header">
        <button
          className="mobile-hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={22} strokeWidth={2} />
        </button>
        <div className="mobile-header-brand">
          <img src={tesseraIcon} alt="TesseraFlow" className="sidebar-logo" style={{ width: '28px', height: '28px' }} />
          <span className="mobile-header-title">{currentPageTitle}</span>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <nav className={`sidebar ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-header">
          <img src={tesseraIcon} alt="TesseraFlow" className="sidebar-logo" />
          <div>
            <div className="sidebar-title">TesseraFlow</div>
            <div className="sidebar-subtitle">Lead Pipeline</div>
            <div className="sidebar-accent-line" />
          </div>
          <button
            className="mobile-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <ul className="sidebar-nav">
          {navItems.map(item => {
            const Icon = item.icon
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <span className="sidebar-icon">
                    <Icon size={18} strokeWidth={1.5} />
                  </span>
                  <span className="sidebar-label">{item.label}</span>
                </NavLink>
              </li>
            )
          })}

          {/* Divider */}
          <li>
            <div className="sidebar-divider" />
          </li>
          <li>
            <div className="sidebar-group-label">Coming Soon</div>
          </li>

          {comingSoonItems.map(item => {
            const Icon = item.icon
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  style={{ opacity: 0.4 }}
                >
                  <span className="sidebar-icon">
                    <Icon size={18} strokeWidth={1.5} />
                  </span>
                  <span className="sidebar-label">{item.label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>

        {/* User footer */}
        <div className="sidebar-footer" style={{ position: 'relative' }}>
          <div
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              cursor: 'pointer',
              padding: 'var(--space-sm)',
              borderRadius: 'var(--radius-md)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            {/* Avatar circle */}
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: user?.avatar_color || '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {user?.name || 'User'}
              </div>
              <div style={{
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                textTransform: 'capitalize',
              }}>
                {user?.role || 'member'}
              </div>
            </div>
          </div>

          {/* User menu dropdown */}
          {showUserMenu && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 'var(--space-sm)',
              right: 'var(--space-sm)',
              marginBottom: 'var(--space-xs)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              zIndex: 100,
              boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
            }}>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  setShowPasswordModal(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  width: '100%',
                  padding: 'var(--space-sm) var(--space-md)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <KeyRound size={14} /> Change Password
              </button>
              <button
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  width: '100%',
                  padding: 'var(--space-sm) var(--space-md)',
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid var(--border-default)',
                  color: '#ef4444',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '380px',
              padding: 'var(--space-2xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Change Password</h3>
            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={pwForm.current}
                  onChange={(e) => setPwForm(p => ({ ...p, current: e.target.value }))}
                  required
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={pwForm.new}
                  onChange={(e) => setPwForm(p => ({ ...p, new: e.target.value }))}
                  required
                  minLength={6}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  required
                  minLength={6}
                  style={{ width: '100%' }}
                />
              </div>
              {pwError && (
                <div style={{ marginBottom: 'var(--space-md)', color: '#ef4444', fontSize: '13px' }}>{pwError}</div>
              )}
              {pwSuccess && (
                <div style={{ marginBottom: 'var(--space-md)', color: 'var(--color-success)', fontSize: '13px' }}>{pwSuccess}</div>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                  {pwLoading ? 'Changing...' : 'Change Password'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
