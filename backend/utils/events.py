import asyncio
from threading import Event

class NotifyingEvent(Event):
    def __init__(self, on_put_callback=None, event_loop=None):
        super().__init__()
        self.on_put_callback = on_put_callback
        self.event_loop = event_loop

    def _notify(self, status):
        if self.on_put_callback and self.event_loop:
            asyncio.run_coroutine_threadsafe(
                self.on_put_callback(status, "processing"),
                self.event_loop
            )

    def set(self):
        super().set()
        self._notify("True")

    def clear(self):
        super().clear()
        self._notify("False")
