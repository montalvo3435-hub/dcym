"""
DCYM S.A.S — Centro de control de drones (demo).

Proyecto independiente de conectamunicipio: carpeta, servicio, vhost y
certificado propios. Cada teléfono hace de "dron": manda fotos de su cámara
por WebSocket, el servidor las pasa por el modelo de Roboflow y reenvía
imagen + detecciones a todos los paneles de monitoreo conectados.

La API key de Roboflow vive solo aquí (variable de entorno), nunca llega al
navegador.
"""
import asyncio
import os
import secrets
import time
from collections import deque
from pathlib import Path

import httpx
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

BASE = Path(__file__).parent
STATIC = BASE / "static"

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
# Modelos disponibles, "id|nombre" separados por coma. El primero es el activo al
# arrancar. Se puede cambiar en vivo desde el panel de monitoreo.
MODELS = [
    dict(zip(("id", "name"), m.split("|", 1)))
    for m in os.environ.get(
        "ROBOFLOW_MODELS",
        "cow-o7npg-zouq2/2|Modelo DCYM v2 (propio),coco/3|Modelo base COCO",
    ).split(",")
]
# Clases que cuentan como "vaca". COCO detecta 80 tipos de objeto (solo nos
# sirve "cow"); el modelo DCYM v2 etiqueta el animal (Cattle) y también su
# comportamiento (grazing / standing), a veces sobre el mismo animal.
ALLOWED_CLASSES = {
    c.strip().lower()
    for c in os.environ.get("ALLOWED_CLASSES", "cow,cattle,grazing,standing,lying,riding,smelling").split(",")
}
BEHAVIOR = {"grazing": "pastando", "standing": "de pie", "lying": "echada"}
DEFAULT_CONFIDENCE = int(os.environ.get("DEFAULT_CONFIDENCE", "30"))
DCYM_USER = os.environ.get("DCYM_USER", "dcym")
DCYM_PASS = os.environ.get("DCYM_PASS", "dcym2026")
SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") == "1"

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="dcym_session",
    max_age=60 * 60 * 24 * 7,
    same_site="lax",
    https_only=COOKIE_SECURE,
)
app.mount("/static", StaticFiles(directory=STATIC), name="static")

http = httpx.AsyncClient(timeout=15)

# ------------------------------------------------------------------ estado
state = {
    "confidence": DEFAULT_CONFIDENCE,  # umbral en %, ajustable desde el panel
    "model": MODELS[0]["id"],  # modelo activo
    "frames": 0,               # frames analizados desde que arrancó
    "max_cows": 0,             # máximo de vacas vistas a la vez (todos los drones)
}
drones: dict[int, dict] = {}   # id -> info del dron conectado
drone_ids: dict[str, int] = {} # id del teléfono -> id del dron (sobrevive reconexiones)
panels: set["Panel"] = set()
events: deque = deque(maxlen=40)
_next_id = 0


def logged(conn) -> bool:
    return conn.session.get("user") == DCYM_USER


def public_drone(d: dict, with_frame: bool = False) -> dict:
    keys = ("id", "name", "count", "latency", "since", "last") + (("frame",) if with_frame else ())
    # (no se exponen "ws" ni "old_ws_close", que son internos)
    return {k: d[k] for k in keys}


class Panel:
    """Un panel conectado, con su propia cola de salida.

    Una sola tarea escribe en el socket (nunca hay envíos concurrentes) y
    los drones nunca esperan al panel: dejan el mensaje y siguen. De cada dron
    solo se guarda el último frame, así un computador con red lenta se salta
    frames intermedios en vez de atrasarse y congelarse.
    """
    HEARTBEAT = 2.0

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.queue: deque = deque()        # eventos en orden (join, leave, event…)
        self.frames: dict[int, dict] = {}  # último frame pendiente por dron
        self.stats: dict | None = None     # último resumen pendiente
        self.wake = asyncio.Event()
        self.task: asyncio.Task | None = None

    def push(self, msg: dict):
        t = msg["type"]
        if t == "frame":
            self.frames[msg["id"]] = msg
        elif t == "stats":
            self.stats = msg
        else:
            if t == "leave":
                self.frames.pop(msg["id"], None)
            self.queue.append(msg)
            if len(self.queue) > 500:  # el panel no está leyendo: se cierra y reconecta
                asyncio.create_task(self.close())
        self.wake.set()

    async def run(self):
        try:
            while True:
                try:
                    await asyncio.wait_for(self.wake.wait(), self.HEARTBEAT)
                except asyncio.TimeoutError:
                    await self.ws.send_json({"type": "hb"})
                    continue
                self.wake.clear()
                while self.queue:
                    await self.ws.send_json(self.queue.popleft())
                while self.frames:
                    _, msg = self.frames.popitem()
                    await self.ws.send_json(msg)
                if self.stats:
                    msg, self.stats = self.stats, None
                    await self.ws.send_json(msg)
        except asyncio.CancelledError:
            raise
        except Exception:
            await self.close()

    async def close(self):
        panels.discard(self)
        try:
            await self.ws.close()
        except Exception:
            pass


