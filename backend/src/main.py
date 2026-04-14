"""Genkit Python + FastAPI streaming starter."""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from genkit import Genkit, ActionRunContext
from genkit.plugins.fastapi import genkit_fastapi_handler
from genkit.plugins.google_genai import GoogleAI

ai = Genkit(plugins=[GoogleAI()], model='googleai/gemini-2.0-flash')
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_methods=['POST'],
    allow_headers=['*'],
)


class ChatInput(BaseModel):
    question: str


@app.post('/flow/chat', response_model=None)
@genkit_fastapi_handler(ai)
@ai.flow()
async def chat(input: ChatInput, ctx: ActionRunContext) -> str:
    """Answer a question, streaming tokens as they arrive."""
    sr = ai.generate_stream(prompt=input.question)
    full = ''
    async for chunk in sr.stream:
        if chunk.text:
            ctx.send_chunk(chunk.text)
            full += chunk.text
    return full


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8080)
