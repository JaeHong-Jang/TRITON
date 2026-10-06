// 왼쪽 메뉴와 위 막대가 있는 콘솔 틀
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { api } from '../api/client'
import { DashboardContext } from './DashboardContext'
import { Icon } from './icons'
import { FOOT, findNav, NAV, type NavItem } from './nav'
import { usePoll } from './usePoll'
import './console.css'

const COURT_KEY = 'ai-court-last-court'

// 저장소 읽기
function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

// 메뉴 한 줄
function NavLinkItem({ item, active, to, dim, full }: { item: NavItem; active: boolean; to: string; dim?: boolean; full?: boolean }) {
  return (
    <Link
      to={to}
      title={item.label}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors ${
        active ? 'tribunal-nav-active font-bold' : dim ? 'tribunal-nav-muted' : 'tribunal-nav-link font-medium'
      }`}
    >
      {active ? <span className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brass-300" /> : null}
      <Icon name={item.icon} className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-brass-200' : 'text-stone-400 group-hover:text-white'}`} />
      <span className={full ? '' : 'hidden min-[900px]:inline'}>{item.label}</span>
    </Link>
  )
}

// 로고 한 줄
function Brand({ full }: { full?: boolean }) {
  const show = full ? 'inline' : 'hidden min-[900px]:inline'
  return (
    <Link to="/" className={`flex h-20 shrink-0 items-center gap-3 border-b border-white/10 px-3.5 ${full ? 'px-5' : 'min-[900px]:px-5'}`} title="AI 법정 홈">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-brass-300/30 bg-brass-300/10 text-brass-200">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v15M6 20h12M5 7h14M5 7l-2.5 6a2.8 2.8 0 0 0 5 0L5 7ZM19 7l-2.5 6a2.8 2.8 0 0 0 5 0L19 7Z" />
        </svg>
      </span>
      <span className={show}><span className="block text-[19px] font-black tracking-[0.16em] text-white">TRITON<span className="text-brass-300">.</span></span><span className="mt-0.5 block text-[10px] tracking-[0.14em] text-stone-400">AI 법정 운영 시스템</span></span>
    </Link>
  )
}

