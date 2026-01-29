from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from app.auth.guard import login_required
from app.azure.blob_storage import AzureBlobStorage
from fastapi.responses import StreamingResponse
from azure.core.exceptions import ResourceNotFoundError
from urllib.parse import quote
import mimetypes

router = APIRouter(prefix="/download", tags=["Download"])

blob_service = AzureBlobStorage()


def stream_blob(blob_client):
    stream = blob_client.download_blob()
    for chunk in stream.chunks():
        yield chunk


from fastapi.responses import StreamingResponse


@router.get("/view/{blob_name:path}")
def view_pdf(request: Request, blob_name: str):
    guard = login_required(request, api=True)
    if guard:
        return guard

    blob_client = blob_service.blob_service_client.get_blob_client(
        container=blob_service.container_name,
        blob=blob_name,
    )

    if not blob_client.exists():
        raise HTTPException(404, "Blob not found")

    range_header = request.headers.get("range")

    # ✅ RANGE REQUEST (PDF.js dùng sau)
    if range_header:
        file_size = blob_client.get_blob_properties().size
        start_str, end_str = range_header.replace("bytes=", "").split("-")
        start = int(start_str)
        end = int(end_str) if end_str else file_size - 1
        end = min(end, file_size - 1)

        data = blob_client.download_blob(offset=start, length=end - start + 1).readall()

        return Response(
            content=data,
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{start + len(data) - 1}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Type": "application/pdf",
                "Content-Disposition": "inline",
            },
        )

    # ✅ REQUEST ĐẦU (BẮT BUỘC)
    return Response(
        content=blob_client.download_blob().readall(),
        media_type="application/pdf",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": "inline",
        },
    )


@router.get("/file/{blob_name:path}")
def download_file(request: Request, blob_name: str):
    try:
        # blob_name = "/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf"
        # http://localhost:8086/download/file/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf
        print("Downloading blob:", blob_name)
        guard = login_required(request, api=True)
        if guard:
            return guard
        file_bytes = blob_service.download_blob(blob_name)

        return Response(
            content=file_bytes,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{blob_name.split("/")[-1]}"'
            },
        )

    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/stream/{blob_name:path}")
def download_files_stream(request: Request, blob_name: str):
    try:
        # blob_name = "/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf"
        # http://localhost:8086/download/stream/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf
        print("Streaming blob stream: ", blob_name)
        guard = login_required(request, api=True)
        if guard:
            return guard
        blob_client = blob_service.blob_service_client.get_blob_client(
            blob=blob_name, container=blob_service.container_name
        )
        if not blob_client.exists():
            raise HTTPException(404, "Blob not found")

        mime_type, _ = mimetypes.guess_type(blob_name)
        mime_type = mime_type or "application/octet-stream"
        filename = quote(blob_name.split("/")[-1])
        filename_encoded = quote(filename)
        return StreamingResponse(
            stream_blob(blob_client),
            media_type=mime_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}"
            },
        )

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Blob not found")
