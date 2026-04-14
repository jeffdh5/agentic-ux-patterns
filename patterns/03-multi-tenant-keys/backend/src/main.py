import os
from typing import Annotated
from contextlib import asynccontextmanager

import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google.cloud import secretmanager
from genkit import Genkit
from genkit.google_genai import GoogleAI

GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID")
if not GCP_PROJECT_ID:
    raise RuntimeError("GCP_PROJECT_ID environment variable required")

firebase_admin.initialize_app()
security = HTTPBearer()
secret_client = secretmanager.SecretManagerServiceClient()

ai = Genkit(plugins=[GoogleAI()], model="googleai/gemini-2.0-flash")


async def verify_firebase_token(credentials: Annotated[HTTPAuthCredentials, Depends(security)]) -> str:
    """Verify Firebase JWT and return uid"""
    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        return decoded["uid"]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication: {e}",
        )


def get_secret_name(uid: str) -> str:
    return f"projects/{GCP_PROJECT_ID}/secrets/user-{uid}-gemini-key"


def store_api_key(uid: str, api_key: str):
    """Store user API key in Secret Manager"""
    secret_name = get_secret_name(uid)
    parent = f"projects/{GCP_PROJECT_ID}"

    try:
        secret_client.get_secret(name=secret_name)
    except Exception:
        secret_client.create_secret(
            request={
                "parent": parent,
                "secret_id": f"user-{uid}-gemini-key",
                "secret": {"replication": {"automatic": {}}},
            }
        )

    secret_client.add_secret_version(
        request={
            "parent": secret_name,
            "payload": {"data": api_key.encode("utf-8")},
        }
    )


def fetch_api_key(uid: str) -> str:
    """Fetch user API key from Secret Manager"""
    secret_name = f"{get_secret_name(uid)}/versions/latest"
    try:
        response = secret_client.access_secret_version(name=secret_name)
        return response.payload.data.decode("utf-8")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API key not found for user: {e}",
        )


class KeyRequest(BaseModel):
    api_key: str


class ChatRequest(BaseModel):
    message: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)


@app.post("/api/key")
async def save_key(request: KeyRequest, uid: Annotated[str, Depends(verify_firebase_token)]):
    """Store user's Gemini API key in Secret Manager"""
    store_api_key(uid, request.api_key)
    return {"status": "ok"}


@app.post("/flow/chat")
async def chat(request: ChatRequest, uid: Annotated[str, Depends(verify_firebase_token)]):
    """Stream chat response using user's API key"""
    api_key = fetch_api_key(uid)

    async def generate():
        full_text = ""
        stream = ai.generate_stream(request.message, config={"api_key": api_key})
        for chunk in stream:
            chunk_text = chunk.text
            full_text += chunk_text
            yield f'data: {{"message": "{chunk_text}"}}\n\n'
        yield f'data: {{"result": "{full_text}"}}\n\n'

    return StreamingResponse(generate(), media_type="text/event-stream")
