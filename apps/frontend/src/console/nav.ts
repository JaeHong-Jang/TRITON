// 콘솔 메뉴 정의
import type { IconName } from './icons'

// 메뉴 항목
export interface NavItem { to: string; label: string; icon: IconName; prefix: string }
// 메뉴 묶음
export interface NavGroup { title: string | null; items: NavItem[] }

// 메뉴 묶음 목록
export const NAV: NavGroup[] = [
  { title: null, items: [{ to: '/', label: '대시보드', icon: 'home', prefix: '/' }] },
  {
    title: '재판',
    items: [
      { to: '/cases', label: '사건 접수', icon: 'inbox', prefix: '/cases' },
      { to: '/cases', label: '법정', icon: 'court', prefix: '/court' },
    ],
  },
  { title: '에이전트', items: [{ to: '/agents', label: '작업실', icon: 'office', prefix: '/agents' }] },
  {
    title: '규칙과 기록',
    items: [
      { to: '/rules', label: '규칙 · 온톨로지', icon: 'graph', prefix: '/rules' },
      { to: '/records', label: '감사 장부', icon: 'ledger', prefix: '/records' },
      { to: '/stats', label: '통계 · 비용', icon: 'chart', prefix: '/stats' },
      { to: '/lab', label: '실험실', icon: 'flask', prefix: '/lab' },
    ],
  },
]

// 메뉴 맨 아래 항목
export const FOOT: NavItem = { to: '/progress', label: '구현 현황', icon: 'list', prefix: '/progress' }

// 현재 경로에 맞는 메뉴 찾기
export function findNav(path: string): { group: string | null; item: NavItem } | null {
  const all = [...NAV.flatMap((g) => g.items.map((item) => ({ group: g.title, item }))), { group: null, item: FOOT }]
  const hit = all.filter(({ item }) => (item.prefix === '/' ? path === '/' : path === item.prefix || path.startsWith(`${item.prefix}/`)))
  return hit.sort((a, b) => b.item.prefix.length - a.item.prefix.length)[0] ?? null
}
