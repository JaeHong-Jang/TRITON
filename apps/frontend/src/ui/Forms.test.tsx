// 판결 라디오 용어와 선택 동작 회귀 검사
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LeaningPicker, ReasonBox } from './Forms'

describe('낚시성 여부 선택', () => {
  it('원래 판결 라디오 이름으로 각 판단을 선택한다', () => {
    const onChange = vi.fn()
    const picker = LeaningPicker({ value: 'clickbait', onChange })
    const radios = picker.props.children as ReactElement<{ role: string; children: string; 'aria-checked': boolean; onClick: () => void }>[]
    expect(radios.filter((radio) => radio.props.role === 'radio').map((radio) => radio.props.children)).toEqual(['낚시성 (유죄)', '낚시성 아님 (무죄)'])
    expect(radios.map((radio) => radio.props['aria-checked'])).toEqual([true, false])
    radios[0].props.onClick()
    radios[1].props.onClick()
    expect(onChange.mock.calls).toEqual([['clickbait'], ['not_clickbait']])
  })
})

describe('사유 입력', () => {
  it.each(['', '짧음', '사유'.repeat(1000)])('글자 수 안내 없이 사유를 표시한다', (value) => {
    const html = renderToStaticMarkup(ReasonBox({ value, onChange: vi.fn(), label: '판결 사유' }))
    expect(html).toContain('판결 사유')
    expect(html).toContain(`<textarea rows="3"`)
    expect(html).toContain(`>${value}</textarea>`)
    expect(html).not.toMatch(/aria-live|10자|자 더|✓|maxLength|minLength/i)
  })
})
