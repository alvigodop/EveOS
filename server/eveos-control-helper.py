#!/usr/bin/env python3
"""Entrypoint for the EveOS local control plane."""

from __future__ import annotations

import os
import sys


SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SERVER_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server_modules.eveos_ports import PortRegistryError, assert_unique_effective_ports  # noqa: E402

try:
    assert_unique_effective_ports()
except PortRegistryError as exc:
    print(f"[ERROR] {exc}", file=sys.stderr)
    raise SystemExit(2)

if __name__ == "__main__":
    from server_modules.eveos_control_probe import parse_args, wait_for_control

    args = parse_args()
    if args.probe:
        raise SystemExit(wait_for_control(args.port, args.timeout))

    from server_modules.eveos_control_helper import main

    raise SystemExit(main(args))
