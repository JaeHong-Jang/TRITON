# FastAPI 앱 조립과 정적 서빙
from court import paths
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from app.api import router


# 요청 검증 오류 응답
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    return JSONResponse({"detail": f"요청 형식이 올바르지 않습니다: {where} {first.get('msg', '')}".strip()}, status_code=422)


# 정적 파일과 SPA 대체 응답
async def spa(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
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
    app = FastAPI(title="AI 법정")
    app.add_exception_handler(RequestValidationError, validation_error)
    app.include_router(router)
    app.add_api_route("/{full_path:path}", spa, methods=["GET", "POST", "PUT", "DELETE", "PATCH"], include_in_schema=False)
    return app


app = create_app()
