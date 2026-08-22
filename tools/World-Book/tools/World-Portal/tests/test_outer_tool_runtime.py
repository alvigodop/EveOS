from __future__ import annotations

import tempfile
import unittest
import sys
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.outer_tool_runtime import (
    OrogenSyncRuntime, RuntimeRequestError, orogen_navigation_target,
)


COMMIT = "cc2662b4edd52231c4f65d8765f3ef12cd82d9b7"
PNG = b"\x89PNG\r\n\x1a\nworld-portal-test"


class OrogenSyncRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.runtime = OrogenSyncRuntime(Path(self.temporary.name))

    def tearDown(self):
        self.temporary.cleanup()

    def store(self, world_key="world-a", revision=10, sync_token="sync-token-a", handoff_id="handoff-a"):
        return self.runtime.store(
            world_key=world_key,
            world_name="World A",
            revision=revision,
            sync_token=sync_token,
            handoff_id=handoff_id,
            tool_id="orogen",
            source_commit=COMMIT,
            data=PNG,
        )

    def referer(self, **overrides):
        query = {
            "wpWorldKey": "world-a",
            "wpSyncRevision": 10,
            "wpSyncToken": "sync-token-a",
            "wpHandoffId": "handoff-a",
            "wpToolId": "orogen",
            "wpSourceCommit": COMMIT,
            **overrides,
        }
        return f"http://127.0.0.1:8770/outer/orogen/import.html?{urlencode(query)}"

    def test_asset_resolution_requires_exact_world_revision_token_tool_and_live_commit(self):
        self.store()
        resolved = self.runtime.resolve_heightmap(self.referer(), COMMIT)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.read_bytes(), PNG)
        self.assertIsNone(self.runtime.resolve_heightmap(self.referer(wpWorldKey="world-b"), COMMIT))
        self.assertIsNone(self.runtime.resolve_heightmap(self.referer(wpSyncRevision=11), COMMIT))
        self.assertIsNone(self.runtime.resolve_heightmap(self.referer(wpSyncToken="sync-token-b"), COMMIT))
        self.assertIsNone(self.runtime.resolve_heightmap(self.referer(wpHandoffId="handoff-b"), COMMIT))
        self.assertIsNone(self.runtime.resolve_heightmap(self.referer(wpToolId="other-tool"), COMMIT))
        self.assertIsNone(self.runtime.resolve_heightmap(self.referer(), "a" * 40))

    def test_stale_revision_and_wrong_operation_token_are_rejected(self):
        self.store(revision=20)
        self.assertTrue(self.store(revision=20)["syncing"])
        with self.assertRaises(RuntimeRequestError) as stale:
            self.store(revision=19, sync_token="sync-token-b", handoff_id="handoff-b")
        self.assertEqual(stale.exception.status, 409)
        with self.assertRaises(RuntimeRequestError) as collision:
            self.store(revision=20, sync_token="sync-token-b", handoff_id="handoff-b")
        self.assertEqual(collision.exception.status, 409)

    def test_native_import_redirect_preserves_only_a_valid_exact_origin_context(self):
        self.store()
        location = self.runtime.redirect_location(
            "/outer/orogen/import.html", self.referer(), COMMIT, "127.0.0.1:8770"
        )
        self.assertIn("wpWorldKey=world-a", location)
        self.assertIn("wpSourceCommit=" + COMMIT, location)
        stripped = self.runtime.redirect_location(
            "/outer/orogen/import.html", self.referer(), COMMIT, "localhost:8770"
        )
        self.assertEqual(stripped, "/outer/orogen/import.html")

    def test_native_tabs_only_redirect_from_the_same_host_mounted_tool(self):
        referer = self.referer()
        self.assertEqual(
            orogen_navigation_target("/", referer, "127.0.0.1:8770"),
            "/outer/orogen/index.html",
        )
        self.assertEqual(
            orogen_navigation_target("/import", referer, "127.0.0.1:8770"),
            "/outer/orogen/import.html",
        )
        self.assertIsNone(orogen_navigation_target("/", referer, "localhost:8770"))
        self.assertIsNone(orogen_navigation_target("/", None, "127.0.0.1:8770"))
        self.assertIsNone(orogen_navigation_target("/other", referer, "127.0.0.1:8770"))

    def test_disable_is_world_keyed_and_compare_and_clear_protected(self):
        self.store()
        self.store("world-b", 12, "sync-token-b", "handoff-b")
        with self.assertRaises(RuntimeRequestError):
            self.runtime.clear("world-a")
        with self.assertRaises(RuntimeRequestError):
            self.runtime.clear("world-a", "sync-token-b")
        self.runtime.clear("world-a", "sync-token-a")
        self.assertFalse(self.runtime.status("world-a")["syncing"])
        self.assertTrue(self.runtime.status("world-b")["syncing"])

    def test_literal_percent_encoded_world_key_is_decoded_exactly_once(self):
        self.store(world_key="world%252farchive")
        query = {
            "wpWorldKey": "world%2farchive",
            "wpSyncRevision": 10,
            "wpSyncToken": "sync-token-a",
            "wpHandoffId": "handoff-a",
            "wpToolId": "orogen",
            "wpSourceCommit": COMMIT,
        }
        referer = f"http://127.0.0.1:8770/outer/orogen/import.html?{urlencode(query)}"
        self.assertIsNotNone(self.runtime.resolve_heightmap(referer, COMMIT))
        self.runtime.clear("world%2farchive", "sync-token-a")
        self.assertFalse(self.runtime.status("world%2farchive")["syncing"])


if __name__ == "__main__":
    unittest.main()
