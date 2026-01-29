from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
import os

from httpx import request
from app.auth.oauth import oauth
from app.auth.guard import login_required
from app.config import LOGIN_MODE, inject_globals
from app.chat.service import ChatService
from app.users.repo import get_user_by_email, upsert_user
from app.logger import setup_logger

logger = setup_logger("ai_chatbot")
router = APIRouter()
templates = Jinja2Templates(directory="app/templates")
templates.env.globals.update(inject_globals())
# PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL")


def check_login_mode(request: Request):
    # MODE 1: không cần login → cấm vào trang login
    if LOGIN_MODE == 1:
        # đảm bảo có system user
        email = "system@local.com"
        microsoft_id = "microsoft_id_DUMMY"
        name = "System User"

        user_db = upsert_user(
            email=email,
            microsoft_id=microsoft_id,
            display_name=name,
            provider="microsoft",
        )

        request.session["user"] = {
            "email": email,
            "name": name,
            "oid": microsoft_id,
            "user_cd": user_db["UserCD"],
        }
        root_path = request.scope.get("prefix", "")
        return RedirectResponse(url=f"{root_path}/chat", status_code=302)

    # MODE 2 & 3: nếu đã login rồi → không cần login lại
    if request.session.get("user"):
        return RedirectResponse(url=request.scope["prefix"] + "/chat", status_code=302)
        root_path = request.scope.get("prefix", "")
        return RedirectResponse(url=f"{root_path}/chat", status_code=302)

    # MODE 2 & 3: cho hiển thị trang login
    return templates.TemplateResponse(
        "login.html", {"request": request, "login_mode": LOGIN_MODE}
    )


@router.get("/")
def root(request: Request):
    return check_login_mode(request)


@router.get("/login", response_class=HTMLResponse)
def login(request: Request):
    return check_login_mode(request)


@router.get("/loginerr")
def loginerr(request: Request):
    root_path = request.scope.get("prefix", "")

    err = request.session.pop("login_error", None)
    if not err:
        return RedirectResponse(url=f"{root_path}/login", status_code=302)

    return templates.TemplateResponse(
        "loginerr.html",
        {
            "request": request,
            "error_type": err["error"],
            "error_description": err["description"],
        },
    )


@router.get("/logout")
def logout(request: Request):
    request.session.clear()

    post_logout_redirect_uri = (
        request.headers.get("referer").replace("/chat", "").replace("/loginerr", "")
        + "/login"
    )
    print("post_logout_redirect_uri:", post_logout_redirect_uri)
    logout_url = (
        "https://login.microsoftonline.com/common/oauth2/v2.0/logout"
        f"?post_logout_redirect_uri={post_logout_redirect_uri}"
    )

    return RedirectResponse(url=logout_url, status_code=302)


@router.get("/dashboard")
def dashboard(request: Request):
    root_path = request.scope.get("prefix", "")
    return RedirectResponse(url=f"{root_path}/chat", status_code=302)
    guard = login_required(request)
    if guard:
        return guard

    return templates.TemplateResponse(
        "dashboard.html", {"request": request, "user": request.session.get("user")}
    )


# def build_redirect_uri(path: str) -> str:
#     return f"{PUBLIC_BASE_URL}{path}"


@router.get("/auth/microsoft")
async def login_microsoft(request: Request):
    # redirect_uri = request.headers.get("referer") + "/auth/microsoft/callback"
    # print("Referer:", referer)
    # if  request.scope.get("root_path") == "":
    #     redirect_uri = request.url_for("auth_callback")
    # else:
    #     redirect_uri = build_redirect_uri(
    #         "/auth/microsoft/callback"
    #     )
    print("PUBLIC_BASE_URL:", request.url)
    print("request.url_for(auth_callback):", request.url_for("auth_callback"))

    redirect_uri = (
        request.headers.get("referer").replace("login", "") + "auth/microsoft/callback"
    )
    print("redirect_uri", redirect_uri)
    logger.info("Redirecting to Microsoft OAuth: %s", redirect_uri)
    return await oauth.microsoft.authorize_redirect(request, redirect_uri)


@router.get("/auth/microsoft/callback")
async def auth_callback(request: Request):
    token = await oauth.microsoft.authorize_access_token(
        request, claims_options={"iss": {"essential": False}}
    )
    root_path = request.scope.get("prefix", "")
    userinfo = token["userinfo"]
    email = userinfo.get("email") or userinfo.get("preferred_username")
    microsoft_id = userinfo.get("oid")
    name = userinfo.get("name")
    logger.info("User logged in: %s (%s)", email, microsoft_id)

    if LOGIN_MODE == 3:
        user = get_user_by_email(email)
        if not user:
            # return templates.TemplateResponse(
            #     "loginerr.html", {"request": request, "login_mode": LOGIN_MODE}
            # )
            request.session["login_error"] = {
                "error": "user_not_found",
                "description": "ユーザーが登録されていません",
            }
            logger.warning("Login failed for %s: user not found", email)
            return RedirectResponse(url=f"{root_path}/loginerr", status_code=302)
            # return HTMLResponse("Access denied", status_code=403)

    user_db = upsert_user(
        email=email, microsoft_id=microsoft_id, display_name=name, provider="microsoft"
    )

    request.session["user"] = {
        "email": email,
        "name": name,
        "oid": microsoft_id,
        "user_cd": user_db["UserCD"],
    }

    # user_id = request.session["user"]["oid"]
    # chat_service = ChatService()
    # chat_service.create_conversation(user_id, "最初のチャット")

    return RedirectResponse(url=f"{root_path}/chat", status_code=302)
