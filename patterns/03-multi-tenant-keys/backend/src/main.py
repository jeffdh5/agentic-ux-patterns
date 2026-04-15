import os
import json
from typing import Annotated
import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google.cloud import secretmanager
from genkit import Genkit, ActionRunContext
from genkit.plugins.google_genai import GoogleAI

GCP_PROJECT_ID = os.environ["GCP_PROJECT_ID"]
firebase_admin.initialize_app()
security = HTTPBearer()
sm_client = secretmanager.SecretManagerServiceClient()
ai = Genkit(plugins=[GoogleAI()], model="googleai/gemini-2.0-flash")
app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:3000"],
    allow_methods=["POST", "GET"], allow_headers=["*"],
)

async def get_uid(creds: Annotated[HTTPAuthorizationCredentials, Depends(security)]) -> str:
    try:
        return firebase_auth.verify_id_token(creds.credentials)["uid"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

def fetch_key(uid: str) -> str:
    name = f"projects/{GCP_PROJECT_ID}/secrets/user-{uid}-gemini-key/versions/latest"
    try:
        return sm_client.access_secret_version(name=name).payload.data.decode()
    except Exception:
        raise HTTPException(status_code=404, detail="No API key found")

class KeyRequest(BaseModel):
    api_key: str

class ChatInput(BaseModel):
    message: str
    api_key: str

@app.post("/api/key")
async def save_key(body: KeyRequest, uid: Annotated[str, Depends(get_uid)]):
    secret_id = f"user-{uid}-gemini-key"
    parent = f"projects/{GCP_PROJECT_ID}"
    try:
        sm_client.create_secret(request={
            "parent": parent, "secret_id": secret_id,
            "secret": {"replication": {"automatic": {}}},
        })
    except Exception:
        pass
    sm_client.add_secret_version(request={
        "parent": f"{parent}/secrets/{secret_id}",
        "payload": {"data": body.api_key.encode()},
    })
    return {"status": "stored"}

@ai.flow()
async def chat_flow(input: ChatInput, ctx: ActionRunContext) -> str:
    sr = ai.generate_stream(prompt=input.message, config={"api_key": input.api_key})
    full = ""
    async for chunk in sr.stream:
        if chunk.text:
            ctx.send_chunk(chunk.text)
            full += chunk.text
    return full

@app.post("/flow/chat")
async def chat_endpoint(request: Request, uid: Annotated[str, Depends(get_uid)]):
    api_key = fetch_key(uid)
    body = await request.json()
    input_data = ChatInput(message=body["message"], api_key=api_key)
    async def sse_generator():
        async for chunk in chat_flow.stream(input_data):
            yield f'data: {json.dumps({"message": chunk})}\n\n'
    return StreamingResponse(sse_generator(), media_type="text/event-stream")
