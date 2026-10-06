// 2D 법정 배치 계산 순수 함수
import type { Stance } from '../api/types'
import { fmtWeight, MAX_TILT, type WeightItem } from '../lib/scale'

// 접시당 보이는 근거 최대 수
export const MAX_SHOWN = 8
// 쌓기 한 줄 개수
export const PER_ROW = 3
// 천칭 보 반길이
export const ARM = 190
// 보 끝에서 접시까지 줄 길이
export const HANG = 160
// 천칭 받침점 좌표
export const PIVOT = { x: 800, y: 430 }
// 접시 반지름
export const PAN_R = 110

// 쌓기 칸 위치와 크기
export interface Slot { x: number; y: number; w: number; h: number }

// 글자 폭 환산 (한글·전각 1, 나머지 0.55)
export function textUnits(text: string): number {
  let n = 0
  for (const ch of text) n += /[ᄀ-ᇿ㄰-㆏가-힯⺀-鿿＀-￯]/.test(ch) ? 1 : 0.55
  return n
}

// 폭 한도에 맞춘 말줄임
export function truncate(text: string, maxUnits: number): string {
  if (textUnits(text) <= maxUnits) return text
  let out = ''
  for (const ch of text) {
    if (textUnits(`${out}${ch}…`) > maxUnits) break
    out += ch
  }
  return `${out.trimEnd()}…`
}

// 폭 한도에 맞춘 줄바꿈과 마지막 줄 말줄임
export function wrapText(text: string, maxUnits: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  const chars = [...text.replace(/\s+/g, ' ').trim()]
  let i = 0
  for (; i < chars.length && lines.length < maxLines; i++) {
    if (textUnits(line + chars[i]) > maxUnits && line) {
      lines.push(line.trimEnd())
      line = ''
      if (lines.length === maxLines) break
    }
    line += chars[i]
  }
  if (lines.length < maxLines && line) {
    lines.push(line.trimEnd())
    i = chars.length
  }
  if (i < chars.length && lines.length) lines[lines.length - 1] = truncate(`${lines[lines.length - 1]}${chars.slice(i).join('')}`, maxUnits)
  return lines
}

// 접시에 올릴 근거와 가려진 개수 (선택한 근거는 항상 포함)
export function visibleOf<T extends { evidenceId: string }>(items: T[], focusId: string | null, max = MAX_SHOWN): { shown: T[]; hidden: number } {
  const head = items.slice(0, max)
  const extra = items.slice(max).find((w) => w.evidenceId === focusId)
  const shown = extra ? [...head.slice(0, max - 1), extra] : head
  return { shown, hidden: items.length - shown.length }
}

// 근거 무게에 따른 블록 크기
export function blockSize(weight: number, narrow: boolean): { w: number; h: number } {
  const k = narrow ? 1.3 : 1
  return { w: (50 + 6 * Math.max(1, weight)) * k, h: 32 * k }
}

// 접시 위 쌓기 칸 계산 (아래부터 한 줄 3개)
export function stackSlots(items: WeightItem[], narrow = false): { slots: Slot[]; top: number } {
  const slots: Slot[] = []
  let base = 0
  const per = narrow ? PER_ROW - 1 : PER_ROW
  for (let i = 0; i < items.length; i += per) {
    const row = items.slice(i, i + per)
    const sizes = row.map((w) => blockSize(w.weight, narrow))
    const gap = 6
    const width = sizes.reduce((s, z) => s + z.w, 0) + gap * (row.length - 1)
    const h = Math.max(...sizes.map((z) => z.h))
    let x = -width / 2
    row.forEach((_, k) => {
      slots.push({ x, y: -(base + h), w: sizes[k].w, h: sizes[k].h })
      x += sizes[k].w + gap
    })
    base += h + 4
  }
  return { slots, top: base }
}

// 바닥에 쌓이는 무효 근거 칸
export function floorSlot(i: number, stance: Stance): Slot {
  const w = 48
  const dir = stance === 'pro' ? -1 : 1
  return { x: dir * (66 + i * (w + 6)) - (dir === -1 ? w : 0), y: 0, w, h: 34 }
}

// 근거 번호 표시
export function weightTag(item: WeightItem): string {
  return item.evidence.kind === 'absence' ? '부재' : `#${item.evidence.sentenceNo}`
}

// 근거 접근성 설명
export function weightAria(item: WeightItem, agentName: string): string {
  const fate = item.fate === 'void' ? ' · 무효' : item.fate === 'halved' ? ' · 절반' : ''
  return `${weightTag(item)} ${item.stance === 'pro' ? '찬성' : '반대'} 근거 · ${agentName} 제출 · 무게 ${fmtWeight(item.weight)}${fate}`
}

// 접시 아래 범례 문구
export function legendText(stance: Stance, total: number, narrow: boolean): string {
  const n = fmtWeight(total)
  if (stance === 'pro') return narrow ? `◀ 찬성 ${n}` : `◀ 찬성 · 낚시성이다 ${n}`
  return narrow ? `반대 ${n} ▶` : `반대 · 낚시성 아니다 ${n} ▶`
}

// 보 기울기 각도 (라디안, 양수 = 왼쪽 내려감)
export function clampTilt(tilt: number): number {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt))
}

