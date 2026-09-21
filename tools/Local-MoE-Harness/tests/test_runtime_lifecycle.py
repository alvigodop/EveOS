import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.model_registry import ModelRegistry
from app.services.runtime_lifecycle import RuntimeLifecycle


class RuntimeLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.registry = ModelRegistry(ROOT)
        self.lifecycle = RuntimeLifecycle(
            ROOT,
            "http://127.0.0.1:1919",
            settings={"gpu_coexistence_busy_start_enter_util_pct": 30},
            registry=self.registry,
        )

    @staticmethod
    def _model_argument(args):
        if "-ModelPath" in args:
            return args[args.index("-ModelPath") + 1]
        return args[2]

    def test_qwen_environment_preserves_validated_normal_geometry(self):
        record = self.registry.require("qwen36-nvfp4")
        with patch.dict(os.environ, {"LOCAL_MOE_MOE_CACHE_SIZE": "999"}):
            environment = self.lifecycle._profile_environment(record, "normal")
        self.assertEqual(environment["LOCAL_MOE_KV_RESERVE_TOKENS"], "12288")
        self.assertEqual(environment["LOCAL_MOE_MAX_PREFILL_LENGTH"], "2048")
        self.assertEqual(environment["LOCAL_MOE_PREFILL_HIT_D2D"], "1")
        self.assertEqual(environment["LOCAL_MOE_MEMORY_RATIO"], "0.92")
        self.assertEqual(environment["LOCAL_MOE_CUDA_GRAPH_MAX_BS"], "1")
        self.assertEqual(environment["LOCAL_MOE_NORMAL_MOE_SLOTS"], "569")
        self.assertNotIn("LOCAL_MOE_MOE_CACHE_SIZE", environment)

    def test_alternate_profile_uses_its_own_geometry(self):
        record = self.registry.require("gpt-oss-20b")
        normal = self.lifecycle._profile_environment(record, "normal")
        environment = self.lifecycle._profile_environment(record, "recovery")
        self.assertEqual(normal["LOCAL_MOE_KV_RESERVE_TOKENS"], "1024")
        self.assertEqual(normal["LOCAL_MOE_MAX_PREFILL_LENGTH"], "256")
        self.assertEqual(normal["LOCAL_MOE_MEMORY_RATIO"], "0.99")
        self.assertEqual(environment["LOCAL_MOE_KV_RESERVE_TOKENS"], "1024")
        self.assertEqual(environment["LOCAL_MOE_MAX_PREFILL_LENGTH"], "256")
        self.assertEqual(environment["LOCAL_MOE_MEMORY_RATIO"], "0.99")
        self.assertEqual(environment["LOCAL_MOE_CUDA_GRAPH_MAX_BS"], "0")
        self.assertNotIn("LOCAL_MOE_NORMAL_MOE_SLOTS", environment)

    def test_graph_recovery_is_model_specific(self):
        self.lifecycle.active_model_id = "qwen36-nvfp4"
        self.assertTrue(self.lifecycle.normal_profile_uses_graph())
        self.lifecycle.active_model_id = "gpt-oss-20b"
        self.assertFalse(self.lifecycle.normal_profile_uses_graph())

    def test_process_args_use_approved_single_file_entrypoint(self):
        record = self.registry.require("gemma4-26b-q4_0-gguf")
        args = self.lifecycle._process_args(record)
        self.assertEqual(
            self._model_argument(args),
            str(record.local_path / record.data["serve_file"]),
        )

    def test_process_args_keep_directory_models_unchanged(self):
        record = self.registry.require("qwen36-nvfp4")
        args = self.lifecycle._process_args(record)
        self.assertEqual(self._model_argument(args), str(record.local_path))

    def test_bonsai_uses_prism_backend_and_profile_offload(self):
        record = self.registry.require("bonsai2-27b-ptq1")
        args = self.lifecycle._process_args(record)
        environment = self.lifecycle._profile_environment(record, "normal")
        self.assertIn("run-prism-llama-windows.ps1", " ".join(args))
        self.assertEqual(self._model_argument(args), str(record.runtime_path))
        self.assertEqual(args[args.index("-ServedModelName") + 1], record.served_model_name)
        self.assertEqual(environment["LOCAL_MOE_GPU_LAYERS"], "56")
        self.lifecycle.active_model_id = record.id
        self.assertEqual(self.lifecycle.active_runtime_backend(), "prism-llama")
        self.assertFalse(self.lifecycle.supports_dynamic_cache())

    def test_windows_runtime_headed_default_is_explicit(self):
        if os.name != "nt":
            self.skipTest("Windows-only console policy")
        self.assertFalse(self.lifecycle._headless_requested({}))
        self.assertFalse(self.lifecycle._headless_requested({"EVEOS_HEADLESS": ""}))
        self.assertTrue(self.lifecycle._headless_requested({"EVEOS_HEADLESS": "1"}))
        self.assertTrue(self.lifecycle._headless_requested({"LOCAL_MOE_HEADLESS": "true"}))

    async def test_fast8k_launcher_request_maps_to_busy_qwen_profile(self):
        record = self.registry.require("qwen36-nvfp4")
        self.lifecycle.preflight_gpu_check = AsyncMock(return_value=(False, {}))
        with patch.dict(os.environ, {"LOCAL_MOE_CONTEXT_PROFILE": "fast8k"}, clear=False):
            name, _sample = await self.lifecycle._select_profile_name(record)
        self.assertEqual(name, "busy")


if __name__ == "__main__":
    stream = io.StringIO()
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(stream=stream, verbosity=1).run(suite)
    if result.wasSuccessful():
        print(f"[Runtime Lifecycle Tests] PASS ({result.testsRun}/{result.testsRun})")
        raise SystemExit(0)
    print("\n".join(stream.getvalue().splitlines()[-40:]), file=sys.stderr)
    raise SystemExit(1)
