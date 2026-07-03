export default function StatusBadge({ running, loading }) {
  const color = loading ? 'var(--color-text-muted)' : running ? 'var(--color-running)' : 'var(--color-stopped)'
  const label = loading ? 'Checking…' : running ? 'Running' : 'Stopped'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 999,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        fontWeight: 600,
        fontSize: '0.9rem',
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 0 3px ${color}33`,
        }}
      />
      {label}
    </span>
  )
}
