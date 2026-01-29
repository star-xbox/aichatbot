from fastapi import Request
from fastapi.responses import RedirectResponse

async def force_localhost(request: Request, call_next):
    host = request.headers.get("host", "")

    #if host.startswith("127."):
    #    new_url = request.url.replace(netloc="localhost:8086")
    #    return RedirectResponse(str(new_url), status_code=302)

    return await call_next(request)
