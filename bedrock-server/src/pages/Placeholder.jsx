export default function Placeholder({ title, phase }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h2>{title}</h2>
      <p className="muted">This page is built in {phase}.</p>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        The Phase 1 deliverable is the Dashboard with login, power controls, status, swap resize, and the theme toggle.
      </p>
    </div>
  )
}
