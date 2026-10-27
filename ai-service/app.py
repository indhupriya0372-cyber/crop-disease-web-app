"""AgriCare AI — Flask backend.

Serves the static website (HTML/CSS/JS), provides login/registration for
farmers and an admin panel, and exposes the prediction API.

    POST /api/predict          multipart form, field "file"
        -> {"predictions": [...], "saved": bool, "record": {...}|null}

Authentication (session cookie based):
    POST /api/auth/register    {name, email, password}
    POST /api/auth/login       {email, password}
    POST /api/auth/logout
    GET  /api/auth/me

Farmer endpoints (login required):
    GET  /api/history          own diagnosis history
Admin endpoints (role "admin"):
    GET  /api/admin/stats
    GET  /api/admin/users      + POST to create, DELETE /api/admin/users/<id>
    GET  /api/admin/predictions

Demo sample images for testing the model:
    GET  /api/samples          reads samples/manifest.json

Run from VS Code:
    pip install -r requirements.txt
    python app.py
Then open http://127.0.0.1:5000

Default accounts created on first run:
    admin  -> admin@agricare.ai  / admin123
    farmer -> farmer@agricare.ai / farmer123
"""

import json
import os
import secrets
import sqlite3
import traceback
from datetime import datetime
from functools import wraps

from flask import (
    Flask,
    g,
    jsonify,
    redirect,
    request,
    send_from_directory,
    session,
)
from werkzeug.security import check_password_hash, generate_password_hash

import predictor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")
DATA_DIR = os.path.join(PROJECT_DIR, "Data")
DB_PATH = os.path.join(PROJECT_DIR, "agricare.db")
SAMPLES_DIR = os.path.join(DATA_DIR, "samples")
SAMPLES_MANIFEST = os.path.join(SAMPLES_DIR, "manifest.json")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "agricare-ai-dev-secret-key")

# ---------------------------------------------------------------------------
# Role based access
#   farmer -> diagnose page only (upload a leaf, get scores, own results)
#   admin  -> admin page only  (see/update every record and user)
# Each role is redirected away from the other role's pages.
# ---------------------------------------------------------------------------
FARMER_PAGES = {"diagnose.html"}
ADMIN_PAGES = {"admin.html"}
GUARDED_PAGES = FARMER_PAGES | ADMIN_PAGES


def home_for(user):
    return "admin.html" if user and user["role"] == "admin" else "diagnose.html"


