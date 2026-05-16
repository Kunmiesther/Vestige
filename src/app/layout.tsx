import type { Metadata } from 'next'
import './globals.css'
import { WalletProvider } from '@/contexts/WalletContext'
import { NavBar } from '@/components/NavBar'

export const metadata: Metadata = {
  title: 'Vestige — Transparent AI Prediction Intelligence',
  description: 'Bet against an AI that shows you exactly how it thinks.',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='5' fill='%23050507'/><path d='M7 9 L16 23 L25 9' stroke='%23b388ff' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/><circle cx='16' cy='23' r='2.5' fill='%23ccff00'/></svg>",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Animated background */}
        <div className="scene">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
          <div className="blob blob-4" />
        </div>
        <div className="grain" />

        <WalletProvider>
          <NavBar />
          <div className="page-wrap" style={{ paddingTop: 56 }}>
            {children}
          </div>
        </WalletProvider>
      </body>
    </html>
  )
}
