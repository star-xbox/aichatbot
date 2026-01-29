import json
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
import httpx
from app.auth.guard import login_required
from app.chat.chat_db_service import chat_db_service
from app.chat.service import chat_service
from app.config import CHAT_API_KEY, CHAT_API_URL, CHAT_API_FAKE, inject_globals
from app.users.repo import get_user_by_email
import logging
import time

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")
templates.env.globals.update(inject_globals())
logger = logging.getLogger(__name__)


@router.get("/chat", response_class=HTMLResponse)
def chat_page(request: Request):
    """Render chat page"""
    guard = login_required(request)
    if guard:
        return guard

    user = request.session["user"]

    return templates.TemplateResponse("chat.html", {"request": request, "user": user})


@router.post("/api/chat")
async def chat_proxy(req: Request):
    """Stream chat response and auto-save to DB"""
    guard = login_required(req, api=True)
    if guard:
        return guard

    try:
        # Get user info
        user = req.session.get("user", {})
        user_email = user.get("email")
        if not user_email:
            return JSONResponse(
                {"success": False, "error": "User not authenticated"}, status_code=401
            )

        # Get UserCD from database
        user_row = get_user_by_email(user_email)
        if not user_row:
            return JSONResponse(
                {"success": False, "error": "User not found"}, status_code=404
            )
        user_cd = user_row.UserCD

        # Parse request body
        body = await req.json()
        conversation_id = body.get("conversation_id")
        question = body.get("question", "")
        chat_history = body.get("chat_history", [])
        print("history:", chat_history)
        if not conversation_id:
            return JSONResponse(
                {"success": False, "error": "conversation_id is required"},
                status_code=400,
            )

        if not question:
            return JSONResponse(
                {"success": False, "error": "question is required"}, status_code=400
            )

        build_body = {
            "conversation_id": conversation_id,
            "question": question,
            "chat_history": chat_history,
        }

        headers = {
            "User-Agent": "PostmanRuntime/7.36.0",
            "x-api-key": CHAT_API_KEY,
            "accept": "application/jsonl",
            "Content-Type": "application/json",
        }

        full_answer = ""
        pdf_metadata = None
        has_error = False
        error_message = ""

        async def stream():
            nonlocal full_answer, pdf_metadata, has_error, error_message

            async with httpx.AsyncClient(timeout=None, verify=False) as client:
                async with client.stream(
                    "POST",
                    CHAT_API_URL,
                    json=build_body,
                    headers=headers,
                ) as res:
                    async for line in res.aiter_lines():
                        # print("LINE:", line)
                        if not line:
                            continue

                        try:
                            event = json.loads(line)
                        except Exception as e:
                            print("JSON parse error:", e, line)
                            continue

                        t = event.get("type")

                        # Handle text token
                        if t == "text":
                            token = event.get("data", "")
                            full_answer += token
                            # yield f"data: {event.get('data', '')}\n"
                            yield f"{json.dumps({'type':'text','data': event.get("data", "")}, ensure_ascii=False)}\n"
                            # yield event.get("data", "")
                            yield " " * 2048 + "\n"  # empty ARR flush
                        # ✅ metadata about PDF
                        elif t == "metadata":
                            # forward to frontend
                            yield f"{json.dumps({'type':'text','data': '[[META]]' + json.dumps(event['data'])}, ensure_ascii=False)}\n"
                            # yield f"data:[[META]]{json.dumps(event['data'])}\n"

                        # ❌ error handling
                        elif t == "error":
                            msg = event["data"].get("message", "Stream error")
                            yield f"data: [ERROR]{msg}\n\n"
                            break
                        time.sleep(0.01)
            if not has_error and full_answer:
                try:
                    turn_no = chat_service.get_next_turn_no(conversation_id)

                    # answer_with_metadata = {
                    #     "text": full_answer,
                    #     "pdf_details": (
                    #         pdf_metadata.get("pdf_sources", []) if pdf_metadata else []
                    #     ),
                    # }

                    result = chat_db_service.register_qa_log(
                        session_id=conversation_id,
                        turn_no=turn_no,
                        user_cd=user_cd,
                        question_text=question,
                        answer_text=full_answer,
                    )

                    if result["success"]:
                        qa_log_cd = result.get("qa_log_cd")
                        logger.info(
                            f"Saved chat to DB: session={conversation_id}, turn={turn_no}, qa_log_cd={result.get('qa_log_cd')}"
                        )
                        yield f"[[QA_LOG_CD]]{qa_log_cd}\n\n"
                    else:
                        logger.error(
                            f"Failed to save chat to DB: {result.get('error_message')}"
                        )

                except Exception as e:
                    logger.error(f"Error saving chat to DB: {str(e)}")
            print("CHAT_API_URL =", CHAT_API_URL)

        return StreamingResponse(
            stream(),
            media_type="text/plain; charset=utf-8",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # nginx / proxy
            },
        )

    except Exception as e:
        logger.error(f"Chat proxy error: {str(e)}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.post("/api/conversation/new")
async def new_conversation(request: Request):
    """API to create new conversation (new session)"""
    guard = login_required(request, api=True)
    if guard:
        return guard

    try:
        import uuid

        # Get user info
        user = request.session.get("user", {})
        user_email = user.get("email")

        if not user_email:
            return JSONResponse(
                {"success": False, "error": "User not authenticated"}, status_code=401
            )

        # Get UserCD from database
        user_row = get_user_by_email(user_email)
        if not user_row:
            return JSONResponse(
                {"success": False, "error": "User not found"}, status_code=404
            )

        # Create new session ID
        session_id = str(uuid.uuid4())

        logger.info(
            f"Created new conversation: session_id={session_id}, user_cd={user_row.UserCD}"
        )

        return JSONResponse(
            {
                "success": True,
                "conversation_id": session_id,
                "session_id": session_id,
                "title": "新しいチャット",
            }
        )

    except Exception as e:
        logger.error(f"New conversation error: {str(e)}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.get("/api/conversations")
async def get_conversations(request: Request):
    """API to get user's conversations (sessions)"""
    guard = login_required(request, api=True)
    if guard:
        return guard

    try:
        # Lấy user info
        user = request.session.get("user", {})
        user_email = user.get("email")

        if not user_email:
            return JSONResponse(
                {"success": False, "error": "User not authenticated"}, status_code=401
            )

        # Lấy UserCD từ database
        user_row = get_user_by_email(user_email)
        if not user_row:
            return JSONResponse(
                {"success": False, "error": "User not found"}, status_code=404
            )

        user_cd = user_row.UserCD

        # Lấy danh sách sessions
        result = chat_service.get_user_sessions(user_cd, limit=50)

        if not result["success"]:
            return JSONResponse(
                {
                    "success": False,
                    "error": result.get("error", "Failed to get conversations"),
                },
                status_code=500,
            )

        # Format response for frontend
        conversations = []
        for session in result["sessions"]:
            conversations.append(
                {
                    "id": session["SessionId"],
                    "title": (
                        session["FirstQuestion"][:50] + "..."
                        if session["FirstQuestion"]
                        else "新しいチャット"
                    ),
                    "last_message": (
                        session["FirstQuestion"][:50] + "..."
                        if session["FirstQuestion"]
                        else ""
                    ),
                    "created_at": (
                        session["FirstMessageAt"].isoformat()
                        if session["FirstMessageAt"]
                        else None
                    ),
                    "updated_at": (
                        session["LastMessageAt"].isoformat()
                        if session["LastMessageAt"]
                        else None
                    ),
                    "message_count": session["MessageCount"],
                    "is_resolved": session["ResolvedTurnNo"] is not None,
                }
            )

        return JSONResponse({"success": True, "conversations": conversations})

    except Exception as e:
        logger.error(f"Get conversations error: {str(e)}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.post("/api/conversation/{qa_log_cd}/resolve")
async def mark_resolved(request: Request, qa_log_cd: int):
    """API to mark conversation as resolved"""
    guard = login_required(request, api=True)
    if guard:
        return guard

    try:
        if not qa_log_cd or qa_log_cd <= 0:
            return JSONResponse(
                {"success": False, "error": "Invalid qa_log_cd"}, status_code=400
            )

        logger.info(f"Marking as resolved: qa_log_cd={qa_log_cd}")

        result = chat_service.mark_session_resolved(qa_log_cd)

        if not result["success"]:
            logger.error(f"Mark resolved failed: {result.get('error')}")
            return JSONResponse(
                {
                    "success": False,
                    "error": result.get("error", "Failed to mark as resolved"),
                },
                status_code=500,
            )

        logger.info(f"Successfully marked as resolved: qa_log_cd={qa_log_cd}")

        return JSONResponse(
            {
                "success": True,
                "qa_log_cd": qa_log_cd,
                "message": "問題が解決済みとしてマークされました",
            }
        )

    except Exception as e:
        logger.error(f"Mark resolved error: {str(e)}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.get("/api/conversation/{session_id}/history")
async def get_conversation_history(request: Request, session_id: str):
    """API to get conversation history"""
    guard = login_required(request, api=True)
    if guard:
        return guard

    try:
        result = chat_service.get_session_history(session_id)

        if not result["success"]:
            return JSONResponse(
                {
                    "success": False,
                    "error": result.get("error", "Failed to get history"),
                },
                status_code=500,
            )

        # Format logs for frontend
        messages = []
        for log in result["logs"]:
            messages.append(
                {
                    "turn_no": log["TurnNo"],
                    "question": log["QuestionText"],
                    "answer": log["AnswerText"],
                    "timestamp": (
                        log["RegisteredAt"].isoformat() if log["RegisteredAt"] else None
                    ),
                    "is_resolved": log["ResolvedTurnNo"] is not None,
                }
            )

        return JSONResponse(
            {
                "success": True,
                "session_id": session_id,
                "messages": messages,
                "total_turns": result["total_turns"],
            }
        )

    except Exception as e:
        logger.error(f"Get conversation history error: {str(e)}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)
