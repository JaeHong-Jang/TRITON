// API 오류 타입

// 서버가 돌려준 한국어 사유를 담는 오류
export class ApiError extends Error {
  status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}
