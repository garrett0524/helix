import { useState, useEffect } from 'react'
import {
  getSettings, updateSettings, getGoogleCalendarAuthUrl, getGoogleCalendarStatus,
  disconnectGoogleCalendar, getGoogleCalendars, syncAllToGoogle,
  getUsers, createUser, updateUser, resetUserPassword, changePassword,
  getApolloStatus
} from '../../api'
import { useAuth } from '../../contexts/AuthContext'

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
};

const SCORING_RULES = [
  { factor: 'Category Match', points: '0-20', logic: 'Bars/Restaurants = 20, Gyms = 20, Other = 10' },
  { factor: 'Google Rating', points: '0-15', logic: '4.5+ = 15, 4.0-4.4 = 10, 3.5-3.9 = 5, below = 0' },
  { factor: 'Review Count', points: '0-15', logic: '100+ = 15, 50-99 = 10, 20-49 = 5, below = 0' },
  { factor: 'Has Phone Number', points: '0-10', logic: 'Yes = 10, No = 0' },
  { factor: 'Has Website', points: '0-10', logic: 'Yes = 10, No = 0' },
  { factor: 'Owner Name Found', points: '0-10', logic: 'Yes = 10, No = 0' },
  { factor: 'Engagement', points: '0-20', logic: 'Disabled -- will activate when outreach features are enabled', disabled: true },
];

