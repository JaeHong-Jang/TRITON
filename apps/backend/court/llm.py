# Ollama 채팅 클라이언트 (A.X 4.0 Light)
import json
import os
import subprocess
import time
import urllib.request

DEFAULT_MODEL = "ax4-light:q4_K_M"
DEFAULT_OPTIONS = {"temperature": 0, "seed": 7, "num_ctx": 8192, "num_predict": 2048}
HTTP_TIMEOUT = 120


# Ollama 서버 주소 결정
def default_host():
    if os.environ.get("OLLAMA_HOST"):
        host = os.environ["OLLAMA_HOST"]
        return host if host.startswith("http") else f"http://{host}"
    if "microsoft" in os.uname().release.lower():
        gateway = subprocess.run(["sh", "-c", "ip route | awk '/default/{print $3}'"], capture_output=True, text=True).stdout.strip()
        if gateway:
            return f"http://{gateway}:11434"
    return "http://localhost:11434"


# 호출 메타를 함께 돌려주는 Ollama 클라이언트
class OllamaClient:
    # 모델·주소·옵션 설정
    def __init__(self, model=None, host=None, options=None):
        self.model = model or DEFAULT_MODEL
        self.host = host or default_host()
        self.options = {**DEFAULT_OPTIONS, **(options or {})}

    # 서버와 모델 응답 여부 확인
    def available(self):
        try:
            with urllib.request.urlopen(f"{self.host}/api/tags", timeout=3) as res:
                names = {m["name"] for m in json.load(res).get("models", [])}
        except (OSError, ValueError):
            return False
        return self.model in names or f"{self.model}:latest" in names

    # 스키마를 강제한 JSON 응답과 호출 메타 반환
    def chat_json(self, system, user, schema):
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "format": schema,
            "stream": False,
            "options": self.options,
        }
        req = urllib.request.Request(f"{self.host}/api/chat", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        started = time.time()
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as res:
            reply = json.load(res)
        call = {
            "promptTokens": reply.get("prompt_eval_count") or 0,
            "outputTokens": reply.get("eval_count") or 0,
            "seconds": round(time.time() - started, 2),
        }
        return json.loads(reply["message"]["content"]), call
