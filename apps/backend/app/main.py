# FastAPI 앱 조립과 정적 서빙
from court import paths
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException
from starlette.routing import Match

from app import jobs
from app.api import router


# 검증 오류 사유 번역
def _validation_reason(error: dict) -> str:
    kind = error.get("type", "")
    reasons = {
        "missing": "필수 항목입니다",
        "string_type": "문자열이어야 합니다",
        "int_type": "정수여야 합니다",
        "bool_type": "불리언이어야 합니다",
        "list_type": "목록이어야 합니다",
        "dict_type": "객체여야 합니다",
        "model_type": "객체여야 합니다",
        "model_attributes_type": "객체여야 합니다",
        "json_invalid": "JSON 형식이 올바르지 않습니다",
        "greater_than": "최솟값보다 커야 합니다",
        "greater_than_equal": "최솟값 이상이어야 합니다",
        "less_than": "최댓값보다 작아야 합니다",
        "less_than_equal": "최댓값 이하여야 합니다",
        "literal_error": "허용된 값 중 하나여야 합니다",
        "enum": "허용된 값 중 하나여야 합니다",
        "uuid_parsing": "UUID 형식이어야 합니다",
        "extra_forbidden": "허용되지 않은 필드입니다",
    }
    if kind in reasons:
        return reasons[kind]
    if kind.endswith("_parsing") or kind == "int_from_float":
        return "값의 형식이 올바르지 않습니다"
    if kind.endswith("too_short"):
        return "길이가 너무 짧습니다"
    if kind.endswith("too_long"):
        return "길이가 너무 깁니다"
    if kind == "value_error":
        reason = str(error.get("ctx", {}).get("error", ""))
        if any("가" <= c <= "힣" for c in reason):
            return reason.encode("utf-8", errors="replace").decode("utf-8")
    return "입력값이 올바르지 않습니다"


# 요청 검증 오류 응답
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = list(first.get("loc", []))
    if loc and loc[0] == "body":
        loc = loc[1:]
    if first.get("type") == "json_invalid":
        loc = []
    where = ".".join(str(p) for p in loc).encode("utf-8", errors="replace").decode("utf-8")
    message = " ".join(p for p in (where, _validation_reason(first)) if p)
    return JSONResponse({"detail": f"요청 형식이 올바르지 않습니다: {message}"}, status_code=422)


# API 경로 허용 메서드 조회
def _api_methods(request: Request) -> set[str]:
    return {method for route in router.routes if route.matches(request.scope)[0] != Match.NONE for method in route.methods or []}


# 기본 HTTP 오류 한국어 응답
async def http_error(request: Request, exc: HTTPException):
    code, detail, headers = exc.status_code, exc.detail, exc.headers
    if code == 400 and detail == "There was an error parsing the body":
        code, detail = 422, "요청 형식이 올바르지 않습니다: 본문 인코딩이 올바르지 않습니다"
    elif code == 404 and detail == "Not Found":
        detail = "찾을 수 없는 API 경로입니다"
    elif code == 405 and detail == "Method Not Allowed":
        if (request.url.path == "/api" or request.url.path.startswith("/api/")) and not _api_methods(request):
            code, detail, headers = 404, "찾을 수 없는 API 경로입니다", None
        else:
            detail = "허용되지 않는 요청 메서드입니다"
    return JSONResponse({"detail": detail}, status_code=code, headers=headers)


# 문자열 인코딩 오류 응답
async def unicode_error(request: Request, exc: UnicodeEncodeError):
    return JSONResponse({"detail": "요청 형식이 올바르지 않습니다: UTF-8로 저장할 수 없는 문자가 있습니다"}, status_code=422)


# 정적 파일과 SPA 대체 응답
async def spa(full_path: str, request: Request):
    if full_path == "api" or full_path.startswith("api/"):
        methods = _api_methods(request)
        if methods:
            raise HTTPException(405, "Method Not Allowed", headers={"Allow": ", ".join(sorted(methods))})
        return JSONResponse({"detail": "찾을 수 없는 API 경로입니다"}, status_code=404)
    dist = (paths.ROOT / "apps" / "frontend" / "dist").resolve()
    if not dist.is_dir():
        return JSONResponse({"detail": "프론트 빌드가 없습니다"}, status_code=404)
    target = (dist / full_path).resolve()
    if full_path and target.is_file() and dist in target.parents:
        return FileResponse(target)
    if not (dist / "index.html").is_file():
        return JSONResponse({"detail": "프론트 빌드가 없습니다"}, status_code=404)
    return FileResponse(dist / "index.html")


# 앱 생성
def create_app() -> FastAPI:
    jobs.recover()
    app = FastAPI(title="AI 법정")
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(HTTPException, http_error)
    app.add_exception_handler(UnicodeEncodeError, unicode_error)
    app.include_router(router)
    app.add_api_route("/{full_path:path}", spa, methods=["GET", "POST", "PUT", "DELETE", "PATCH"], include_in_schema=False)
    return app


app = create_app()
