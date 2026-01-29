from fastapi import Request
from fastapi.responses import RedirectResponse, JSONResponse

# def login_required(request, api=False):
#     if not request.session.get("user"):
#         if api:
#             return JSONResponse({"error": "Unauthorized"}, status_code=401)
#         return RedirectResponse("/login")
#     return None
def login_required(request: Request, api: bool = False):
    if "user" not in request.session:
        if api:
            return JSONResponse(
                {
                    "success": False,
                    "error": "Unauthorized"
                },
                status_code=401
            )
        else:
            #return RedirectResponse("/login")
            root_path = request.scope.get("prefix", "")
            return RedirectResponse(url=f"{root_path}/login", status_code=302)

    return None