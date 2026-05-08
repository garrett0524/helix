function getDaysInStage(updatedAt) {
  if (!updatedAt) return 0;
  const updated = new Date(updatedAt);
  const now = new Date();
  return Math.floor((now - updated) / (1000 * 60 * 60 * 24));
}

function getCategoryIcon(category) {
  if (!category) return '?';
  const lower = category.toLowerCase();
  if (lower.includes('bar') || lower.includes('pub') || lower.includes('tavern')) return 'B';
  if (lower.includes('restaurant')) return 'R';
  if (lower.includes('gym') || lower.includes('fitness') || lower.includes('crossfit')) return 'G';
  if (lower.includes('yoga')) return 'Y';
  return category.charAt(0).toUpperCase();
}

export default function KanbanCard({ lead, stageColor, onDragStart, onDragEnd, onClick }) {
  const days = getDaysInStage(lead.updated_at);

  return (
    <div
      className="kanban-card"
      style={{ borderColor: `${stageColor}20` }}
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="kanban-card-name" title={lead.business_name}>
        {lead.business_name}
      </div>
      <div className="kanban-card-meta">
        <span className="kanban-card-category">
          {getCategoryIcon(lead.category)} {lead.category || 'Unknown'}
        </span>
        {lead.last_contact_method && lead.last_contact_method !== 'none' && (
          <span>{lead.last_contact_method === 'call' ? 'Called' : 'Emailed'}</span>
        )}
        <span className="kanban-card-days">{days}d</span>
      </div>
    </div>
  );
}
