"""Fail before Global Stop if a smoke leaves any real lifecycle callback reachable."""
from __future__ import annotations

import ast
import inspect
import textwrap


def snapshot_global_stops(control):
    source = ast.parse(textwrap.dedent(inspect.getsource(control._stop_everything)))
    originals = {}
    for node in ast.walk(source):
        if not isinstance(node, ast.Attribute) or node.attr != "stop_server":
            continue
        if not isinstance(node.value, ast.Name):
            raise AssertionError("Global Stop uses an unsupported lifecycle target; update smoke isolation")
        name = node.value.id
        originals[name] = getattr(control, name).stop_server
    if not originals:
        raise AssertionError("Global Stop exposes no verifiable lifecycle targets; update smoke isolation")
    return originals


def assert_global_stops_stubbed(control, originals):
    unmocked = sorted(name for name, callback in originals.items()
                      if getattr(control, name).stop_server is callback)
    if unmocked:
        raise AssertionError("Global Stop would call real lifecycle functions: " + ", ".join(unmocked))
