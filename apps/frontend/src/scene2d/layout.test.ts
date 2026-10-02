// 2D 법정 배치 계산 테스트
import { describe, expect, it } from 'vitest'
import type { WeightItem } from '../lib/scale'
import { PERSON_HALF, SAFE_X, beamEnds, bubbleBox, counselXs, deskX, figureSpan, fitXs, frameOf, legendText, measureBubble, miniViewBoxOf, packBubbles, stackSlots, truncate, viewBoxOf, visibleOf, weightTag, wrapText } from './layout'

// 시험용 근거 항목
const item = (id: string, weight = 1, no: number | null = 1): WeightItem => ({
  evidenceId: id, claimId: 'c', agentId: 'a', stance: 'pro', weight, fate: 'counted', voidReason: null, ruled: null,
  evidence: { id, kind: no === null ? 'absence' : 'quote', stance: 'pro', sentenceNo: no, quote: null, keyword: 'k', status: 'verified', foundIn: null },
})

describe('truncate', () => {
  it('짧은 글은 그대로 두고 긴 글은 말줄임', () => {
    expect(truncate('짧은 제목', 10)).toBe('짧은 제목')
    expect(truncate('아주아주아주 긴 제목입니다 정말로', 6)).toMatch(/…$/)
    expect(truncate('아주아주아주 긴 제목입니다 정말로', 6).length).toBeLessThanOrEqual(7)
  })
})

describe('wrapText', () => {
  it('줄 수를 넘기면 마지막 줄을 말줄임', () => {
    const lines = wrapText('가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 가나다라마바사', 8, 3)
    expect(lines).toHaveLength(3)
    expect(lines[2].endsWith('…')).toBe(true)
  })
  it('짧은 글은 한 줄', () => {
    expect(wrapText('안녕', 8, 3)).toEqual(['안녕'])
  })
})

describe('visibleOf', () => {
  const many = Array.from({ length: 11 }, (_, i) => item(`e${i}`))
  it('8개까지 보이고 나머지는 개수로 센다', () => {
    const v = visibleOf(many, null)
    expect(v.shown).toHaveLength(8)
    expect(v.hidden).toBe(3)
  })
  it('선택한 근거는 가려져 있어도 포함한다', () => {
    const v = visibleOf(many, 'e10')
    expect(v.shown.at(-1)?.evidenceId).toBe('e10')
    expect(v.shown).toHaveLength(8)
    expect(v.hidden).toBe(3)
  })
})

describe('stackSlots', () => {
  it('한 줄에 3개씩 아래부터 위로 쌓는다', () => {
    const { slots, top } = stackSlots(Array.from({ length: 7 }, (_, i) => item(`e${i}`)), false)
    expect(slots).toHaveLength(7)
    expect(slots[0].y).toBeGreaterThan(slots[3].y)
    expect(slots[3].y).toBeGreaterThan(slots[6].y)
    expect(top).toBeGreaterThan(90)
  })
  it('한 줄은 가운데에 모인다', () => {
    const { slots } = stackSlots([item('a'), item('b')], false)
    expect(slots[0].x + slots[1].x + slots[1].w).toBeCloseTo(0, 5)
  })
})

describe('legendText', () => {
  it('색과 함께 글자로 입장과 합계를 적는다', () => {
    expect(legendText('pro', 17.5, false)).toBe('◀ 찬성 · 낚시성이다 17.5')
    expect(legendText('con', 16, false)).toBe('반대 · 낚시성 아니다 16 ▶')
    expect(legendText('pro', 3, true)).toBe('◀ 찬성 3')
  })
})

describe('weightTag', () => {
  it('문장 번호나 부재', () => {
    expect(weightTag(item('a', 1, 15))).toBe('#15')
    expect(weightTag(item('a', 1, null))).toBe('부재')
  })
})

describe('beamEnds', () => {
  it('양수 기울기는 왼쪽이 내려간다', () => {
    const e = beamEnds(0.2)
    expect(e.left.y).toBeGreaterThan(0)
    expect(e.right.y).toBeLessThan(0)
    expect(beamEnds(0).left.y).toBe(0)
  })
})