async def broadcast(msg: dict):
    for p in list(panels):
        p.push(msg)


async def add_event(text: str, kind: str = "info"):
    ev = {"t": time.time(), "text": text, "kind": kind}
    events.appendleft(ev)
    await broadcast({"type": "event", "event": ev})


async def stats_msg() -> dict:
    return {
        "type": "stats",
        "drones": len(drones),
        "cows_now": sum(d["count"] for d in drones.values()),
        "frames": state["frames"],
        "max_cows": state["max_cows"],
        "confidence": state["confidence"],
        "model": state["model"],
    }


def _iou(a: dict, b: dict) -> float:
    ix = max(0.0, min(a["x"] + a["w"] / 2, b["x"] + b["w"] / 2) - max(a["x"] - a["w"] / 2, b["x"] - b["w"] / 2))
    iy = max(0.0, min(a["y"] + a["h"] / 2, b["y"] + b["h"] / 2) - max(a["y"] - a["h"] / 2, b["y"] - b["h"] / 2))
    inter = ix * iy
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union else 0.0


def merge_animals(preds: list[dict]) -> list[dict]:
    """Une cajas de distintas clases que caen sobre el mismo animal, para no
    contar dos veces una vaca marcada como "Cattle" y también como "grazing".
    Se queda la caja de mayor confianza y hereda el comportamiento detectado."""
    kept: list[dict] = []
    for p in sorted(preds, key=lambda p: p["c"], reverse=True):
        same = next((k for k in kept if _iou(k, p) > 0.45), None)
        if same is None:
            kept.append(p)
        elif not same.get("tag") and p.get("tag"):
            same["tag"] = p["tag"]
    return kept


