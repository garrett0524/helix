function getDaysInStage(updatedAt) {
  if (!updatedAt) return 0;
  const updated = new Date(updatedAt);
  const now = new Date();
  return Math.floor((now - updated) / (1000 * 60 * 60 * 24));
}

function getCategoryIcon(category) {
  if (!category) return '?';
  const lower = category.toLowerCase();
  if (lower.includes('isp')) return 'ISP';
  if (lower.includes('msp')) return 'MSP';
  if (lower.includes('wisp')) return 'WISP';
  if (lower.includes('it')) return 'IT';
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
        <span className="kanban-card-days">{days}d</span>
      </div>
    </div>
  );
}
