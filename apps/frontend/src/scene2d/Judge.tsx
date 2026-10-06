// 사람 판사 일러스트
import Person from './Person'

// 판사 컴포넌트
export default function Judge({ look, delay }: { look: number; delay: number }) {
  return (
    <g transform="translate(0 4) scale(0.78)">
      <Person role="judge" look={look} ai={false} delay={delay} />
    </g>
  )
}