// 메뉴 목록과 맨 아래 구현 현황
function MenuBody({ path, court, full }: { path: string; court: string | null; full?: boolean }) {
  const cur = findNav(path)
  const hrefOf = (item: NavItem) => (item.prefix === '/court' ? (court ? `/court/${court}` : '/cases') : item.to)
  return (
    <>
      <nav className={`min-h-0 flex-1 space-y-6 overflow-y-auto px-2 py-5 ${full ? 'px-3' : 'min-[900px]:px-3'}`} aria-label="주 메뉴">
        {NAV.map((g, gi) => (
          <div key={gi}>
            {g.title ? (
              <>
                <p className={`mb-2 px-3 text-[10px] font-semibold tracking-[0.12em] text-stone-400 ${full ? 'block' : 'hidden min-[900px]:block'}`}>{g.title}</p>
                {full ? null : <div className="mx-2 mb-2 border-t border-white/10 min-[900px]:hidden" />}
              </>
            ) : null}
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <NavLinkItem key={item.label} item={item} to={hrefOf(item)} active={cur?.item === item} full={full} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className={`shrink-0 border-t border-white/10 px-2 py-3 ${full ? 'px-3' : 'min-[900px]:px-3'}`}>
        <NavLinkItem item={FOOT} to={FOOT.to} active={cur?.item === FOOT} dim full={full} />
      </div>
    </>
  )
}

// 왼쪽 메뉴 (768px 이상)
function Sidebar({ path, court }: { path: string; court: string | null }) {
  return (
    <aside className="tribunal-sidebar hidden w-16 shrink-0 flex-col min-[768px]:flex min-[900px]:w-[216px]" aria-label="콘솔 메뉴">
      <Brand />
      <Link to="/cases" className="tribunal-sidebar-cta mx-4 mt-5 hidden min-[900px]:flex"><span aria-hidden>＋</span> 기사 등록하기</Link>
      <MenuBody path={path} court={court} />
    </aside>
  )
}

// 모바일 메뉴 서랍 (포커스 가두기 · Esc 닫기)
function Drawer({ path, court, onClose }: { path: string; court: string | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = panel.current
    el?.querySelector<HTMLElement>('button')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab' || !el) return
      const f = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus())
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus())
      else if (!el.contains(document.activeElement)) (e.preventDefault(), first.focus())
    }
    const wide = window.matchMedia('(min-width: 768px)')
    const grow = () => wide.matches && onClose()
    document.addEventListener('keydown', key)
    wide.addEventListener('change', grow)
    return () => {
      document.removeEventListener('keydown', key)
      wide.removeEventListener('change', grow)
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 min-[768px]:hidden">
      <button type="button" tabIndex={-1} aria-hidden className="absolute inset-0 h-full w-full cursor-default bg-stone-900/40" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="콘솔 메뉴" className="tribunal-sidebar relative flex h-full w-[min(18rem,85vw)] flex-col shadow-2xl">
        <div className="flex items-center border-b border-white/10 pr-2">
          <div className="min-w-0 flex-1"><Brand full /></div>
          <button type="button" onClick={onClose} aria-label="메뉴 닫기" className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-300 hover:bg-white/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <MenuBody path={path} court={court} full />
      </div>
    </div>
  )
}

// 위 막대
function TopBar({ path, working, onMenu, menuRef }: { path: string; working: number; onMenu: () => void; menuRef: React.RefObject<HTMLButtonElement | null> }) {
  const cur = findNav(path)
  const [judge, setJudge] = useState(() => readPref('ai-court-judge', '판사1'))
  useEffect(() => {
    setJudge(readPref('ai-court-judge', '판사1'))
  }, [path, working])
  const tail = path.startsWith('/records/') ? decodeURIComponent(path.split('/')[2] ?? '') : null
  return (
    <header className="tribunal-topbar flex h-[58px] shrink-0 items-center gap-3 px-4 min-[900px]:px-7">
      <button ref={menuRef} type="button" onClick={onMenu} aria-label="메뉴 열기" aria-haspopup="dialog" className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 min-[768px]:hidden">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <nav aria-label="현재 위치" className="flex min-w-0 items-center gap-1.5 text-sm">
        {cur?.group && !path.startsWith('/court') ? <><span className="hidden text-stone-400 sm:inline">{cur.group}</span><span className="hidden text-stone-300 sm:inline">›</span></> : null}
        <h1 className="truncate text-[15px] font-black text-stone-900">{cur?.item.label ?? '콘솔'}</h1>
        {tail ? <><span className="text-stone-300">›</span><span className="truncate text-stone-500">{tail}</span></> : null}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {import.meta.env.VITE_MOCK === '1' ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900">모의 시연</span> : null}
        {working > 0 ? (
          <Link to="/agents" className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100" title="작업실에서 보기">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            AI 작동 중 {working}
          </Link>
        ) : null}
        <span className="flex items-center gap-2 text-sm font-semibold text-stone-700">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-xs font-black text-stone-700" aria-hidden>{judge.slice(0, 1)}</span>
          <span className="hidden sm:inline">{judge}</span>
        </span>
      </div>
    </header>
  )
}

// 콘솔 틀 컴포넌트
export function ConsoleShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { data, error } = usePoll(() => api.dashboard(), 3000)
  const [court, setCourt] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(COURT_KEY)
    } catch {
      return null
    }
  })
  useEffect(() => {
    const m = pathname.match(/^\/court\/([^/]+)/)
    if (!m) return
    setCourt(m[1])
    try {
      sessionStorage.setItem(COURT_KEY, m[1])
    } catch {
      // 저장소 접근 실패 시 무시
    }
  }, [pathname])
  const [open, setOpen] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    menuBtn.current?.focus()
  }, [])
  useEffect(() => setOpen(false), [pathname])
  const working = data ? Math.max(data.agentsWorking, data.activeJobs.length) : 0
  return (
    <DashboardContext.Provider value={{ data, error }}>
      <div className="tribunal-console flex h-dvh text-stone-900">
        <Sidebar path={pathname} court={court} />
        {open ? <Drawer path={pathname} court={court} onClose={close} /> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar path={pathname} working={working} onMenu={() => setOpen(true)} menuRef={menuBtn} />
          <main className="tribunal-main min-h-0 flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </DashboardContext.Provider>
  )
}
