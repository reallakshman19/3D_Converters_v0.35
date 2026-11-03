from __future__ import annotations

from typing import Any

from .base import *
from .xml import *
from .extension import *
from .counts import _new_root
from .pdf_input_echo_runtime import compile_pdf_input_echo_source

SUPPORTED_COMPILER_DIALECTS.add("pdf-input-echo")


def _compile_pdf_input_echo_source(
    source: bytes,
    *,
    source_name: str,
    ledger: DecisionLedger,
    context: dict[str, Any],
) -> ET._Element:
    return compile_pdf_input_echo_source(
        source,
        source_name=source_name,
        ledger=ledger,
        context=context,
        root_factory=_new_root,
    )


__all__ = [name for name in globals() if not name.startswith("__")]
