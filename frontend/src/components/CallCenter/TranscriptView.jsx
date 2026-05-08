export default function TranscriptView({ transcript }) {
  if (!transcript) return null;

  const lines = transcript.split('\n').filter(l => l.trim());

  const parseLine = (line) => {
    // New format: [M:SS] Speaker 1: text
    const diarizedMatch = line.match(/^\[(\d+:\d{2})\]\s*(Speaker \d+):\s*(.*)$/);
    if (diarizedMatch) {
      return { timestamp: diarizedMatch[1], speaker: diarizedMatch[2], text: diarizedMatch[3] };
    }
    // Legacy format: AI: text / Business: text
    if (line.startsWith('AI:')) return { speaker: 'AI', text: line.replace(/^AI:\s*/, '') };
    if (line.startsWith('Business:')) return { speaker: 'Business', text: line.replace(/^Business:\s*/, '') };
    return { speaker: null, text: line };
  };

  const speakerColor = (speaker) => {
    if (speaker === 'Speaker 1' || speaker === 'AI') return 'var(--accent-primary)';
    if (speaker === 'Speaker 2' || speaker === 'Business') return 'var(--color-success)';
    return 'transparent';
  };

  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>Transcript</h4>
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-lg)',
        maxHeight: '300px',
        overflowY: 'auto',
        fontSize: '13px',
        lineHeight: '1.6'
      }}>
        {lines.map((line, i) => {
          const parsed = parseLine(line);
          const color = speakerColor(parsed.speaker);

          return (
            <div key={i} style={{
              marginBottom: 'var(--space-sm)',
              paddingLeft: 'var(--space-md)',
              borderLeft: `2px solid ${color}`
            }}>
              {parsed.timestamp && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)', marginRight: 'var(--space-sm)' }}>
                  {parsed.timestamp}
                </span>
              )}
              {parsed.speaker ? (
                <>
                  <span style={{ color, fontWeight: 600 }}>{parsed.speaker}: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{parsed.text}</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>{parsed.text}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
