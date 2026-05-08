import { useState, useEffect } from 'react'
import CallLog from '../components/CallCenter/CallLog'
import { getCalls } from '../api'

export default function CallCenterPage() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCalls()
      .then(res => setCalls(res.data || []))
      .catch(err => console.error('Failed to load calls:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleScheduleCallback = (call) => {
    const callbackTime = call.callback_time || 'this week';
    alert(`Callback reminder: Call ${call.business_name || 'lead'} at ${call.phone || 'unknown'}\nScheduled: ${callbackTime}`);
  };

  if (loading) {
    return <div style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading calls...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Call Center</h1>
        <p>Retell AI call log with recordings, transcripts, and outcomes</p>
      </div>
      <CallLog calls={calls} onScheduleCallback={handleScheduleCallback} />
    </div>
  );
}