describe('counselXs·bubbleBox·viewBoxOf', () => {
  it('인원수만큼 좌우로 퍼진다', () => {
    expect(counselXs('prosecution', 3, false)).toHaveLength(3)
    expect(counselXs('defense', 1, false)).toEqual([1410])
  })
  it('말풍선은 화면 안에 머문다', () => {
    expect(bubbleBox(20, 'prosecution', 340).x).toBe(10)
    expect(bubbleBox(1500, 'defense', 340).x + 340).toBeLessThanOrEqual(1590)
    expect(bubbleBox(500, 'officer', 340).x + 340).toBeLessThanOrEqual(520)
  })
  it('세로로 긴 화면은 보기 영역을 키운다', () => {
    expect(viewBoxOf(1600, 900, false).h).toBe(900)
    expect(viewBoxOf(880, 790, false).h).toBeGreaterThan(900)
  })
})

describe('안전 여백', () => {
  it('변호석 사람은 몸 전체가 어느 화면 모드에서도 안전 여백 안에 선다', () => {
    for (const narrow of [false, true]) {
      const f = frameOf(narrow)
      for (const side of ['prosecution', 'defense'] as const) {
        for (const n of [1, 2, 3]) {
          const xs = counselXs(side, n, narrow)
          expect(Math.min(...xs) - PERSON_HALF).toBeGreaterThanOrEqual(f.x0 + SAFE_X)
          expect(Math.max(...xs) + PERSON_HALF).toBeLessThanOrEqual(f.x1 - SAFE_X)
        }
      }
    }
  })
  it('1600 기준 와이드 화면에서는 몸이 x=70 안쪽에서 시작한다', () => {
    expect(figureSpan(false).lo - PERSON_HALF).toBe(70)
  })
  it('무리를 옮겨도 간격은 그대로다', () => {
    const xs = fitXs([10, 110, 210], 100, 900)
    expect(xs).toEqual([100, 200, 300])
  })
  it('책상은 왼쪽 접시(x 500 안쪽)와 겹치지 않는다', () => {
    for (const narrow of [false, true]) expect(deskX(narrow) + 76).toBeLessThan(500)
  })
})

describe('packBubbles', () => {
  const lo = 20
  const hi = 500
  it('세 개를 놓아도 겹치지 않고 범위 안에 있다', () => {
    const slots = packBubbles([{ anchor: 90, w: 262 }, { anchor: 190, w: 262 }, { anchor: 290, w: 262 }], lo, hi)
    slots.forEach((b) => {
      expect(b.x).toBeGreaterThanOrEqual(lo - 1e-9)
      expect(b.x + b.w).toBeLessThanOrEqual(hi + 1e-9)
    })
    for (let i = 1; i < slots.length; i++) expect(slots[i].x).toBeGreaterThanOrEqual(slots[i - 1].x + slots[i - 1].w)
  })
  it('칸이 넉넉하면 머리 위 가운데에 놓고 폭을 줄이지 않는다', () => {
    const [a] = packBubbles([{ anchor: 250, w: 200 }], lo, hi)
    expect(a).toEqual({ x: 150, w: 200 })
  })
  it('입력 순서와 상관없이 좌우 순서를 지킨다', () => {
    const [r, l] = packBubbles([{ anchor: 400, w: 200 }, { anchor: 100, w: 200 }], lo, hi)
    expect(l.x).toBeLessThan(r.x)
  })
})

describe('measureBubble', () => {
  it('최대 줄 수를 넘기지 않고 높이가 글줄에 따라 늘어난다', () => {
    const long = '가나다라마바사아자차카타파하 '.repeat(8)
    const a = measureBubble(long, 260, { fs: 19, maxLines: 3, chipH: 26 })
    const b = measureBubble('짧음', 260, { fs: 19, maxLines: 3, chipH: 26 })
    expect(a.lines).toHaveLength(3)
    expect(b.lines).toHaveLength(1)
    expect(a.h).toBeGreaterThan(b.h)
  })
})

describe('miniViewBoxOf', () => {
  it('가로 1300을 그대로 담고 높이는 컨테이너 비율을 따른다', () => {
    const v = miniViewBoxOf(390, 140)
    expect(v.w).toBe(1300)
    expect(v.h).toBeCloseTo(466.7, 0)
  })
})
