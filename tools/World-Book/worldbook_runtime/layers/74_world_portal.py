WORLD_PORTAL_PORT = int(os.environ.get("WORLD_PORTAL_PORT") or 8770)
WORLD_PORTAL_PROCESS = None
WORLD_PORTAL_LOCK = threading.RLock()


def world_portal_root() -> Path:
    return BASE_DIR / "tools" / "World-Portal"


def world_portal_entry() -> Path:
    return world_portal_root() / "server.py"


def world_portal_health() -> dict | None:
    connection = None
    try:
        connection = http.client.HTTPConnection("127.0.0.1", WORLD_PORTAL_PORT, timeout=0.65)
        connection.request("GET", "/api/health", headers={"Connection": "close"})
        response = connection.getresponse()
        payload = json.loads(response.read(65536).decode("utf-8"))
        if response.status == 200 and payload.get("ok") is True \
                and payload.get("service") == "world-portal":
            return payload
    except (OSError, ValueError, UnicodeError):
        pass
    finally:
        if connection:
            with contextlib.suppress(OSError):
                connection.close()
    return None


def world_portal_port_open() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", WORLD_PORTAL_PORT), timeout=0.25):
            return True
    except OSError:
        return False


def world_portal_listener_pids() -> list[int]:
    if os.name != "nt":
        return []
    result = subprocess.run(
        ["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True, check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    marker = f":{WORLD_PORTAL_PORT}"
    return sorted({int(parts[-1]) for line in (result.stdout or "").splitlines()
                   if marker in line and "LISTENING" in line.upper()
                   and (parts := line.split()) and parts[-1].isdigit()})


def world_portal_desired() -> bool:
    return CONFIG.get("worldPortalDesired") is True


def save_world_portal_desired(enabled: bool) -> None:
    CONFIG["worldPortalDesired"] = bool(enabled)
    save_config()


def world_portal_status(message: str = "") -> dict:
    global WORLD_PORTAL_PROCESS
    health = world_portal_health()
    process_alive = bool(WORLD_PORTAL_PROCESS and WORLD_PORTAL_PROCESS.poll() is None)
    running = health is not None
    blocked = world_portal_port_open() and not running
    installed = world_portal_entry().is_file()
    state = "running" if running else "starting" if process_alive else "blocked" if blocked else "stopped"
    return {
        "ok": installed and not blocked,
        "service": "world-portal-controller",
        "installed": installed,
        "running": running,
        "desiredRunning": world_portal_desired(),
        "state": state,
        "port": WORLD_PORTAL_PORT,
        "url": f"http://127.0.0.1:{WORLD_PORTAL_PORT}/",
        "appVersion": health.get("appVersion", "") if health else "",
        "message": message or ("World Portal is online." if running else
                               f"Port {WORLD_PORTAL_PORT} belongs to another service." if blocked else
                               "World Portal is resting."),
    }


def start_world_portal(*, persist: bool = True) -> dict:
    global WORLD_PORTAL_PROCESS
    with WORLD_PORTAL_LOCK:
        if persist:
            save_world_portal_desired(True)
        current = world_portal_status()
        if current["running"]:
            return {**current, "message": "World Portal is already online."}
        if not current["ok"]:
            return current
        entry = world_portal_entry()
        flags = 0
        if os.name == "nt":
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
        WORLD_PORTAL_PROCESS = subprocess.Popen(
            [sys.executable, str(entry), "--host", "127.0.0.1", "--port",
             str(WORLD_PORTAL_PORT), "--no-browser", "--strict-port"],
            cwd=str(entry.parent), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, env=env, creationflags=flags,
        )
    deadline = time.monotonic() + 8.0
    while time.monotonic() < deadline and not world_portal_health():
        if WORLD_PORTAL_PROCESS and WORLD_PORTAL_PROCESS.poll() is not None:
            break
        time.sleep(0.12)
    result = world_portal_status("World Portal started." if world_portal_health() else "World Portal is starting.")
    if WORLD_PORTAL_PROCESS and WORLD_PORTAL_PROCESS.poll() is not None and not result["running"]:
        result.update(ok=False, state="error", message="World Portal exited before becoming ready.")
    return result


def stop_world_portal(*, persist: bool = True) -> dict:
    global WORLD_PORTAL_PROCESS
    with WORLD_PORTAL_LOCK:
        if persist:
            save_world_portal_desired(False)
        verified = world_portal_health() is not None
        if verified and os.name == "nt":
            for pid in world_portal_listener_pids():
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True,
                               check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if WORLD_PORTAL_PROCESS and WORLD_PORTAL_PROCESS.poll() is None:
            with contextlib.suppress(OSError):
                WORLD_PORTAL_PROCESS.terminate()
            try:
                WORLD_PORTAL_PROCESS.wait(timeout=2)
            except subprocess.TimeoutExpired:
                with contextlib.suppress(OSError):
                    WORLD_PORTAL_PROCESS.kill()
                with contextlib.suppress(OSError, subprocess.TimeoutExpired):
                    WORLD_PORTAL_PROCESS.wait(timeout=2)
        WORLD_PORTAL_PROCESS = None
    deadline = time.monotonic() + 2.5
    while time.monotonic() < deadline and world_portal_health():
        time.sleep(0.1)
    result = world_portal_status("World Portal stopped." if verified else "World Portal was already stopped.")
    if result["running"]:
        result.update(ok=False, state="error", message="World Portal did not stop cleanly.")
    return result


def restore_world_portal_desired_state_async() -> None:
    if world_portal_desired():
        threading.Thread(target=lambda: start_world_portal(persist=False),
                         name="world-book-portal-restore", daemon=True).start()


def handle_world_portal_get(handler, parsed) -> bool:
    if parsed.path != "/api/world-portal/status":
        return False
    handler.send_json(world_portal_status())
    return True


def handle_world_portal_post(handler, parsed) -> bool:
    if parsed.path not in {"/api/world-portal/start", "/api/world-portal/stop"}:
        return False
    action = start_world_portal if parsed.path.endswith("/start") else stop_world_portal
    payload = action()
    handler.send_json(payload, HTTPStatus.OK if payload.get("ok") else HTTPStatus.INTERNAL_SERVER_ERROR)
    return True
