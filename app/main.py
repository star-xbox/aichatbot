from fastapi import FastAPI, Request, Response
from starlette.middleware.sessions import SessionMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import os
from dotenv import load_dotenv

from app.auth.oauth import init_oauth
from app.auth.routes import router as auth_router
from app.chat.routes import router as chat_router
from app.azure.routes import router as azure_router
from app.chatbot.routes import router as chatbot_router
from app.middlewares.force_localhost import force_localhost
from fastapi.middleware.cors import CORSMiddleware
from app.logger import setup_logger

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
print(os.getenv("ROOT_PATH", ""))
app = FastAPI()
logger = setup_logger("ai_chatbot")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=[
#         "https://localhost",
#         "https://localhost:443",
#         os.getenv("CHAT_API_URL", "http://localhost:8086"),
#         "http://localhost",
#         "http://localhost:8086",
#         "https://svr36.bipvn.com.vn",
#     ],
#     allow_credentials=False,
#     allow_methods=["*"],  # QUAN TRỌNG
#     allow_headers=["*"],  # x-api-key
# )


# @app.options("/api/chat/stream")
# async def options_chat_stream():
#     return Response(
#         status_code=204,
#         headers={
#             "Access-Control-Allow-Origin": "https://localhost",
#             "Access-Control-Allow-Methods": "POST, OPTIONS",
#             "Access-Control-Allow-Headers": "Content-Type, x-api-key",
#             "Access-Control-Allow-Credentials": "true",
#         },
#     )


@app.on_event("startup")
def startup():
    logger.info("AI chatbot started")


@app.middleware("http")
async def prefix_middleware(request: Request, call_next):
    load_dotenv(override=True)
    original_url = request.headers.get("x-original-url")
    request.scope["prefix"] = ""
    if original_url:
        # ví dụ: /aichatbot/chat -> /aichatbot
        parts = original_url.split("/")
        if len(parts) > 2:
            prefix = "/" + parts[1]
            # request.scope["root_path"] = prefix
            request.scope["prefix"] = prefix

    print("prefix", request.scope["prefix"])
    print("root_path   =", request.scope.get("root_path"))
    print("CHAT_API_URL =", os.getenv("CHAT_API_URL"))
    # request.scope["scheme"] = "http"
    # request.scope["server"] = ("localhost", 8086)
    return await call_next(request)


# @app.middleware("http")
async def debug_request(request: Request, call_next):
    print("=== REQUEST DEBUG ===")
    print("method      =", request.method)
    print("url         =", str(request.url))
    print("scheme      =", request.url.scheme)
    print("path        =", request.url.path)
    print("query       =", request.url.query)
    print("root_path   =", request.scope.get("root_path"))
    print("client      =", request.client)
    print("server      =", request.scope.get("server"))
    print("headers     =", dict(request.headers))
    print("=====================")

    return await call_next(request)


app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SECRET_KEY"),
)

app.middleware("http")(force_localhost)
app.state.CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID")
app.state.CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET")
app.state.TENANT_ID = os.getenv("MICROSOFT_TENANT_ID")

init_oauth(app)

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(azure_router)
app.include_router(chatbot_router)


@app.get("/debug")
async def debug(request: Request):
    return {
        "root_path": request.scope.get("root_path"),
        "path": request.url.path,
        "server": request.scope.get("server"),
        "original_url": request.headers.get("x-original-url"),
        "headers": dict(request.headers),
    }


from fastapi.responses import FileResponse


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("app/static/favicon.ico")
