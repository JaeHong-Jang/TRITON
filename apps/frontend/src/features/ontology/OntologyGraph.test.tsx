// 온톨로지 범례와 찬반·검증 색상 회귀 검증
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ONTOLOGY } from '../../api/mock/ontology'
import { OntologyGraph } from './OntologyGraph'

it('범례는 진한 빨강·남색으로 설명하고 원문 불일치 빨강을 구분한다', () => {
  const html = renderToStaticMarkup(<OntologyGraph ont={ONTOLOGY} />)
  expect(html).toContain('진한 빨강 · 찬성(낚시성이다)')
  expect(html).toContain('남색 · 반대(낚시성 아니다)')
  expect(html).not.toContain('주황 · 찬성')
  expect(html).not.toContain('파랑 · 반대')
  expect(html).toContain('fill="#f7e8e5" stroke="#922a22"')
  expect(html).toContain('fill="#e7edf6" stroke="#1f3a66"')
  expect(html).toContain('fill="#7a211b"')
  expect(html).toContain('fill="#182f54"')
  expect(html).toContain('fill="#fef2f2" stroke="#dc2626"')
})
