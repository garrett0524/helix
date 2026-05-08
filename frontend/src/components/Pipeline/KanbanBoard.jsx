import { useState } from 'react'
import KanbanCard from './KanbanCard'
import './KanbanBoard.css'

// MSP pipeline stages (Phase 5) — order matters for left-to-right kanban flow.
// Colors are sourced from CSS tokens defined in index.css (--stage-*).
const STAGES = [
  { key: 'new', label: 'New', color: 'var(--stage-new)' },
  { key: 'outreach_sent', label: 'Outreach Sent', color: 'var(--stage-outreach_sent)' },
  { key: 'responded', label: 'Responded', color: 'var(--stage-responded)' },
  { key: 'discovery_call', label: 'Discovery Call', color: 'var(--stage-discovery_call)' },
  { key: 'technical_review', label: 'Technical Review', color: 'var(--stage-technical_review)' },
  { key: 'contract_sent', label: 'Contract Sent', color: 'var(--stage-contract_sent)' },
  { key: 'onboarding', label: 'Onboarding', color: 'var(--stage-onboarding)' },
  { key: 'live', label: 'Live', color: 'var(--stage-live)' },
  { key: 'dead', label: 'Dead', color: 'var(--stage-dead)' },
];

export default function KanbanBoard({ leads, onStageChange, onCardClick }) {
  const [draggedLead, setDraggedLead] = useState(null);

  const getLeadsByStage = (stage) => {
    return leads.filter(l => l.pipeline_stage === stage);
  };

  const handleDragStart = (e, lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, stage) => {
    e.preventDefault();
    if (draggedLead && draggedLead.pipeline_stage !== stage) {
      onStageChange(draggedLead.id, stage);
    }
    setDraggedLead(null);
  };

  const handleDragEnd = () => {
    setDraggedLead(null);
  };

  return (
    <div className="kanban-board">
      {STAGES.map(stage => {
        const stageLeads = getLeadsByStage(stage.key);
        return (
          <div
            key={stage.key}
            className="kanban-column"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage.key)}
          >
            <div className="kanban-column-header" style={{ borderTopColor: stage.color }}>
              <span className="kanban-column-dot" style={{ background: stage.color }}></span>
              <span className="kanban-column-title">{stage.label}</span>
              <span className="kanban-column-count" style={{ background: `${stage.color}15`, color: stage.color }}>{stageLeads.length}</span>
            </div>
            <div className="kanban-column-body">
              {stageLeads.map(lead => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
                  stageColor={stage.color}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onClick={() => onCardClick(lead)}
                />
              ))}
              {stageLeads.length === 0 && (
                <div className="kanban-empty">No leads</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
