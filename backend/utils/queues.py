from queue import Queue
import asyncio

class NotifyingQueue(Queue):
    def __init__(self, *args, on_put_callback=None, queue_name=None, event_loop=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.on_put_callback = on_put_callback
        self.queue_name = queue_name
        self.event_loop = event_loop

    def put(self, item, block=True, timeout=None):
        super().put(item, block, timeout)
        value = item[0] if isinstance(item, tuple) else item
        if self.on_put_callback and self.event_loop:
            asyncio.run_coroutine_threadsafe(
                self.on_put_callback(value, self.queue_name),
                self.event_loop
            )