// 보 양 끝 좌표 (받침점 기준)
export function beamEnds(tilt: number): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const a = clampTilt(tilt)
  return { left: { x: -ARM * Math.cos(a), y: ARM * Math.sin(a) }, right: { x: ARM * Math.cos(a), y: -ARM * Math.sin(a) } }
}

// 말풍선 문구 (주장 유형 라벨 + 주장 앞부분)
export function bubbleLines(text: string, narrow: boolean): string[] {
  return wrapText(text, narrow ? 15 : 16, 2)
}

// 말풍선 상자 위치 (화면 밖과 법대 침범 방지)
export function bubbleBox(cx: number, side: 'prosecution' | 'defense' | 'officer', width: number, narrow = false): { x: number; w: number } {
  const max = side === 'officer' ? 520 : narrow ? 1440 : 1590
  const x = Math.max(narrow ? 160 : 10, Math.min(max - width, cx - width / 2))
  return { x, w: width }
}

// 안전 여백 (1600 기준 보기 영역 가장자리에서 띄우는 거리)
export const SAFE_X = 70
// 사람 한 명의 반폭 (팔 포함)
export const PERSON_HALF = 58

// 보기 영역의 가로 범위
export function frameOf(narrow: boolean): { x0: number; x1: number } {
  return narrow ? { x0: 150, x1: 1450 } : { x0: 0, x1: 1600 }
}

// 사람 몸 전체가 안전 여백 안에 들어오는 가운데 좌표 범위
export function figureSpan(narrow: boolean): { lo: number; hi: number } {
  const f = frameOf(narrow)
  return { lo: f.x0 + SAFE_X + PERSON_HALF, hi: f.x1 - SAFE_X - PERSON_HALF }
}

// 좌표 무리를 간격 그대로 통째로 옮겨 범위 안에 넣기
export function fitXs(xs: number[], lo: number, hi: number): number[] {
  if (!xs.length) return xs
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const shift = left < lo ? lo - left : right > hi ? hi - right : 0
  return xs.map((x) => x + shift)
}

// 변호석 로봇 가로 위치 (안전 여백 안으로 보정)
export function counselXs(side: 'prosecution' | 'defense', n: number, narrow: boolean): number[] {
  const center = side === 'prosecution' ? (narrow ? 290 : 190) : narrow ? 1215 : 1410
  const gap = narrow ? 84 : 100
  const { lo, hi } = figureSpan(narrow)
  return fitXs(Array.from({ length: n }, (_, k) => center + (k - (n - 1) / 2) * gap), lo, hi)
}

// 서기·재판연구관 책상 가로 위치 (왼쪽 접시 더미와 떨어뜨림)
export const deskX = (narrow: boolean) => (narrow ? 396 : 360)

// 말풍선 한 개의 가로 칸
export interface BubbleSlot { x: number; w: number }

// 같은 편 말풍선을 겹치지 않게 가로로 나란히 놓기 (칸이 모자라면 폭을 비율대로 줄임)
export function packBubbles(items: { anchor: number; w: number }[], lo: number, hi: number, gap = 10): BubbleSlot[] {
  const n = items.length
  if (!n) return []
  const room = hi - lo - gap * (n - 1)
  const sum = items.reduce((t, i) => t + i.w, 0)
  const k = sum > room ? room / sum : 1
  const ws = items.map((i) => i.w * k)
  const order = items.map((_, i) => i).sort((a, b) => items[a].anchor - items[b].anchor)
  const xs: number[] = new Array(n).fill(lo)
  let cursor = lo
  for (const i of order) {
    xs[i] = Math.max(cursor, Math.min(items[i].anchor - ws[i] / 2, hi - ws[i]))
    cursor = xs[i] + ws[i] + gap
  }
  let limit = hi
  for (const i of [...order].reverse()) {
    xs[i] = Math.min(xs[i], limit - ws[i])
    limit = xs[i] - gap
  }
  return xs.map((x, i) => ({ x, w: ws[i] }))
}

// 말풍선 크기와 글줄 계산
export function measureBubble(text: string, w: number, opts: { fs: number; maxLines: number; chipH: number }): { lines: string[]; lh: number; h: number } {
  const fs = w < 200 ? opts.fs * 0.86 : opts.fs
  const lines = wrapText(text, Math.max(3, (w - 34) / fs), opts.maxLines)
  const lh = fs * 1.32
  return { lines, lh, h: 12 + opts.chipH + 8 + lines.length * lh + 10 }
}

// 화면 크기에 맞춘 SVG 보기 영역
export function viewBoxOf(width: number, height: number, narrow: boolean): { x: number; y: number; w: number; h: number } {
  const base = narrow ? { x: 150, y: 0, w: 1300, h: 900 } : { x: 0, y: 0, w: 1600, h: 900 }
  if (!width || !height) return base
  const h = Math.max(base.h, base.w / (width / height))
  return { ...base, y: base.y - (h - base.h) * 0.5, h }
}

// 모바일 작은 무대에서 검증관·양측 단상·천칭 전체를 보존하는 영역
export function miniViewBoxOf(width: number, height: number): { x: number; y: number; w: number; h: number } {
  const w = 1600
  const h = Math.max(900, width && height ? w * (height / width) : 900)
  return { x: 0, y: -(h - 900) / 2, w, h }
}
