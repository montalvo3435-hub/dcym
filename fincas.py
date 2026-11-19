"""
fincas.py — Módulo 1: gestión de fincas (CRUD) de DCYM.

Registra las fincas que monitorea el servicio: nombre, municipio, hectáreas y
cantidad de reses declaradas. Persistencia en SQLite (archivo dcym.db junto a
la app), sin dependencias nuevas: sqlite3 viene con Python.

Validaciones en el servidor, no solo en el formulario: el navegador se puede
saltar, la API no.
"""
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

# data/ es el único directorio con escritura para el usuario del servicio.
DB = Path(__file__).parent / "data" / "dcym.db"
router = APIRouter(prefix="/api/fincas")

MUNICIPIOS = {
    "Montería", "Cereté", "Lorica", "Sahagún", "Planeta Rica", "Montelíbano",
    "Puerto Libertador", "Tierralta", "Valencia", "Ciénaga de Oro", "Otro",
}


def conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS fincas (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre     TEXT    NOT NULL,
                municipio  TEXT    NOT NULL,
                hectareas  REAL    NOT NULL CHECK (hectareas > 0),
                reses      INTEGER NOT NULL CHECK (reses >= 0),
                propietario TEXT   NOT NULL DEFAULT '',
                creada     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
            )""")


def validar(body: dict) -> tuple[dict, dict]:
    """Devuelve (datos limpios, errores por campo)."""
    errores, d = {}, {}
    d["nombre"] = str(body.get("nombre", "")).strip()
    if not 3 <= len(d["nombre"]) <= 80:
        errores["nombre"] = "El nombre debe tener entre 3 y 80 caracteres."
    d["municipio"] = str(body.get("municipio", "")).strip()
    if d["municipio"] not in MUNICIPIOS:
        errores["municipio"] = "Selecciona un municipio de la lista."
    try:
        d["hectareas"] = float(body.get("hectareas"))
        if not 0 < d["hectareas"] <= 100000:
            raise ValueError
    except (TypeError, ValueError):
        errores["hectareas"] = "Las hectáreas deben ser un número mayor que 0."
    try:
        d["reses"] = int(body.get("reses"))
        if not 0 <= d["reses"] <= 1000000:
            raise ValueError
    except (TypeError, ValueError):
        errores["reses"] = "La cantidad de reses debe ser un número entero, 0 o más."
    d["propietario"] = str(body.get("propietario", "")).strip()[:80]
    return d, errores


def _logged(request: Request) -> bool:
    return bool(request.session.get("user"))


def _no_auth():
    return JSONResponse({"ok": False, "error": "Inicia sesión"}, status_code=401)


async def _body(request: Request) -> dict:
    try:
        return await request.json()
    except Exception:
        return {}


@router.get("")
async def listar(request: Request, q: str = ""):
    if not _logged(request):
        return _no_auth()
    with conn() as c:
        filas = c.execute(
            "SELECT * FROM fincas WHERE nombre LIKE ? OR municipio LIKE ? ORDER BY id DESC",
            (f"%{q}%", f"%{q}%"),
        ).fetchall()
    fincas = [dict(f) for f in filas]
    return {"ok": True, "fincas": fincas,
            "totales": {"fincas": len(fincas), "reses": sum(f["reses"] for f in fincas),
                        "hectareas": round(sum(f["hectareas"] for f in fincas), 1)}}


@router.get("/{fid}")
async def consultar(fid: int, request: Request):
    if not _logged(request):
        return _no_auth()
    with conn() as c:
        f = c.execute("SELECT * FROM fincas WHERE id=?", (fid,)).fetchone()
    if not f:
        return JSONResponse({"ok": False, "error": "La finca no existe"}, status_code=404)
    return {"ok": True, "finca": dict(f)}


@router.post("")
async def crear(request: Request):
    if not _logged(request):
        return _no_auth()
    d, err = validar(await _body(request))
    if err:
        return JSONResponse({"ok": False, "errores": err}, status_code=422)
    with conn() as c:
        cur = c.execute(
            "INSERT INTO fincas (nombre, municipio, hectareas, reses, propietario) VALUES (?,?,?,?,?)",
            (d["nombre"], d["municipio"], d["hectareas"], d["reses"], d["propietario"]))
    return JSONResponse({"ok": True, "id": cur.lastrowid}, status_code=201)


@router.put("/{fid}")
async def actualizar(fid: int, request: Request):
    if not _logged(request):
        return _no_auth()
    d, err = validar(await _body(request))
    if err:
        return JSONResponse({"ok": False, "errores": err}, status_code=422)
    with conn() as c:
        cur = c.execute(
            "UPDATE fincas SET nombre=?, municipio=?, hectareas=?, reses=?, propietario=? WHERE id=?",
            (d["nombre"], d["municipio"], d["hectareas"], d["reses"], d["propietario"], fid))
    if cur.rowcount == 0:
        return JSONResponse({"ok": False, "error": "La finca no existe"}, status_code=404)
    return {"ok": True}


@router.delete("/{fid}")
async def eliminar(fid: int, request: Request):
    if not _logged(request):
        return _no_auth()
    with conn() as c:
        cur = c.execute("DELETE FROM fincas WHERE id=?", (fid,))
    if cur.rowcount == 0:
        return JSONResponse({"ok": False, "error": "La finca no existe"}, status_code=404)
    return {"ok": True}
