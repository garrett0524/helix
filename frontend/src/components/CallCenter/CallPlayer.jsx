export default function CallPlayer({ recordingUrl }) {
  if (!recordingUrl) {
    return (
      <div style={{
        padding: 'var(--space-md)',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-tertiary)',
        fontSize: '13px',
        textAlign: 'center'
      }}>
        No recording available
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <audio
        controls
        src={recordingUrl}
        style={{
          width: '100%',
          height: '40px',
          borderRadius: 'var(--radius-md)'
        }}
      />
    </div>
  );
}