# --------------------------------------------------------------------------
# Database helpers (SQLite, standard library only)
# --------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _init_db():
    con = sqlite3.connect(DB_PATH)
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'farmer',
            created_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS predictions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER,
            crop        TEXT,
            disease     TEXT,
            scientific  TEXT,
            level       TEXT,
            confidence  REAL,
            treatment   TEXT,
            image_path  TEXT,
            notes       TEXT,
            reviewed    INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
        """
    )

    # Lightweight migrations for databases created by an earlier version
    existing = {r[1] for r in con.execute("PRAGMA table_info(predictions)").fetchall()}
    for column, ddl in (("image_path", "ALTER TABLE predictions ADD COLUMN image_path TEXT"),
                        ("notes", "ALTER TABLE predictions ADD COLUMN notes TEXT"),
                        ("reviewed", "ALTER TABLE predictions ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0")):
        if column not in existing:
            con.execute(ddl)

    def ensure_user(name, email, password, role):
        cur = con.execute("SELECT id FROM users WHERE email = ?", (email,))
        if cur.fetchone() is None:
            con.execute(
                "INSERT INTO users (name, email, password_hash, role, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (
                    name,
                    email,
                    generate_password_hash(password),
                    role,
                    datetime.utcnow().isoformat(timespec="seconds"),
                ),
            )

    ensure_user("Site Administrator", "admin@agricare.ai", "admin123", "admin")
    ensure_user("Demo Farmer", "farmer@agricare.ai", "farmer123", "farmer")
    con.commit()
    con.close()


# --------------------------------------------------------------------------
# Auth helpers
# --------------------------------------------------------------------------
def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    row = get_db().execute(
        "SELECT id, name, email, role, created_at FROM users WHERE id = ?", (uid,)
    ).fetchone()
    if row is None:
        session.clear()
        return None
    return dict(row)


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return jsonify({"error": "login required"}), 401
        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "login required"}), 401
        if user["role"] != "admin":
            return jsonify({"error": "admin only"}), 403
        return view(*args, **kwargs)

    return wrapper


# --------------------------------------------------------------------------
# Page routes
# --------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.after_request
def no_stale_assets(resp):
    """Never let the browser cache HTML/JS/CSS.

    Without this, an old cached auth.js can keep redirecting to removed
    pages after an update, which looks like "login does not work".
    """
    if resp.mimetype in ("text/html", "application/javascript", "text/css"):
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp


@app.route("/login.html")
def login_page():
    user = current_user()
    if user is not None:
        return redirect("/" + home_for(user))
    return send_from_directory(FRONTEND_DIR, "login.html")


@app.route("/dashboard.html")
def dashboard_page():
    """Kept for old bookmarks — each role lands on its own home page."""
    user = current_user()
    if user is None:
        return redirect("/login.html?next=dashboard.html")
    return redirect("/" + home_for(user))


@app.route("/diagnose.html")
def diagnose_page():
    user = current_user()
    if user is None:
        return redirect("/login.html?next=diagnose.html")
    if user["role"] != "farmer":
        return redirect("/admin.html")  # admins manage records, not leaf uploads
    return send_from_directory(FRONTEND_DIR, "diagnose.html")


@app.route("/admin.html")
def admin_page():
    user = current_user()
    if user is None:
        return redirect("/login.html?next=admin.html")
    if user["role"] != "admin":
        return redirect("/diagnose.html")  # farmers have no access here
    return send_from_directory(FRONTEND_DIR, "admin.html")


BLOCKED_ASSETS = {
    "agricare.db", "agricare.db-journal", ".env", "contact_messages.log",
    "requirements.txt", "app.py", "predictor.py", "smoke_test.py",
    "train_cnn.py", "evaluate_model.py", "generate_samples.py", "generate_assets.py",
}
BLOCKED_PREFIXES = ("server/", ".git/", ".venv/", "venv/", "__pycache__/", "model/", "docs/")


@app.route("/uploads/<path:name>")
def uploaded_file(name):
    """Leaf photos uploaded by farmers, visible to logged-in users only."""
    user = current_user()
    if user is None:
        return jsonify({"error": "Login required"}), 401
    return send_from_directory(UPLOAD_DIR, name)


@app.route("/<path:path>")
def assets(path):
    """Serve css/, js/, assets/, samples/ and the public pages.

    The database, .env files, source code and uploaded photos are never
    reachable through this catch-all.
    """
    if path in BLOCKED_ASSETS or path.startswith(BLOCKED_PREFIXES):
        return jsonify({"error": "Not found"}), 404
    if path.startswith("samples/"):
        return send_from_directory(SAMPLES_DIR, path[len("samples/"):])
    return send_from_directory(FRONTEND_DIR, path)


# --------------------------------------------------------------------------
# Auth API
# --------------------------------------------------------------------------
@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user = current_user()
    return jsonify({"user": user})


@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    payload = request.get_json(silent=True) or request.form
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not name or not email or len(password) < 6:
        return (
            jsonify(
                {
                    "error": "Name, a valid email and a password of at least 6 characters are required."
                }
            ),
            400,
        )
    if "@" not in email:
        return jsonify({"error": "Please enter a valid email address."}), 400

    db = get_db()
    if db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
        return jsonify({"error": "An account with this email already exists."}), 409

    role = "farmer"  # public registration can only create farmer accounts
    cur = db.execute(
        "INSERT INTO users (name, email, password_hash, role, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (
            name,
            email,
            generate_password_hash(password),
            role,
            datetime.utcnow().isoformat(timespec="seconds"),
        ),
    )
    db.commit()

    session.clear()
    session["user_id"] = cur.lastrowid
    session["role"] = role
    return jsonify(
        {
            "user": {"id": cur.lastrowid, "name": name, "email": email, "role": role},
            "message": "Account created. Welcome to AgriCare AI!",
        }
    )


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    payload = request.get_json(silent=True) or request.form
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    requested_role = (payload.get("role") or "").strip()

    if not email or not password:
        return jsonify({"error": "Please enter your email and password."}), 400

    row = get_db().execute(
        "SELECT * FROM users WHERE email = ?", (email,)
    ).fetchone()

    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Incorrect email or password."}), 401

    if requested_role and requested_role != row["role"]:
        return (
            jsonify(
                {
                    "error": "This account is registered as '%s'. Switch the tab and try again."
                    % row["role"]
                }
            ),
            403,
        )

    session.clear()
    session["user_id"] = row["id"]
    session["role"] = row["role"]
    return jsonify(
        {
            "user": {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "role": row["role"],
            },
            "message": "Logged in.",
        }
    )


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"status": "ok"})


# --------------------------------------------------------------------------
# Prediction API
# --------------------------------------------------------------------------
@app.route("/api/predict", methods=["POST"])
def predict():
    if "file" not in request.files:
        return jsonify({"error": "No 'file' part in request"}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "No file selected"}), 400

    data = file.read()
    if not data:
        return jsonify({"error": "Empty file"}), 400
    if len(data) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "Image too large (max 10 MB)"}), 413

    try:
        predictions = predictor.predict_image_bytes(data)
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Could not process image"}), 500

    record = None
    user = current_user()
    if user is not None and user["role"] == "farmer" and predictions:
        top = predictions[0]
        crop = top["name"].split(" — ")[0]
        image_path = _save_upload(file, data)
        db = get_db()
        cur = db.execute(
            "INSERT INTO predictions"
            " (user_id, crop, disease, scientific, level, confidence, treatment, image_path, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                user["id"],
                crop,
                top["name"],
                top["scientific"],
                top["level"],
                top["confidence"],
                json.dumps(top["treatment"]),
                image_path,
                datetime.utcnow().isoformat(timespec="seconds"),
            ),
        )
        db.commit()
        record = {
            "id": cur.lastrowid,
            "crop": crop,
            "disease": top["name"],
            "confidence": top["confidence"],
            "image_url": "/uploads/" + image_path if image_path else None,
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
        }

    return jsonify({"predictions": predictions, "saved": record is not None, "record": record})


def _save_upload(file_storage, data):
    """Persist the uploaded leaf photo so admins can review it later."""
    ext = os.path.splitext(file_storage.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        ext = ".png"
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        name = "%s_%s%s" % (
            datetime.utcnow().strftime("%Y%m%d%H%M%S"),
            secrets.token_hex(4),
            ext,
        )
        with open(os.path.join(UPLOAD_DIR, name), "wb") as fh:
            fh.write(data)
        return name
    except OSError:
        traceback.print_exc()
        return None


@app.route("/api/history", methods=["GET"])
@login_required
def history():
    user = current_user()
    db = get_db()
    if user["role"] == "admin" and request.args.get("all") == "1":
        rows = db.execute(
            "SELECT p.*, u.name AS user_name, u.email AS user_email"
            " FROM predictions p LEFT JOIN users u ON u.id = p.user_id"
            " ORDER BY p.id DESC LIMIT 500"
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM predictions WHERE user_id = ? ORDER BY id DESC LIMIT 200",
            (user["id"],),
        ).fetchall()

    return jsonify({"history": [_row_to_prediction(r) for r in rows]})


# --------------------------------------------------------------------------
# Admin API
# --------------------------------------------------------------------------
@app.route("/api/admin/stats", methods=["GET"])
@admin_required
def admin_stats():
    db = get_db()
    users = db.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    farmers = db.execute(
        "SELECT COUNT(*) AS c FROM users WHERE role = 'farmer'"
    ).fetchone()["c"]
    predictions = db.execute("SELECT COUNT(*) AS c FROM predictions").fetchone()["c"]
    healthy = db.execute(
        "SELECT COUNT(*) AS c FROM predictions WHERE level = 'healthy'"
    ).fetchone()["c"]
    diseased = predictions - healthy
    avg_conf = db.execute(
        "SELECT AVG(confidence) AS a FROM predictions"
    ).fetchone()["a"]
    by_crop = [
        dict(r)
        for r in db.execute(
            "SELECT crop, COUNT(*) AS count FROM predictions"
            " GROUP BY crop ORDER BY count DESC"
        ).fetchall()
    ]
    return jsonify(
        {
            "users": users,
            "farmers": farmers,
            "predictions": predictions,
            "healthy": healthy,
            "diseased": diseased,
            "avg_confidence": round(avg_conf, 3) if avg_conf is not None else None,
            "by_crop": by_crop,
        }
    )


@app.route("/api/admin/users", methods=["GET", "POST"])
@admin_required
def admin_users():
    db = get_db()
    if request.method == "POST":
        payload = request.get_json(silent=True) or request.form
        name = (payload.get("name") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        role = (payload.get("role") or "farmer").strip()
        if role not in ("farmer", "admin"):
            role = "farmer"
        if not name or not email or len(password) < 6:
            return jsonify({"error": "Name, email and 6+ char password required."}), 400
        if db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
            return jsonify({"error": "Email already exists."}), 409
        cur = db.execute(
            "INSERT INTO users (name, email, password_hash, role, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                name,
                email,
                generate_password_hash(password),
                role,
                datetime.utcnow().isoformat(timespec="seconds"),
            ),
        )
        db.commit()
        return jsonify({"status": "ok", "id": cur.lastrowid})

    rows = db.execute(
        "SELECT id, name, email, role, created_at FROM users ORDER BY id"
    ).fetchall()
    counts = {
        r["user_id"]: r["c"]
        for r in db.execute(
            "SELECT user_id, COUNT(*) AS c FROM predictions GROUP BY user_id"
        ).fetchall()
    }
    users = []
    for r in rows:
        item = dict(r)
        item["predictions"] = counts.get(r["id"], 0)
        users.append(item)
    return jsonify({"users": users})


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    me = current_user()
    if user_id == me["id"]:
        return jsonify({"error": "You cannot delete your own account."}), 400
    db = get_db()
    db.execute("DELETE FROM predictions WHERE user_id = ?", (user_id,))
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return jsonify({"status": "ok"})


def _row_to_prediction(row):
    item = dict(row)
    try:
        item["treatment"] = json.loads(item.get("treatment") or "[]")
    except (TypeError, ValueError):
        item["treatment"] = []
    if item.get("image_path"):
        item["image_url"] = "/uploads/" + item["image_path"]
    return item


@app.route("/api/admin/predictions", methods=["GET"])
@admin_required
def admin_predictions():
    rows = get_db().execute(
        "SELECT p.*, u.name AS user_name, u.email AS user_email"
        " FROM predictions p LEFT JOIN users u ON u.id = p.user_id"
        " ORDER BY p.id DESC LIMIT 500"
    ).fetchall()
    return jsonify({"predictions": [_row_to_prediction(r) for r in rows]})


@app.route("/api/admin/predictions/<int:rec_id>", methods=["PATCH", "PUT"])
@admin_required
def admin_update_prediction(rec_id):
    """Admin edits the details of a record: review status, notes, verified label."""
    body = request.get_json(silent=True) or {}
    db = get_db()
    row = db.execute("SELECT * FROM predictions WHERE id = ?", (rec_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Record not found"}), 404

    fields, values = [], []

    if "reviewed" in body:
        fields.append("reviewed = ?")
        values.append(1 if body["reviewed"] else 0)

    if "notes" in body:
        fields.append("notes = ?")
        values.append(str(body["notes"] or "")[:2000])

    if "disease" in body and str(body["disease"]).strip():
        fields.append("disease = ?")
        values.append(str(body["disease"]).strip()[:200])

    if "confidence" in body:
        try:
            conf = float(body["confidence"])
        except (TypeError, ValueError):
            return jsonify({"error": "confidence must be a number"}), 400
        if not 0 <= conf <= 1:
            return jsonify({"error": "confidence must be between 0 and 1"}), 400
        fields.append("confidence = ?")
        values.append(round(conf, 4))

    if not fields:
        return jsonify({"error": "Nothing to update"}), 400

    values.append(rec_id)
    db.execute("UPDATE predictions SET %s WHERE id = ?" % ", ".join(fields), values)
    db.commit()
    row = db.execute(
        "SELECT p.*, u.name AS user_name, u.email AS user_email"
        " FROM predictions p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?",
        (rec_id,),
    ).fetchone()
    return jsonify({"status": "ok", "prediction": _row_to_prediction(row)})


@app.route("/api/admin/predictions/<int:rec_id>", methods=["DELETE"])
@admin_required
def admin_delete_prediction(rec_id):
    db = get_db()
    row = db.execute("SELECT image_path FROM predictions WHERE id = ?", (rec_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Record not found"}), 404
    db.execute("DELETE FROM predictions WHERE id = ?", (rec_id,))
    db.commit()
    if row["image_path"]:
        try:
            os.remove(os.path.join(UPLOAD_DIR, row["image_path"]))
        except OSError:
            pass
    return jsonify({"status": "ok"})


# --------------------------------------------------------------------------
# Sample images API (labelled test images for the model)
# --------------------------------------------------------------------------
@app.route("/api/samples", methods=["GET"])
def samples_list():
    items = []
    if os.path.exists(SAMPLES_MANIFEST):
        try:
            with open(SAMPLES_MANIFEST, encoding="utf-8") as fh:
                items = json.load(fh)
        except (OSError, ValueError):
            items = []
    elif os.path.isdir(SAMPLES_DIR):
        for name in sorted(os.listdir(SAMPLES_DIR)):
            if name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                items.append({"file": name, "label": name, "url": "/samples/" + name})
    return jsonify({"samples": items})


# --------------------------------------------------------------------------
# Misc API
# --------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/contact", methods=["POST"])
def contact():
    """Simple contact endpoint. Messages are appended to contact_messages.log
    (for academic demo; replace with email/DB in production)."""
    name = request.form.get("name", "")
    email = request.form.get("email", "")
    subject = request.form.get("subject", "")
    message = request.form.get("message", "")

    if not name or not email or not message:
        return jsonify({"error": "Please fill in name, email and message"}), 400

    log_path = os.path.join(PROJECT_DIR, "contact_messages.log")
    try:
        with open(log_path, "a", encoding="utf-8") as fh:
            fh.write(
                f"{name} | {email} | {subject} | {message.replace(chr(10), ' ')}\n"
            )
    except OSError:
        traceback.print_exc()

    return jsonify({"status": "ok", "message": "Message received. Thank you!"})


_init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # The auto-reloader restarts the server (and makes the browser page flash)
    # whenever a watched file changes, so it is opt-in only.
    debug = os.environ.get("FLASK_DEBUG") == "1"
    print("AgriCare AI running at http://127.0.0.1:%d" % port)
    app.run(host="127.0.0.1", port=port, debug=debug, use_reloader=debug)
