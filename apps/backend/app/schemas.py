# 요청 본문 스키마
from typing import Literal

from pydantic import BaseModel, Field


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
    type: Literal["first_impression", "reveal", "evidence_ruling", "seat_verdict", "appeal", "final"]
    data: dict
    context: ContextIn


# 재판 생성 요청
class TrialIn(BaseModel):
    judgeNotes: str | None = None


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
