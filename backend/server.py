"""Packet Highway — FastAPI WebSocket server.

Serves the frontend, exposes REST endpoints for interface listing and
capture control, and streams classified packets over a WebSocket.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from sniffer import PacketSniffer, PrivilegeError

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

# --------------------------------------------------------------------------
# WebSocket connection manager
# --------------------------------------------------------------------------

class ConnectionManager:
    """Tracks active WebSocket clients and broadcasts messages."""

    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        data = json.dumps(message)
        stale: list[WebSocket] = []
        for ws in list(self.connections):
            try:
                await ws.send_text(data)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)


# --------------------------------------------------------------------------
# Global instances
# --------------------------------------------------------------------------
manager = ConnectionManager()
sniffer = PacketSniffer(batch_handler=lambda batch: _dispatch_batch(batch))


def _dispatch_batch(batch: list[dict[str, Any]]) -> None:
    """Called from the sniffer's flush thread — schedule async broadcast."""
    if manager.loop is None:
        return
    payload = {"type": "packet_batch", "packets": batch, "count": len(batch)}
    asyncio.run_coroutine_threadsafe(manager.broadcast(payload), manager.loop)


# --------------------------------------------------------------------------
# FastAPI app with lifespan
# --------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Store the event loop reference on startup; clean up on shutdown."""
    manager.loop = asyncio.get_running_loop()
    yield
    sniffer.stop()


app = FastAPI(title="Packet Highway", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.get("/")
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/interfaces")
async def api_interfaces() -> JSONResponse:
    """Return available capture interfaces."""
    try:
        return JSONResponse({"interfaces": sniffer.list_interfaces()})
    except Exception as exc:
        return JSONResponse({"interfaces": [], "error": str(exc)}, status_code=500)


@app.get("/api/status")
async def api_status() -> JSONResponse:
    """Return current sniffer status."""
    return JSONResponse(asdict(sniffer.status))


@app.post("/api/start")
async def api_start(payload: dict[str, Any]) -> JSONResponse:
    """Start capturing on the given interface."""
    interface = payload.get("interface")
    if not interface:
        return JSONResponse(
            {"ok": False, "error": "An interface name is required."},
            status_code=400,
        )
    try:
        sniffer.start(interface)
        return JSONResponse({"ok": True, "status": asdict(sniffer.status)})
    except PrivilegeError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=403)
    except RuntimeError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=409)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


@app.post("/api/stop")
async def api_stop() -> JSONResponse:
    """Stop capturing."""
    sniffer.stop()
    return JSONResponse({"ok": True, "status": asdict(sniffer.status)})


# --------------------------------------------------------------------------
# WebSocket
# --------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        # Send a hello so the client knows the connection is alive
        await websocket.send_json({"type": "hello", "message": "Packet Highway connected."})
        # Keep the connection open — just consume pings/pongs
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# --------------------------------------------------------------------------
# CLI entry-point
# --------------------------------------------------------------------------

def main() -> None:
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(description="Packet Highway server")
    parser.add_argument("--interface", help="Start capturing on this interface immediately")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    if args.interface:
        try:
            sniffer.start(args.interface)
            print(f"  Capturing on {args.interface}")
        except PrivilegeError as exc:
            print(f"  WARNING: {exc}")
        except Exception as exc:
            print(f"  WARNING: Unable to start capture — {exc}")

    print(f"\n  Packet Highway server starting on http://{args.host}:{args.port}\n")
    uvicorn.run("server:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
