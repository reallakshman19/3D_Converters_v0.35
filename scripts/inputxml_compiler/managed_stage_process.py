#!/usr/bin/env python3
"""Cross-platform subprocess runner with hard in-flight stream limits."""
from __future__ import annotations

import subprocess
import threading
import time
from dataclasses import dataclass
from queue import Empty, Queue
from typing import Mapping, Sequence


class ProcessTimeoutError(RuntimeError):
    pass


class ProcessStreamLimitError(RuntimeError):
    def __init__(self, stream_name: str, limit: int):
        super().__init__(f"{stream_name} exceeded {limit} bytes during execution")
        self.stream_name = stream_name
        self.limit = limit


@dataclass(frozen=True)
class BoundedProcessResult:
    returncode: int
    stdout: bytes
    stderr: bytes


def run_bounded_process(
    argv: Sequence[str],
    *,
    input_bytes: bytes,
    timeout_seconds: float,
    stdout_limit: int,
    stderr_limit: int,
    env: Mapping[str, str] | None = None,
) -> BoundedProcessResult:
    process = subprocess.Popen(
        list(argv),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
        env=dict(env) if env is not None else None,
        bufsize=0,
    )
    violations: Queue[tuple[str, int]] = Queue()
    stdout = bytearray()
    stderr = bytearray()
    threads = [
        threading.Thread(
            target=_read_capped,
            args=(process, process.stdout, stdout, "stdout", stdout_limit, violations),
            daemon=True,
        ),
        threading.Thread(
            target=_read_capped,
            args=(process, process.stderr, stderr, "stderr", stderr_limit, violations),
            daemon=True,
        ),
        threading.Thread(
            target=_write_input,
            args=(process.stdin, input_bytes),
            daemon=True,
        ),
    ]
    for thread in threads:
        thread.start()
    timed_out = _wait_bounded(process, timeout_seconds, violations)
    for thread in threads:
        thread.join(timeout=1)
    if timed_out:
        raise ProcessTimeoutError(f"process exceeded {timeout_seconds} seconds")
    try:
        stream_name, limit = violations.get_nowait()
    except Empty:
        return BoundedProcessResult(process.returncode, bytes(stdout), bytes(stderr))
    raise ProcessStreamLimitError(stream_name, limit)


def _read_capped(
    process: subprocess.Popen,
    stream,
    target: bytearray,
    name: str,
    limit: int,
    violations: Queue[tuple[str, int]],
) -> None:
    try:
        while True:
            chunk = stream.read(65536)
            if not chunk:
                return
            remaining = limit - len(target)
            if len(chunk) > remaining:
                if remaining > 0:
                    target.extend(chunk[:remaining])
                violations.put((name, limit))
                _terminate(process)
                return
            target.extend(chunk)
    finally:
        stream.close()


def _write_input(stream, input_bytes: bytes) -> None:
    try:
        stream.write(input_bytes)
        stream.flush()
    except (BrokenPipeError, OSError, ValueError):
        pass
    finally:
        try:
            stream.close()
        except (OSError, ValueError):
            pass


def _wait_bounded(
    process: subprocess.Popen,
    timeout_seconds: float,
    violations: Queue[tuple[str, int]],
) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while process.poll() is None:
        if not violations.empty():
            _terminate(process)
            break
        if time.monotonic() >= deadline:
            _terminate(process)
            process.wait()
            return True
        time.sleep(0.01)
    process.wait()
    return False


def _terminate(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.kill()


__all__ = [
    "BoundedProcessResult",
    "ProcessStreamLimitError",
    "ProcessTimeoutError",
    "run_bounded_process",
]
