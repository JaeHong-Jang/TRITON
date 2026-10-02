// 등각(2:1) 투영 좌표와 상자 그리기
import type { ReactNode } from 'react'

// 칸 반폭
export const HW = 32
// 칸 반높이
export const HH = 16

// 화면 좌표
export type Pt = [number, number]
// 방 원점의 화면 좌표
export interface Origin { ox: number; oy: number }

// 월드 좌표를 화면 좌표로 변환
export function proj(o: Origin, x: number, y: number, z = 0): Pt {
  return [o.ox + (x - y) * HW, o.oy + (x + y) * HH - z]
}

// 꼭짓점 목록을 polygon 문자열로
export function poly(pts: Pt[]): string {
  return pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
}

// 글자 폭 어림 계산
export function textWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) >= 0x1100 ? size * 0.98 : size * 0.58
  return w
}

// 색을 밝게(+) 또는 어둡게(-) 섞기
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

// 등각 상자 (윗면 · 왼쪽 면 · 오른쪽 면)
export function IsoBox({ o, x, y, z = 0, w, d, h, color, className }: { o: Origin; x: number; y: number; z?: number; w: number; d: number; h: number; color: string; className?: string }): ReactNode {
  const top: Pt[] = [proj(o, x, y, z + h), proj(o, x + w, y, z + h), proj(o, x + w, y + d, z + h), proj(o, x, y + d, z + h)]
  const left: Pt[] = [proj(o, x, y + d, z), proj(o, x + w, y + d, z), proj(o, x + w, y + d, z + h), proj(o, x, y + d, z + h)]
  const right: Pt[] = [proj(o, x + w, y, z), proj(o, x + w, y + d, z), proj(o, x + w, y + d, z + h), proj(o, x + w, y, z + h)]
  return (
    <g className={className}>
      <polygon points={poly(left)} fill={shade(color, -0.1)} />
      <polygon points={poly(right)} fill={shade(color, -0.24)} />
      <polygon points={poly(top)} fill={shade(color, 0.1)} />
    </g>
  )
}
