import { useState, useEffect, useCallback } from 'react'
import QueueList from '../components/OutreachQueue/QueueList'
import { getOutreachQueue, approveOutreach, rejectOutreach, approveBatchOutreach } from '../api'

export default function OutreachPage() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    try {
      const result = await getOutreachQueue();
      setItems(result.data || []);
      setSummary(result.summary || {});
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleApprove = async (id) => {
    try {
      await approveOutreach(id);
      await fetchQueue();
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleReject = async (id) => {
    try {
      await rejectOutreach(id);
      await fetchQueue();
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  const handleBatchApprove = async (ids) => {
    try {
      await approveBatchOutreach(ids);
      await fetchQueue();
    } catch (err) {
      console.error('Failed to batch approve:', err);
    }
  };

  if (loading) {
    return <div style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading queue...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Outreach Queue</h1>
        <p>Review and approve queued calls and emails before they fire</p>
      </div>
      <QueueList
        items={items}
        summary={summary}
        onApprove={handleApprove}
        onReject={handleReject}
        onBatchApprove={handleBatchApprove}
        onRefresh={fetchQueue}
      />
    </div>
  );
}