export default function SettingsPanel() {
  const { logout } = useAuth();
  const isMobile = useIsMobile();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [googleStatus, setGoogleStatus] = useState({ connected: false, hasCredentials: false });
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMessage, setGoogleMessage] = useState(null);

  // User Management state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'member' });
  const [userMessage, setUserMessage] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);

  // Apollo status
  const [apolloTesting, setApolloTesting] = useState(false);
  const [apolloStatus, setApolloStatus] = useState(null);

  // Change Password state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwMessage, setPwMessage] = useState(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then(res => setSettings(res.data || {}))
      .catch(err => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false));

    getGoogleCalendarStatus()
      .then(res => {
        setGoogleStatus(res.data || { connected: false, hasCredentials: false });
        if (res.data?.connected) {
          getGoogleCalendars()
            .then(calRes => setGoogleCalendars(calRes.data || []))
            .catch(() => {});
        }
      })
      .catch(() => {});

    loadUsers();
  }, []);

  const loadUsers = () => {
    setUsersLoading(true);
    getUsers()
      .then(res => setUsers(res.data || []))
      .catch(err => console.error('Failed to load users:', err))
      .finally(() => setUsersLoading(false));
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings(settings);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setUserMessage(null);
    try {
      await createUser(newUser);
      setNewUser({ name: '', username: '', password: '', role: 'member' });
      setShowAddUser(false);
      setUserMessage({ type: 'success', text: 'User created successfully' });
      loadUsers();
    } catch (err) {
      setUserMessage({ type: 'error', text: err.message });
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active });
      loadUsers();
    } catch (err) {
      setUserMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateRole = async (userId, role) => {
    try {
      await updateUser(userId, { role });
      loadUsers();
    } catch (err) {
      setUserMessage({ type: 'error', text: err.message });
    }
  };

  const handleResetPassword = async (userId) => {
    try {
      const res = await resetUserPassword(userId);
      setTempPassword({ userId, password: res.data.temporary_password });
    } catch (err) {
      setUserMessage({ type: 'error', text: err.message });
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMessage(null);
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (pwForm.newPw.length < 6) {
      setPwMessage({ type: 'error', text: 'New password must be at least 6 characters' });
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.newPw);
      setPwMessage({ type: 'success', text: 'Password changed successfully' });
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      setPwMessage({ type: 'error', text: err.message || 'Failed to change password' });
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading settings...</div>;
  }

  return (
    <div style={{ maxWidth: isMobile ? '100%' : '700px' }}>
      {/* User Management */}
      <Section title="User Management">
        {usersLoading ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading users...</div>
        ) : (
          <>
            {isMobile ? (
              /* Mobile: Card view for users */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                {users.map(u => (
                  <div key={u.id} style={{
                    background: 'var(--bg-card-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-md)',
                    opacity: u.is_active ? 1 : 0.5,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: u.avatar_color || '#6366f1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}>
                        {u.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{u.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{u.username}</div>
                      </div>
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 600,
                        background: u.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: u.is_active ? '#10b981' : '#ef4444',
                      }}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                      <span>Role: {u.role}</span>
                      <span>Last login: {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '6px 12px', minHeight: '36px' }} onClick={() => handleResetPassword(u.id)}>
                        Reset PW
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '6px 12px', minHeight: '36px' }} onClick={() => handleToggleActive(u)}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {u.username !== 'garrett' && (
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                          style={{ fontSize: '12px', padding: '6px 8px', minHeight: '36px' }}
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table className="data-table" style={{ marginBottom: 'var(--space-md)' }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Last Login</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={!u.is_active ? { opacity: 0.5 } : {}}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: u.avatar_color || '#6366f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#fff',
                            flexShrink: 0,
                          }}>
                            {u.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          {u.name}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{u.username}</td>
                      <td>
                        {u.username === 'garrett' ? (
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Admin</span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                            style={{ fontSize: '12px', padding: '2px 4px' }}
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: u.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: u.is_active ? '#10b981' : '#ef4444',
                        }}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            onClick={() => handleResetPassword(u.id)}
                          >
                            Reset PW
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            onClick={() => handleToggleActive(u)}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tempPassword && (
              <div style={{
                padding: 'var(--space-md)',
                marginBottom: 'var(--space-md)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.2)',
                fontSize: '13px',
              }}>
                <strong>Temporary password for {users.find(u => u.id === tempPassword.userId)?.username}:</strong>
                <code style={{ display: 'block', marginTop: '4px', padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', fontSize: '14px', fontFamily: 'monospace' }}>
                  {tempPassword.password}
                </code>
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: '8px', fontSize: '11px' }}
                  onClick={() => setTempPassword(null)}
                >
                  Dismiss
                </button>
              </div>
            )}

            {userMessage && (
              <div style={{
                fontSize: '13px',
                marginBottom: 'var(--space-md)',
                color: userMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
              }}>
                {userMessage.text}
              </div>
            )}

            {!showAddUser ? (
              <button className="btn btn-primary" onClick={() => setShowAddUser(true)}>
                Add User
              </button>
            ) : (
              <div style={{
                padding: 'var(--space-lg)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
              }}>
                <h4 style={{ marginBottom: 'var(--space-md)' }}>New User</h4>
                <form onSubmit={handleAddUser}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={newUser.name}
                        onChange={(e) => setNewUser(p => ({ ...p, name: e.target.value }))}
                        placeholder="Display name"
                        required
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                        Username
                      </label>
                      <input
                        type="text"
                        value={newUser.username}
                        onChange={(e) => setNewUser(p => ({ ...p, username: e.target.value }))}
                        placeholder="Login username"
                        required
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                        Password
                      </label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser(p => ({ ...p, password: e.target.value }))}
                        placeholder="Initial password"
                        required
                        minLength={6}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                        Role
                      </label>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser(p => ({ ...p, role: e.target.value }))}
                        style={{ width: '100%' }}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                    <button type="submit" className="btn btn-primary">Create User</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Change Your Password */}
      <Section title="Change Your Password">
        <form onSubmit={handleChangePassword}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', maxWidth: '360px' }}>
            <div>
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
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                New Password
              </label>
              <input
                type="password"
                value={pwForm.newPw}
                onChange={(e) => setPwForm(p => ({ ...p, newPw: e.target.value }))}
                required
                minLength={6}
                style={{ width: '100%' }}
              />
            </div>
            <div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                {pwSaving ? 'Changing...' : 'Change Password'}
              </button>
              {pwMessage && (
                <span style={{ fontSize: '13px', color: pwMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {pwMessage.text}
                </span>
              )}
            </div>
          </div>
        </form>
      </Section>

      {/* Retell AI */}
      <Section title="Retell AI (Voice Calls)">
        <Field label="API Key">
          <input type="password" value={settings.retell_api_key || ''} onChange={e => handleChange('retell_api_key', e.target.value)} placeholder="Enter Retell AI API key" />
        </Field>
        <Field label="Voice ID">
          <input type="text" value={settings.retell_voice_id || ''} onChange={e => handleChange('retell_voice_id', e.target.value)} placeholder="ElevenLabs voice ID" />
        </Field>
      </Section>

      {/* Instantly.ai */}
      <Section title="Instantly.ai (Email Outreach)">
        <Field label="API Key">
          <input type="password" value={settings.instantly_api_key || ''} onChange={e => handleChange('instantly_api_key', e.target.value)} placeholder="Enter Instantly.ai API key" />
        </Field>
      </Section>

      {/* Apollo.io */}
      <Section title="Apollo.io (Lead Enrichment)">
        <Field label="API Key">
          <input type="password" value={settings.apollo_api_key || ''} onChange={e => handleChange('apollo_api_key', e.target.value)} placeholder="Enter Apollo API key" />
        </Field>
        <Field label="Test Connection">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <button
              className="btn btn-secondary"
              onClick={async () => {
                setApolloTesting(true);
                setApolloStatus(null);
                try {
                  // Save key first so the backend can use it
                  await updateSettings({ apollo_api_key: settings.apollo_api_key || '' });
                  const res = await getApolloStatus();
                  setApolloStatus(res.data || res);
                } catch (err) {
                  setApolloStatus({ valid: false, message: err.message });
                } finally {
                  setApolloTesting(false);
                }
              }}
              disabled={apolloTesting || !settings.apollo_api_key}
            >
              {apolloTesting ? 'Testing...' : 'Test Connection'}
            </button>
            {apolloStatus && (
              <span style={{
                fontSize: '13px',
                color: apolloStatus.valid ? 'var(--color-success)' : 'var(--color-error)',
              }}>
                {apolloStatus.valid ? 'Connected' : apolloStatus.message || 'Invalid key'}
              </span>
            )}
          </div>
        </Field>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          Get your API key from app.apollo.io &rarr; Settings &rarr; API Keys
        </p>
      </Section>

      {/* Scraper */}
      <Section title="Scraper Configuration">
        <Field label="Default Geography">
          <input type="text" value={settings.scraper_default_geography || ''} onChange={e => handleChange('scraper_default_geography', e.target.value)} />
        </Field>
        <Field label="Default Radius (miles)">
          <input type="number" value={settings.scraper_default_radius || '10'} onChange={e => handleChange('scraper_default_radius', e.target.value)} />
        </Field>
        <Field label="Categories (comma-separated)">
          <input type="text" value={settings.scraper_categories || ''} onChange={e => handleChange('scraper_categories', e.target.value)} />
        </Field>
      </Section>

      {/* Lead Scoring Rules */}
      <Section title="Lead Scoring Rules">
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="data-table" style={{ marginBottom: 'var(--space-md)' }}>
          <thead>
            <tr>
              <th>Factor</th>
              <th>Points</th>
              <th>Logic</th>
            </tr>
          </thead>
          <tbody>
            {SCORING_RULES.map((rule, i) => (
              <tr key={i} style={rule.disabled ? { opacity: 0.4 } : {}}>
                <td style={{ fontWeight: 500 }}>{rule.factor}</td>
                <td style={{ fontFamily: 'monospace' }}>{rule.points}</td>
                <td style={{ fontSize: '13px', color: rule.disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontStyle: rule.disabled ? 'italic' : 'normal' }}>{rule.logic}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          Current max: 80 points (Engagement disabled). Scores auto-calculate when leads are created or updated.
        </p>
      </Section>

      {/* AI Call Analysis */}
      <Section title="AI Call Analysis (Claude)">
        <Field label="Anthropic API Key">
          <input type="password" value={settings.anthropic_api_key || ''} onChange={e => handleChange('anthropic_api_key', e.target.value)} placeholder="Enter Anthropic API key (sk-ant-...)" />
        </Field>
        <Field label="Claude Model">
          <select value={settings.anthropic_model || 'haiku'} onChange={e => handleChange('anthropic_model', e.target.value)}>
            <option value="haiku">Haiku (fastest, cheapest)</option>
            <option value="sonnet">Sonnet (smarter, 5x more expensive)</option>
          </select>
        </Field>
        <Field label="Whisper Model Size">
          <select value={settings.whisper_model_size || 'base'} onChange={e => handleChange('whisper_model_size', e.target.value)}>
            <option value="tiny">Tiny (fastest, least accurate)</option>
            <option value="base">Base (recommended)</option>
            <option value="small">Small (better accuracy)</option>
            <option value="medium">Medium (best accuracy, slowest)</option>
          </select>
        </Field>
        <Field label="Auto-Apply AI Suggestions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <button
              className={`btn btn-sm ${settings.auto_apply_ai_suggestions === 'true' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleChange('auto_apply_ai_suggestions', settings.auto_apply_ai_suggestions === 'true' ? 'false' : 'true')}
              style={{ minWidth: '60px' }}
            >
              {settings.auto_apply_ai_suggestions === 'true' ? 'ON' : 'OFF'}
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              Automatically move leads to AI-suggested pipeline stage after call analysis
            </span>
          </div>
        </Field>
      </Section>

      {/* Google Calendar */}
      <Section title="Google Calendar">
        <Field label="Connection Status">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '13px',
              fontWeight: 500,
              background: googleStatus.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: googleStatus.connected ? '#10b981' : '#ef4444',
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: googleStatus.connected ? '#10b981' : '#ef4444',
              }} />
              {googleStatus.connected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
        </Field>
        <Field label="Google Client ID">
          <input type="text" value={settings.google_client_id || ''} onChange={e => handleChange('google_client_id', e.target.value)} placeholder="Your Google OAuth Client ID" />
        </Field>
        <Field label="Google Client Secret">
          <input type="password" value={settings.google_client_secret || ''} onChange={e => handleChange('google_client_secret', e.target.value)} placeholder="Your Google OAuth Client Secret" />
        </Field>
        <Field label="Connect / Disconnect">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            {!googleStatus.connected ? (
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setGoogleMessage(null);
                  try {
                    await updateSettings({
                      google_client_id: settings.google_client_id || '',
                      google_client_secret: settings.google_client_secret || '',
                    });
                    const res = await getGoogleCalendarAuthUrl();
                    if (res.data?.url) {
                      window.open(res.data.url, '_blank');
                      setGoogleMessage({ type: 'success', text: 'Authorization window opened. Complete the flow in the new tab.' });
                    }
                  } catch (err) {
                    setGoogleMessage({ type: 'error', text: err.message || 'Failed to start OAuth flow' });
                  }
                }}
                disabled={!settings.google_client_id || !settings.google_client_secret}
              >
                Connect Google Calendar
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await disconnectGoogleCalendar();
                    setGoogleStatus({ connected: false, hasCredentials: googleStatus.hasCredentials });
                    setGoogleCalendars([]);
                    setGoogleMessage({ type: 'success', text: 'Google Calendar disconnected' });
                  } catch (err) {
                    setGoogleMessage({ type: 'error', text: err.message });
                  }
                }}
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
              >
                Disconnect
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  const res = await getGoogleCalendarStatus();
                  setGoogleStatus(res.data || { connected: false, hasCredentials: false });
                  if (res.data?.connected) {
                    const calRes = await getGoogleCalendars();
                    setGoogleCalendars(calRes.data || []);
                    setGoogleMessage({ type: 'success', text: 'Status refreshed - connected!' });
                  } else {
                    setGoogleMessage(null);
                  }
                } catch (err) {
                  setGoogleMessage({ type: 'error', text: 'Failed to check status' });
                }
              }}
            >
              Refresh Status
            </button>
          </div>
        </Field>
        {googleStatus.connected && googleCalendars.length > 0 && (
          <Field label="Calendar to Sync">
            <select value={settings.google_calendar_id || 'primary'} onChange={e => handleChange('google_calendar_id', e.target.value)}>
              {googleCalendars.map(cal => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary}{cal.primary ? ' (Primary)' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {googleStatus.connected && (
          <Field label="Sync Existing Events">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  setGoogleSyncing(true);
                  setGoogleMessage(null);
                  try {
                    const res = await syncAllToGoogle();
                    setGoogleMessage({ type: 'success', text: res.message || 'Sync complete' });
                  } catch (err) {
                    setGoogleMessage({ type: 'error', text: err.message });
                  } finally {
                    setGoogleSyncing(false);
                  }
                }}
                disabled={googleSyncing}
              >
                {googleSyncing ? 'Syncing...' : 'Sync All Events to Google'}
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                Push all unsynced TesseraFlow events to Google Calendar
              </span>
            </div>
          </Field>
        )}
        {googleMessage && (
          <div style={{ fontSize: '13px', color: googleMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
            {googleMessage.text}
          </div>
        )}
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <Field label="Email (notify when lead hits 'Interested')">
          <input type="email" value={settings.notification_email || ''} onChange={e => handleChange('notification_email', e.target.value)} placeholder="garrett@example.com" />
        </Field>
        <Field label="SMS Number">
          <input type="text" value={settings.notification_sms || ''} onChange={e => handleChange('notification_sms', e.target.value)} placeholder="+1234567890" />
        </Field>
      </Section>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginTop: 'var(--space-xl)' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
        {message && (
          <span style={{ fontSize: '13px', color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
            {message.text}
          </span>
        )}
      </div>

      {/* Logout */}
      <div style={{ marginTop: 'var(--space-3xl)', paddingTop: 'var(--space-xl)', borderTop: '1px solid var(--border-default)' }}>
        <button
          className="btn btn-secondary"
          style={{ borderColor: '#ef4444', color: '#ef4444' }}
          onClick={logout}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
      <h3 style={{ marginBottom: 'var(--space-lg)', paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--border-default)' }}>
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
