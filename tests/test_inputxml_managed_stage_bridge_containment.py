import subprocess
import sys
import time
import unittest

from scripts.inputxml_compiler.managed_stage_process import (
    ProcessStreamLimitError,
    ProcessTimeoutError,
    run_bounded_process,
)


class ManagedStageBridgeContainmentTests(unittest.TestCase):
    def test_stdout_limit_terminates_child_during_execution(self):
        started = time.monotonic()
        with self.assertRaises(ProcessStreamLimitError) as captured:
            run_bounded_process(
                [sys.executable, "-c", "import sys,time;sys.stdout.buffer.write(b'x'*1048576);sys.stdout.flush();time.sleep(10)"],
                input_bytes=b"",
                timeout_seconds=5,
                stdout_limit=1024,
                stderr_limit=1024,
            )
        self.assertEqual("stdout", captured.exception.stream_name)
        self.assertLess(time.monotonic() - started, 5)

    def test_stderr_limit_terminates_child_during_execution(self):
        started = time.monotonic()
        with self.assertRaises(ProcessStreamLimitError) as captured:
            run_bounded_process(
                [sys.executable, "-c", "import sys,time;sys.stderr.buffer.write(b'x'*1048576);sys.stderr.flush();time.sleep(10)"],
                input_bytes=b"",
                timeout_seconds=5,
                stdout_limit=1024,
                stderr_limit=1024,
            )
        self.assertEqual("stderr", captured.exception.stream_name)
        self.assertLess(time.monotonic() - started, 5)

    def test_timeout_terminates_silent_child(self):
        with self.assertRaises(ProcessTimeoutError):
            run_bounded_process(
                [sys.executable, "-c", "import time;time.sleep(10)"],
                input_bytes=b"",
                timeout_seconds=0.1,
                stdout_limit=1024,
                stderr_limit=1024,
            )

    def test_success_preserves_bounded_streams(self):
        result = run_bounded_process(
            [sys.executable, "-c", "import sys;sys.stdout.write('ok');sys.stderr.write('note')"],
            input_bytes=b"",
            timeout_seconds=5,
            stdout_limit=1024,
            stderr_limit=1024,
        )
        self.assertEqual(0, result.returncode)
        self.assertEqual(b"ok", result.stdout)
        self.assertEqual(b"note", result.stderr)


if __name__ == "__main__":
    unittest.main()
