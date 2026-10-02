# A.X 4.0 Light 로컬 빌드 (출처 기록)

대회 필수 모델. 로컬(RTX 2080 8GB)에서는 원본(BF16, 약 14.5GB)이 올라가지 않아 직접 양자화했다. 제3자 GGUF는 쓰지 않았다.

| 단계 | 내용 |
|---|---|
| 원본 | Hugging Face `skt/A.X-4.0-Light`, revision `ba21c20ea1b31ded1ec3e2fb432335077dc4be98`, Apache-2.0, Qwen2 구조 7B, 문맥 16k |
| 무결성 | safetensors 3개 모두 HF LFS SHA256과 일치 |
| 변환 | llama.cpp `5503b04` `convert_hf_to_gguf.py --outtype bf16` (토크나이저 규칙 `a.x-4.0`, eos 27, BOS 없음) |
| 양자화 | `llama-quantize … Q4_K_M` → 4.88 BPW, 약 4.2GB, sha256 `6e49b8ad0b7dacc78907af8698e1dd652d3201d74418c38f77613d804579417f` |
| Ollama | Modelfile에 공식 채팅 템플릿(`<\|im_start\|><\|user\|>…<\|im_end\|>`), stop `<\|im_end\|>`, num_ctx 8192 → `ax4-light:q4_K_M` |
| 검증 | 같은 대화를 공식 템플릿+토크나이저로 센 토큰 수 = Ollama 처리 토큰 수 (13/13, 93/93). GPU 100%, 약 80 tok/s |

- Ollama 0.34의 자체 `-q` 양자화는 MLX 경로라 Qwen2 구조를 지원하지 않아 llama.cpp를 썼다.
- WSL에서는 Windows Ollama에 기본 게이트웨이 주소(`ip route`)로 접속한다 (`court/llm.py`가 자동 처리, `OLLAMA_HOST`로 덮어쓰기).
- **양자화는 가중치를 바꾼다.** 공식 수치는 원본 가중치(16GB 이상 GPU, 예: Kaggle T4×2 또는 24GB급)로 다시 측정한다. 양자화본 사용이 '필수 모델 사용'으로 인정되는지는 운영팀 확인 필요.
