// 판결 라디오 용어와 선택 동작 회귀 검사
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LeaningPicker } from './Forms'

describe('낚시성 여부 선택', () => {
  it('이전 라디오 이름을 제거하고 새 이름으로 각 판단을 선택한다', () => {
    const onChange = vi.fn()
    const picker = LeaningPicker({ value: 'clickbait', onChange })
    const radios = picker.props.children as ReactElement<{ role: string; children: string; 'aria-checked': boolean; onClick: () => void }>[]
    expect(radios.filter((radio) => radio.props.role === 'radio').map((radio) => radio.props.children)).toEqual(['낚시성이다', '낚시성 아니다'])
    expect(radios.find((radio) => radio.props.children === '낚시성 (유죄)')).toBeUndefined()
    expect(radios.find((radio) => radio.props.children === '낚시성 아님 (무죄)')).toBeUndefined()
    expect(radios.map((radio) => radio.props['aria-checked'])).toEqual([true, false])
    radios[0].props.onClick()
    radios[1].props.onClick()
    expect(onChange.mock.calls).toEqual([['clickbait'], ['not_clickbait']])
  })
})
