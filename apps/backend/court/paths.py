# 저장소 경로 상수
import os
from pathlib import Path

# 저장소 루트
ROOT = Path(__file__).resolve().parents[3]
# A.X 에이전트 역할 정의 폴더
SKILLS_DIR = ROOT / "agents"
# 데이터 폴더 (테스트는 TRITON_DATA_DIR로 임시 폴더 지정)
DATA_DIR = Path(os.environ.get("TRITON_DATA_DIR") or ROOT / "data")
