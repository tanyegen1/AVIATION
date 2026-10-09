import { NavLink } from 'react-router-dom'

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const tabs = [
    { to: `/projects/${projectId}`, label: 'Overview', end: true },
    { to: `/projects/${projectId}/documents`, label: 'Documents', end: false },
    { to: `/projects/${projectId}/findings`, label: 'Findings', end: false },
    { to: `/projects/${projectId}/export`, label: 'Export', end: false },
  ]
  return (
    <div className="toolbar" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 20 }}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          style={({ isActive }) => ({
            padding: '6px 4px',
            fontWeight: 600,
            fontSize: 13,
            color: isActive ? 'var(--navy)' : 'var(--muted)',
            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
          })}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}
