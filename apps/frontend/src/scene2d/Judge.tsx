// 사람 판사 일러스트 (검은 법복, 「AI」 배지 없음)
import Person from './Person'

// 판사 컴포넌트 (원점은 법대 윗면 가운데)
export default function Judge({ look, delay }: { look: number; delay: number }) {
  return (
    <g transform="translate(0 6) scale(0.82)">
      <Person role="judge" look={look} ai={false} delay={delay} />
    </g>
  )
}
