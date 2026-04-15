import os
import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.cloud import secretmanager
from genkit import Genkit, ActionRunContext
from genkit.plugins.fastapi import genkit_fastapi_handler
from genkit.plugins.google_genai import GoogleAI
from genkit.plugin_api import RequestData

GCP_PROJECT_ID = os.environ["GCP_PROJECT_ID"]
firebase_admin.initialize_app()
sm_client = secretmanager.SecretManagerServiceClient()
ai = Genkit(plugins=[GoogleAI()], model="googleai/gemini-2.0-flash")
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["POST", "GET"], allow_headers=["*"])

def fetch_key(uid: str) -> str:
    name = f"projects/{GCP_PROJECT_ID}/secrets/user-{uid}-gemini-key/versions/latest"
    try:
        return sm_client.access_secret_version(name=name).payload.data.decode()
    except Exception:
        raise HTTPException(status_code=404, detail="No API key found. Add your key in settings.")

async def auth_provider(req: RequestData) -> dict:
    """Verify Firebase JWT and inject api_key from Secret Manager into flow context."""
    try:
        token = req.headers.get("authorization", "").replace("Bearer ", "")
        uid = firebase_auth.verify_id_token(token)["uid"]
        return {"uid": uid, "api_key": fetch_key(uid)}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

class KeyRequest(BaseModel):
    api_key: str

class ChatInput(BaseModel):
    message: str

# /api/key still needs manual auth since it does not use genkit_fastapi_handler
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Annotated
security = HTTPBearer()

async def get_uid(creds: Annotated[HTTPAuthorizationCredentials, Depends(security)]) -> str:
    try:
        return firebase_auth.verify_id_token(creds.credentials)["uid"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/api/key")
async def save_key(body: KeyRequest, uid: Annotated[str, Depends(get_uid)]):
    secret_id = f"user-{uid}-gemini-key"
    parent = f"projects/{GCP_PROJECT_ID}"
    try:
        sm_client.create_secret(request={"parent": parent, "secret_id": secret_id, "secret": {"replication": {"automatic": {}}}})
    except Exception:
        pass
    sm_client.add_secret_version(request={"parent": f"{parent}/secrets/{secret_id}", "payload": {"data": body.api_key.encode()}})
    return {"status": "stored"}

@app.post("/flow/chat", response_model=None)
@genkit_fastapi_handler(ai, context_provider=auth_provider)
@ai.flow()
async def chat(input: ChatInput, ctx: ActionRunContext) -> str:
    api_key = ctx.context["api_key"]  # injected by auth_provider, never from client
    sr = ai.generate_stream(prompt=input.message, config={"api_key": api_key})
    full = ""
    async for chunk in sr.stream:
        if chunk.text:
            ctx.send_chunk(chunk.text)
            full += chunk.text
    return full
