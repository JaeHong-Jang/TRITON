# 요청 본문 스키마
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# 판사 정보
class JudgeIn(BaseModel):
    seat: int
    name: str
    soloMode: bool = False


# 기록 당시 화면 맥락
class ContextIn(BaseModel):
    balance: dict | None = None
    aiRecommendationShown: bool
    scaleVisible: bool


# 장부 기록 요청
class LedgerIn(BaseModel):
    caseId: str
    instance: int
    judge: JudgeIn
    labSessionId: str | None = None
    requestId: str | None = None
    type: Literal["first_impression", "reveal", "evidence_ruling", "seat_verdict", "appeal", "final"]
    data: dict
    context: ContextIn


# 재판 생성 요청
class TrialIn(BaseModel):
    judgeNotes: str | None = None


# 직접 기사 등록 요청
class NewCaseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: UUID
    title: str
    body: str
    category: str = "직접 등록"

    # 직접 등록 제목 정규화
    @field_validator("title")
    @classmethod
    def title_text(cls, value: str) -> str:
        out = value.strip()
        if not out:
            raise ValueError("제목을 입력해야 합니다")
        if len(out) > 300:
            raise ValueError("제목은 300자 이하여야 합니다")
        return out

    # 직접 등록 본문 정규화
    @field_validator("body")
    @classmethod
    def body_text(cls, value: str) -> str:
        if len(value) > 20000:
            raise ValueError("본문은 20,000자 이하여야 합니다")
        lines = [line.strip() for line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
        lines = [line for line in lines if line]
        if not lines:
            raise ValueError("본문을 입력해야 합니다")
        if len(lines) > 300:
            raise ValueError("본문은 비어 있지 않은 줄 300개 이하여야 합니다")
        return "\n".join(lines)

    # 직접 등록 분야 정규화
    @field_validator("category", mode="before")
    @classmethod
    def category_text(cls, value) -> str:
        if value is None:
            raise ValueError("분야는 문자열이어야 합니다")
        if not isinstance(value, str):
            raise ValueError("분야는 문자열이어야 합니다")
        out = value.strip()
        if not out:
            raise ValueError("분야를 입력해야 합니다")
        if len(out) > 40:
            raise ValueError("분야는 40자 이하여야 합니다")
        return out


# 실험실 세션 요청
class SessionIn(BaseModel):
    condition: Literal["A", "B", "C"]
    judge: str
    size: int = 8


# 레드팀 변형 요청
class VariantIn(BaseModel):
    caseId: str
    attack: Literal["move_inserted", "inject_command"]


# 자율 범위 정책 요청
class PolicyIn(BaseModel):
    summaryEnabled: bool
    summaryThreshold: int = Field(ge=0, le=100)
    highRiskCategories: list[str]


# 접수 검토 일괄 실행 요청
class IntakeIn(BaseModel):
    caseIds: list[str] | None = None
