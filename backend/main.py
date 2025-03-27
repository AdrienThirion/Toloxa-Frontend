import asyncio
import websockets
from utils.signaling import signaling_handler

async def main():
    async with websockets.serve(signaling_handler, "0.0.0.0", 8000):
        print("Server listening on port 8000...")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
