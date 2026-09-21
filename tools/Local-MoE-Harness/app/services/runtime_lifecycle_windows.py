from __future__ import annotations

import asyncio
import subprocess
from typing import Any

import psutil

from .model_registry import ModelRecord
from .runtime_lifecycle_linux import RuntimeLifecycle as LinuxRuntimeLifecycle


_TRUE = {"1", "true", "yes", "on"}


class RuntimeLifecycle(LinuxRuntimeLifecycle):
    """Native-Windows lifecycle for project-local model runtimes."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.script = self.root / "scripts" / "run-freetoken-windows.ps1"
        self.venv = self.root / ".venvs" / "freetoken"
        self.ft_python = self.venv / "Scripts" / "python.exe"
        self.runtime_dir = self.root / "runtime" / "freetoken"
        self.prism_script = self.root / "scripts" / "run-prism-llama-windows.ps1"
        self.prism_runtime_dir = self.root / "runtime" / "prism-llama" / "windows-cuda"
        self.console_pid_path = self.state_dir / "runtime-console.pid"

    @staticmethod
    def _pid_alive(pid: int | None) -> bool:
        if not pid or pid <= 1:
            return False
        try:
            return psutil.Process(pid).is_running()
        except psutil.Error:
            return False

    def _console_pid(self) -> int | None:
        try:
            return int(self.console_pid_path.read_text(encoding="ascii").strip())
        except (OSError, ValueError):
            return None

    def _stop_console_monitor(self) -> None:
        pid = self._console_pid()
        if pid and self._pid_alive(pid):
            try:
                process = psutil.Process(pid)
                process.terminate()
                process.wait(timeout=3)
            except psutil.TimeoutExpired:
                try:
                    process.kill()
                except psutil.Error:
                    pass
            except psutil.Error:
                pass
        try:
            self.console_pid_path.unlink()
        except OSError:
            pass

    def _ensure_console_monitor(self, record: ModelRecord) -> int:
        pid = self._console_pid()
        if pid and self._pid_alive(pid):
            return pid
        try:
            self.console_pid_path.unlink()
        except OSError:
            pass
        log_path = str(self.log_path).replace("'", "''")
        title = f"EveOS Local MoE Runtime - {record.display_name}".replace("'", "''")
        command = (
            f"$Host.UI.RawUI.WindowTitle='{title}'; "
            "Write-Host '[EveOS] Live Local MoE runtime log (managed by EveOS).'; "
            f"Get-Content -LiteralPath '{log_path}' -Tail 40 -Wait"
        )
        flags = int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        flags |= int(getattr(subprocess, "CREATE_NEW_CONSOLE", 0))
        monitor = subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-Command", command],
            cwd=str(self.root),
            creationflags=flags,
        )
        self.console_pid_path.write_text(f"{monitor.pid}\n", encoding="ascii")
        return monitor.pid

    def _pid_is_managed_runtime(self, pid: int) -> bool:
        try:
            process = psutil.Process(pid)
            command = " ".join(process.cmdline()).lower()
        except psutil.Error:
            return False
        root = str(self.root).lower()
        return root in command and (
            "run-freetoken-windows.ps1" in command
            or "run-prism-llama-windows.ps1" in command
            or "llama-server.exe" in command
            or (
                str(self.ft_python).lower() in command
                and "freetoken.cli" in command
                and " serve " in f" {command} "
            )
        )

    def local_status(self) -> dict[str, Any]:
        pid = self._read_pid()
        running = self._pid_alive(pid)
        if pid and not running:
            try:
                self.pid_path.unlink()
            except OSError:
                pass
            pid = None

        missing: list[str] = []
        backend = self.active_runtime_backend()
        if backend == "prism-llama":
            if not self.prism_script.is_file():
                missing.append(str(self.prism_script))
            if not any(self.prism_runtime_dir.rglob("llama-server.exe")):
                missing.append(str(self.prism_runtime_dir / "llama-server.exe"))
        else:
            if not self.script.is_file():
                missing.append(str(self.script))
            if not self.ft_python.is_file():
                missing.append(str(self.ft_python))

        return {
            "managed_pid": pid,
            "managed_running": running,
            "can_start": not missing,
            "missing": missing,
            "log_path": str(self.log_path),
            "startup_gpu_mode": self.startup_gpu_mode,
            "active_model_id": self.active_model_id,
            "active_profile": self.active_profile_name,
            "startup_stage": self.startup_stage,
            "last_error": self.last_error,
            "platform_runtime": "native-windows",
            "runtime_backend": backend,
            "console_pid": self._console_pid(),
            "console_visible": self._pid_alive(self._console_pid()),
        }

    async def stop_managed(self) -> None:
        self.startup_stage = "stopping"
        pid = self._read_pid()
        if pid and self._pid_alive(pid):
            if not self._pid_is_managed_runtime(pid):
                self.last_error = (
                    f"Refusing to stop PID {pid}: it is not this harness's "
                    "project-local model runtime."
                )
                try:
                    self.pid_path.unlink()
                except OSError:
                    pass
                self.startup_stage = "stopped"
                return
            try:
                parent = psutil.Process(pid)
                processes = parent.children(recursive=True)
                processes.append(parent)
                for process in reversed(processes):
                    try:
                        process.terminate()
                    except psutil.Error:
                        pass
                _, alive = psutil.wait_procs(processes, timeout=10)
                for process in alive:
                    try:
                        process.kill()
                    except psutil.Error:
                        pass
            except psutil.Error:
                pass
        try:
            self.pid_path.unlink()
        except OSError:
            pass
        self._stop_console_monitor()
        self.startup_stage = "stopped"

    def _process_args(self, record: ModelRecord) -> list[str]:
        if record.runtime_backend == "prism-llama":
            return [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(self.prism_script),
                "-ModelPath",
                str(record.runtime_path),
                "-Port",
                str(self.port),
                "-ServedModelName",
                record.served_model_name,
            ]
        return [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(self.script),
            "-ModelPath",
            str(record.runtime_path),
            "-Port",
            str(self.port),
        ]

    @staticmethod
    def _headless_requested(environment: dict[str, str]) -> bool:
        value = (
            environment.get("LOCAL_MOE_HEADLESS")
            or environment.get("EVEOS_HEADLESS")
            or ""
        )
        return str(value).strip().lower() in _TRUE

    async def _start_process(
        self,
        record: ModelRecord,
        environment: dict[str, str],
    ) -> dict[str, Any]:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.startup_stage = "loading_weights"
        self.last_error = None
        try:
            self._log_start_offset = self.log_path.stat().st_size
        except OSError:
            self._log_start_offset = 0

        args = self._process_args(record)
        headless = self._headless_requested(environment)
        if headless:
            self._stop_console_monitor()
        else:
            self._ensure_console_monitor(record)
        log_file = self.log_path.open("ab", buffering=0)
        creationflags = int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                cwd=str(self.root),
                stdout=log_file,
                stderr=asyncio.subprocess.STDOUT,
                env=environment,
                creationflags=creationflags,
            )
        finally:
            log_file.close()

        self.pid_path.write_text(f"{process.pid}\n", encoding="utf-8")
        self.active_model_id = record.id
        await asyncio.sleep(0.35)
        if process.returncode is not None:
            try:
                self.pid_path.unlink()
            except OSError:
                pass
            self.last_error = (
                f"Local model runtime exited immediately with code {process.returncode}. "
                f"Check {self.log_path}."
            )
            self.startup_stage = "failed"
            return {**self.local_status(), "started": False, "error": self.last_error}

        return {
            **self.local_status(),
            "started": True,
            "already_reachable": False,
            "health_status": "starting",
        }

    async def _existing_runtime(self) -> dict[str, Any] | None:
        existing = await super()._existing_runtime()
        if existing is None:
            return None
        pid = self._read_pid()
        if pid and self._pid_alive(pid) and self._pid_is_managed_runtime(pid):
            return existing
        self.active_model_id = None
        self.active_profile_name = None
        self.startup_stage = "blocked_external_runtime"
        self.last_error = (
            f"A model server is already reachable on port {self.port}, but it "
            "was not launched from this tool folder. Self-contained mode refuses "
            "to adopt external runtimes."
        )
        return None