async def detect(image_b64: str) -> dict:
    """Manda una imagen (JPEG en base64) al modelo alojado de Roboflow."""
    if not ROBOFLOW_API_KEY:
        raise RuntimeError("Falta configurar ROBOFLOW_API_KEY en el servidor")
    r = await http.post(
        f"https://detect.roboflow.com/{state['model']}",
        params={
            "api_key": ROBOFLOW_API_KEY,
            "confidence": state["confidence"] / 100,
            "overlap": 0.3,
        },
        content=image_b64,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if r.status_code != 200:
        raise RuntimeError(f"Roboflow respondió {r.status_code}: {r.text[:200]}")
    data = r.json()
    preds = [
        {
            "x": p["x"], "y": p["y"], "w": p["width"], "h": p["height"],
            "c": round(p["confidence"], 3), "cls": p.get("class", "cow"),
            "tag": BEHAVIOR.get(str(p.get("class", "")).lower()),
        }
        for p in data.get("predictions", [])
        if str(p.get("class", "cow")).lower() in ALLOWED_CLASSES
    ]
    return {"predictions": merge_animals(preds), "image": data.get("image", {})}


# ------------------------------------------------------------------ páginas
@app.get("/")
async def landing():
    return FileResponse(STATIC / "index.html")


@app.get("/modelo")
async def modelo():
    return FileResponse(STATIC / "modelo.html")


@app.get("/evidencias")
async def evidencias():
    return FileResponse(STATIC / "evidencias.html")


def protected(page: str):
    async def handler(request: Request):
        if not logged(request):
            return RedirectResponse("/?login=1", status_code=302)
        return FileResponse(STATIC / page)
    return handler


app.get("/app")(protected("app.html"))
app.get("/dron")(protected("dron.html"))
app.get("/panel")(protected("panel.html"))
app.get("/fincas")(protected("fincas.html"))

# Módulo 1: CRUD de fincas (SQLite). Ver fincas.py.
from fincas import router as fincas_router, init_db as fincas_init_db
fincas_init_db()
app.include_router(fincas_router)


# ------------------------------------------------------------------ API
@app.post("/api/login")
async def login(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    user = str(body.get("user", "")).strip().lower()
    pwd = str(body.get("password", ""))
    ok = secrets.compare_digest(user, DCYM_USER) and secrets.compare_digest(pwd, DCYM_PASS)
    if not ok:
        await asyncio.sleep(0.6)  # frena un poco a quien adivina contraseñas
        return JSONResponse({"ok": False, "error": "Usuario o contraseña incorrectos"}, status_code=401)
    request.session["user"] = DCYM_USER
    return {"ok": True}


@app.post("/api/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
async def me(request: Request):
    return {"logged": logged(request), "user": request.session.get("user")}


@app.post("/api/detect")
async def detect_upload(request: Request):
    """Prueba con una imagen suelta (p. ej. una foto de vacas de Google)."""
    if not logged(request):
        return JSONResponse({"error": "no autorizado"}, status_code=401)
    body = await request.json()
    img = str(body.get("image", ""))
    if "," in img[:100]:
        img = img.split(",", 1)[1]
    try:
        t0 = time.perf_counter()
        res = await detect(img)
        res["latency"] = round((time.perf_counter() - t0) * 1000)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
    state["frames"] += 1
    n = len(res["predictions"])
    await add_event(f"Prueba manual: {n} {'vaca' if n == 1 else 'vacas'} en imagen subida", "test")
    await broadcast(await stats_msg())
    return res


# ------------------------------------------------------------------ WebSockets
@app.websocket("/ws/dron")
async def ws_dron(ws: WebSocket):
    global _next_id
    if not logged(ws):
        await ws.close(code=4401)
        return
    await ws.accept()
    # El teléfono manda un id propio: si se reconecta (cambio de red, pantalla
    # bloqueada) conserva su misma cámara en el panel en vez de crear otra.
    cid = (ws.query_params.get("cid") or "")[:64] or secrets.token_hex(8)
    did = drone_ids.get(cid)
    if did is None:
        _next_id += 1
        did = drone_ids[cid] = _next_id
    name = (ws.query_params.get("name") or f"Dron {did}").strip()[:32] or f"Dron {did}"
    old = drones.get(did)
    if old:  # reconexión: la conexión anterior queda reemplazada
        old["name"] = name
        old["ws"] = ws
        try:
            await old["old_ws_close"]()
        except Exception:
            pass
    else:
        drones[did] = {"id": did, "name": name, "count": 0, "latency": None,
                       "since": time.time(), "last": None, "frame": None}
    drones[did]["ws"] = ws
    drones[did]["old_ws_close"] = ws.close
    await ws.send_json({"type": "hello", "id": did, "name": name})
    await broadcast({"type": "join", "drone": public_drone(drones[did])})
    if not old:
        await add_event(f"{name} despegó y está transmitiendo", "join")
    await broadcast(await stats_msg())

    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") != "frame":
                continue
            img = msg.get("image", "")
            if "," in img[:100]:
                img = img.split(",", 1)[1]
            if not img or len(img) > 2_000_000:
                continue
            t0 = time.perf_counter()
            try:
                res = await detect(img)
            except Exception as e:
                await ws.send_json({"type": "error", "error": str(e)})
                await asyncio.sleep(1.5)
                continue
            ms = round((time.perf_counter() - t0) * 1000)
            preds = res["predictions"]
            d = drones.get(did)
            if not d or d.get("ws") is not ws:
                break  # otra conexión de este mismo teléfono tomó el control
            prev = d["count"]
            d.update(count=len(preds), latency=ms, last=time.time(),
                     frame={"image": img, "w": msg.get("w"), "h": msg.get("h"), "predictions": preds})
            state["frames"] += 1
            total_now = sum(x["count"] for x in drones.values())
            state["max_cows"] = max(state["max_cows"], total_now)

            await ws.send_json({"type": "result", "predictions": preds, "latency": ms,
                                "w": msg.get("w"), "h": msg.get("h")})
            await broadcast({
                "type": "frame", "id": did, "name": d["name"],
                "image": img, "w": msg.get("w"), "h": msg.get("h"),
                "predictions": preds, "count": len(preds), "latency": ms,
            })
            if prev == 0 and preds:
                n = len(preds)
                await add_event(f"{d['name']} detectó {n} {'vaca' if n == 1 else 'vacas'}", "cow")
            elif prev and not preds:
                await add_event(f"{d['name']} perdió de vista el ganado", "lost")
            await broadcast(await stats_msg())
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        d = drones.get(did)
        if d and d.get("ws") is ws:  # solo si no lo reemplazó una reconexión
            drones.pop(did, None)
            await broadcast({"type": "leave", "id": did})
            await add_event(f"{d['name']} aterrizó (desconectado)", "leave")
            await broadcast(await stats_msg())


@app.websocket("/ws/panel")
async def ws_panel(ws: WebSocket):
    if not logged(ws):
        await ws.close(code=4401)
        return
    await ws.accept()
    panel = Panel(ws)
    panel.push({
        "type": "snapshot",
        "drones": [public_drone(d, with_frame=True) for d in drones.values()],
        "events": list(events),
        "models": MODELS,
    })
    panel.push(await stats_msg())
    panels.add(panel)
    panel.task = asyncio.create_task(panel.run())
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "confidence":
                v = int(msg.get("value", 40))
                state["confidence"] = max(5, min(95, v))
                await broadcast(await stats_msg())
            elif msg.get("type") == "model":
                m = next((m for m in MODELS if m["id"] == msg.get("value")), None)
                if m and m["id"] != state["model"]:
                    state["model"] = m["id"]
                    await add_event(f"Modelo cambiado a {m['name']}", "info")
                    await broadcast(await stats_msg())
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        panels.discard(panel)
        panel.task.cancel()


@app.get("/healthz")
async def healthz():
    return {"ok": True, "drones": len(drones), "panels": len(panels),
            "roboflow_key": bool(ROBOFLOW_API_KEY), "model": state["model"]}
