import { useState } from 'react'
import { runScraper, importLeads } from '../../api'

export default function ScraperControl({ onScraperDone }) {
  const [category, setCategory] = useState('restaurants');
  const [geography, setGeography] = useState('Long Island, NY');
  const [radius, setRadius] = useState(10);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRunScrape = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await runScraper({ category, geography, radius });
      setResult(res);
      if (onScraperDone) onScraperDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportResult(null);
    setError(null);
    try {
      const res = await importLeads(file);
      setImportResult(res);
      if (onScraperDone) onScraperDone();
    } catch (err) {
      setError(err.message);
    }
    e.target.value = '';
  };

  const handleCSVExport = async () => {
    try {
      const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';
      const response = await fetch(`${API_BASE}/leads/export/csv`, { credentials: 'include' });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tesseraflow-leads.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Export failed: ' + err.message);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
      <h3 style={{ marginBottom: 'var(--space-lg)' }}>Run New Scrape</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: 'var(--space-md)', alignItems: 'end', marginBottom: 'var(--space-lg)' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
            Category
          </label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="restaurants">Restaurants</option>
            <option value="bars">Bars & Pubs</option>
            <option value="gyms">Gyms & Fitness</option>
            <option value="all">All Categories</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
            Geography
          </label>
          <input type="text" value={geography} onChange={e => setGeography(e.target.value)} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
            Radius (mi)
          </label>
          <input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} min={1} max={50} />
        </div>
        <button className="btn btn-primary" onClick={handleRunScrape} disabled={running} style={{ height: '38px' }}>
          {running ? 'Running...' : 'Run Scrape'}
        </button>
      </div>

      {/* CSV Import/Export */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-default)' }}>
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          Import CSV
          <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} />
        </label>
        <button className="btn btn-secondary" onClick={handleCSVExport}>
          Export CSV
        </button>
      </div>

      {/* Results */}
      {error && (
        <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--color-error)', fontSize: '13px' }}>
          {error}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--color-success)', fontSize: '13px' }}>
          Scrape started. Job ID: {result.job?.id || 'unknown'}
        </div>
      )}
      {importResult && (
        <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--color-success)', fontSize: '13px' }}>
          Import complete: {importResult.imported} imported, {importResult.skipped} duplicates skipped
          {importResult.errors > 0 && `, ${importResult.errors} errors`}
        </div>
      )}
    </div>
  );
}
