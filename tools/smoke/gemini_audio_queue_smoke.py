"""Runtime checks for bounded, lossless Gemini Live audio queue behavior."""

import asyncio
import sys
from pathlib import Path

import websockets


ROOT = Path(__file__).resolve().parents[2]
INTERACTIONS = ROOT / "server" / "gemini-backend" / "interactions"
sys.path.insert(0, str(INTERACTIONS))

from main_server_files.audio_processing.audio_processor import (  # noqa: E402
    AUDIO_QUEUE_MAX_CHUNKS,
    AudioProcessor,
)


class FakeWebSocket:
    def __init__(self, fail_send=False):
        self.state = websockets.protocol.State.OPEN
        self.fail_send = fail_send
        self.messages = []

    async def send(self, message):
        if self.fail_send:
            raise RuntimeError("simulated browser send failure")
        self.messages.append(message)


async def verify_backpressure():
    processor = AudioProcessor(FakeWebSocket(), "queue-bound")
    processor.is_sequential = True
    for _ in range(AUDIO_QUEUE_MAX_CHUNKS):
        processor.audio_queue.put_nowait(b"a")

    blocked_put = asyncio.create_task(processor.process_audio_data(b"b"))
    await asyncio.sleep(0)
    assert not blocked_put.done(), "a full audio queue must backpressure its producer"

    processor.audio_queue.get_nowait()
    processor.audio_queue.task_done()
    await asyncio.wait_for(blocked_put, timeout=0.25)
    assert processor.audio_queue.qsize() == AUDIO_QUEUE_MAX_CHUNKS
    processor.reset()


async def verify_failed_send_releases_queue():
    processor = AudioProcessor(FakeWebSocket(fail_send=True), "failed-send")
    processor.is_sequential = True
    worker = asyncio.create_task(processor.process_audio_queue())
    await processor.audio_queue.put(b"audio")
    await asyncio.wait_for(processor.audio_queue.join(), timeout=0.5)
    worker.cancel()
    await asyncio.gather(worker, return_exceptions=True)
    assert processor.audio_queue.empty()


async def main():
    await verify_backpressure()
    await verify_failed_send_releases_queue()
    print("Gemini audio queue smoke passed")


if __name__ == "__main__":
    asyncio.run(main())
