// 메뉴 아이콘 모음
import type { ReactNode } from 'react'

// 아이콘 이름
export type IconName = 'home' | 'inbox' | 'court' | 'office' | 'graph' | 'ledger' | 'chart' | 'flask' | 'list' | 'menu'

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h5v-5.5h3v5.5h5V10" />,
  inbox: <path d="M4 13.5 6.5 5h11L20 13.5M4 13.5V19h16v-5.5M4 13.5h4.5a3.5 3.5 0 0 0 7 0H20" />,
  court: <path d="M3.5 9 12 4l8.5 5M5.5 9.5V17M10 9.5V17M14 9.5V17M18.5 9.5V17M3.5 20h17M4.5 17h15" />,
  office: <path d="M3.5 18.5 12 22l8.5-3.5V9.5L12 6 3.5 9.5v9ZM3.5 9.5 12 13l8.5-3.5M12 13v9" />,
  graph: <path d="M6 7a2 2 0 1 0 0-.01M18 7a2 2 0 1 0 0-.01M12 18a2 2 0 1 0 0-.01M7.7 8.2l3.2 7.8M16.3 8.2 13.1 16M8 7h8" />,
  ledger: <path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14.5H7.5A1.5 1.5 0 0 1 6 18V3.5ZM6 18a1.5 1.5 0 0 1 1.5-1.5h11M9.5 8h5.5M9.5 11.5h5.5" />,
  chart: <path d="M4 20h16M7 17v-5M12 17V6M17 17v-8" />,
  flask: <path d="M9.5 3.5h5M10.5 3.5v6L5 18.5A1.5 1.5 0 0 0 6.3 21h11.4a1.5 1.5 0 0 0 1.3-2.5l-5.5-9v-6M8 15h8" />,
  list: <path d="M9 6.5h10.5M9 12h10.5M9 17.5h10.5M4.5 6.5l1 1 1.8-2M4.5 12l1 1 1.8-2M4.5 17.5l1 1 1.8-2" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
}

// 선 아이콘 하나
export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[name]}
    </svg>
  )
}
