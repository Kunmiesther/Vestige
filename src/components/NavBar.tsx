'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { WalletButton } from './WalletButton'

const NAV_LINKS = [
  { href: '/markets', label: 'Markets' },
  { href: '/traces',  label: 'Traces'  },
  { href: '/agent',   label: 'Agent'   },
]

export function NavBar() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav className="nav">
      <Link href="/" className="nav-logo">
        VST<em>IGE</em>
      </Link>

      <div className="nav-links">
        {NAV_LINKS.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${isActive(link.href) ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="nav-right">
        <span className="live-chip hide-mobile">
          <span className="live-dot" />
          Agent live
        </span>
        <WalletButton />
      </div>
    </nav>
  )
}
