from fastapi import FastAPI, HTTPException, APIRouter
from fastapi.responses import StreamingResponse
import json
import time
from pathlib import Path

router = APIRouter()


BASE_DIR = Path(__file__).resolve().parent
FILE_PATH = Path(BASE_DIR / "data.txt")


def stream_text_file_sse():
    with FILE_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            time.sleep(0.2)
            yield f"data: {line.strip()}\n\n"


def stream_text_file():
    if not FILE_PATH.exists():
        yield "File not found\n"
        return

    with FILE_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            # giả lập xử lý chậm giống AI
            # time.sleep(0.2)
            yield line


def stream_jsonl_text_file(file_path: str):
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            yield line.removesuffix("\n").replace("\\n", "\n")


def stream_jsonl_from_text(file_path: str):
    for text in stream_jsonl_text_file(file_path):
        # yield json.dumps({"type": "text", "data": text}, ensure_ascii=False) + "\n"
        if "[[META]]" in text:
            data = json.loads(text.replace("[[META]]", ""))
            yield f"{json.dumps({'type': 'metadata', 'data': data}, ensure_ascii=False)}\n"
        else:
            yield f"{json.dumps({'type':'text','data': text}, ensure_ascii=False)}\n"
        # time.sleep(0.01)


@router.post("/stream/text")
def stream_text():
    print("Received request for streaming text file.")
    return StreamingResponse(
        stream_text_file(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/stream/sse")
def stream_sse():
    return StreamingResponse(stream_text_file_sse(), media_type="text/event-stream")


@router.post("/stream/jsonl")
def stream_jsonl():
    print("Received request for streaming JSONL file.")
    return StreamingResponse(
        stream_jsonl_from_text(FILE_PATH),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
