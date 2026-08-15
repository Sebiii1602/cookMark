import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const tabs = [
  {
    to: '/',
    label: 'Rezepte',
    icon: (
      <TabIcon>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v13.5" />
        <path d="M4 5.5v13A1.5 1.5 0 0 0 5.5 20H20" />
        <path d="M8 8.5h8M8 12h5" />
      </TabIcon>
    ),
  },
  {
    to: '/einkaufen',
    label: 'Einkaufen',
    icon: (
      <TabIcon>
        <path d="M4 6h2l2 10.5h9.5" />
        <path d="M6.5 8.5H20l-1.5 6H8" />
        <circle cx="9.5" cy="19.5" r="1.2" />
        <circle cx="17" cy="19.5" r="1.2" />
      </TabIcon>
    ),
  },
  {
    to: '/mehr',
    label: 'Mehr',
    icon: (
      <TabIcon>
        <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      </TabIcon>
    ),
  },
]

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur">
      <div
        className="mx-auto grid max-w-md grid-cols-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                isActive ? 'text-herb-deep' : 'text-faint'
              }`
            }
          >
            {tab.icon}
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
