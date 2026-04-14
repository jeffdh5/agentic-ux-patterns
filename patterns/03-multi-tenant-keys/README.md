# Pattern 03: Multi-Tenant BYOK with GCIP + Secret Manager

**Scenario:** You're building **LeadFlow**, an agentic lead-generation SaaS that helps B2B companies qualify prospects using AI. Your users are privacy-conscious—they want their Gemini API usage billed directly to their own Google Cloud accounts, not yours. They also want the flexibility to choose between `gemini-2.0-flash` (fast, cheap) and `gemini-1.5-pro` (deeper reasoning) depending on the complexity of their campaigns.

This pattern demonstrates **passwordless authentication** (GCIP magic links), **secure BYOK storage** (GCP Secret Manager), and **per-request API key override** with Genkit.

## Architecture

```
┌─────────────┐
│  User email │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ GCIP Magic Link (free up to 49,999 MAU)     │
└──────┬───────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Firebase JWT (verified on every request)    │
└──────┬───────────────────────────────────────┘
       │
       ├─► POST /api/key
       │   └─► Secret Manager: user-{uid}-gemini-key
       │       (encrypted at rest, audit logged)
       │
       └─► POST /flow/chat
           └─► fetch key → Genkit config={"api_key": key}
               └─► stream response
```

## Why This Way

1. **No password fatigue**: Magic links eliminate password reset flows and credential databases.
2. **Zero credential exposure**: API keys never touch your app database—Secret Manager encrypts at rest and provides audit logs.
3. **User control**: Each user brings their own Gemini API key; billing goes to their Google Cloud account.
4. **Per-user rate limits**: Google enforces quotas per key, naturally isolating tenants.
5. **Extensible**: Store model preference in Firestore (see "Extend this" below).

## The Pattern

### Store Key (Backend)

```python
from google.cloud import secretmanager

def store_api_key(uid: str, api_key: str):
    secret_name = f"projects/{GCP_PROJECT_ID}/secrets/user-{uid}-gemini-key"

    # Create secret if doesn't exist
    try:
        secret_client.get_secret(name=secret_name)
    except Exception:
        secret_client.create_secret(
            request={
                "parent": f"projects/{GCP_PROJECT_ID}",
                "secret_id": f"user-{uid}-gemini-key",
                "secret": {"replication": {"automatic": {}}},
            }
        )

    # Add new version
    secret_client.add_secret_version(
        request={
            "parent": secret_name,
            "payload": {"data": api_key.encode("utf-8")},
        }
    )
```

### Chat Endpoint (Backend)

```python
@app.post("/flow/chat")
async def chat(request: ChatRequest, uid: str = Depends(verify_firebase_token)):
    # 1. Fetch user's key from Secret Manager
    api_key = fetch_api_key(uid)

    # 2. Stream with per-request key override
    async def generate():
        full_text = ""
        stream = ai.generate_stream(request.message, config={"api_key": api_key})
        for chunk in stream:
            chunk_text = chunk.text
            full_text += chunk_text
            yield f'data: {{"message": "{chunk_text}"}}\n\n'
        yield f'data: {{"result": "{full_text}"}}\n\n'

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### Frontend Flow

```typescript
// 1. Send magic link
await sendMagicLink(email);

// 2. User clicks link in email
handleMagicLinkCallback(); // → sets user state

// 3. Save API key
await fetch("/api/key", {
  method: "POST",
  headers: { Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ api_key }),
});

// 4. Chat with streaming
const res = await fetch("/flow/chat", {
  method: "POST",
  headers: { Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ message }),
});
```

## GCP Setup

### 1. Enable APIs

```bash
gcloud services enable \
  identitytoolkit.googleapis.com \
  secretmanager.googleapis.com
```

### 2. IAM Roles

Your backend's **service account** (Application Default Credentials) needs:

- **Secret Manager Admin** (`roles/secretmanager.admin`) — to create/write user secrets
- **Secret Manager Secret Accessor** (`roles/secretmanager.secretAccessor`) — to read user secrets

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## GCIP Setup

### 1. Enable GCIP in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to **Authentication** → **Sign-in method**
4. Enable **Email/Password** provider
5. Under **Email/Password**, enable **Email link (passwordless sign-in)**

### 2. Authorized Domains

Add your frontend domain (e.g., `localhost`, `yourdomain.com`) to **Authorized domains** in the Firebase Console under Authentication → Settings.

### 3. Environment Variables (Frontend)

Create `.env.local` in `frontend/`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 4. Environment Variables (Backend)

```bash
export GCP_PROJECT_ID=your-project
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

## Pricing

- **GCIP**: Free up to **49,999 MAU** (Monthly Active Users). See [Firebase Pricing](https://firebase.google.com/pricing).
- **Secret Manager**:
  - **Active secret versions**: $0.06 per secret per month (1 secret per user)
  - **Access operations**: $0.03 per 10,000 operations
  - **Free tier**: 3 active secrets, 10,000 access operations/month
- **Gemini API**: Billed to **user's Google Cloud account**, not yours.

## Extend This

### Model Selection per User

Store user preferences in **Firestore**:

```python
# Backend: fetch model + key from Firestore + Secret Manager
from firebase_admin import firestore

db = firestore.client()
user_doc = db.collection("users").document(uid).get()
model = user_doc.get("model") or "googleai/gemini-2.0-flash"
api_key = fetch_api_key(uid)

stream = ai.generate_stream(
    request.message,
    model=model,
    config={"api_key": api_key}
)
```

**Frontend**: Add dropdown in settings card:

```tsx
<Select value={model} onValueChange={setModel}>
  <SelectItem value="googleai/gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
  <SelectItem value="googleai/gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
</Select>
```

### Audit Logging

Enable **Secret Manager audit logs** in Cloud Logging to track key access:

```bash
gcloud logging read "protoPayload.serviceName=secretmanager.googleapis.com" --limit 50
```

### Key Rotation

Add a `/api/key/rotate` endpoint that creates a new secret version and invalidates the old one.

## Point Your Agent Prompt

If you're building an agent-based LeadFlow system, here's a sample **system prompt**:

```
You are LeadFlow, an AI lead qualification assistant. Analyze prospect data and:
1. Score lead quality (A/B/C/D)
2. Extract key pain points from conversation transcripts
3. Suggest personalized outreach angles
4. Flag red flags (budget mismatch, wrong industry, etc.)

Format output as JSON:
{
  "score": "A",
  "pain_points": ["scaling challenges", "manual data entry"],
  "outreach_angle": "Emphasize automation ROI",
  "red_flags": []
}
```

## Running the App

### Backend

```bash
cd backend
uv venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv pip install -e .
export GCP_PROJECT_ID=your-project
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
uvicorn src.main:app --host 0.0.0.0 --port 3400
```

### Frontend

```bash
cd frontend
npm install
# Create .env.local with NEXT_PUBLIC_FIREBASE_* vars
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## What's Next

- **Pattern 04**: Multi-agent orchestration with Genkit flows (lead research → qualification → outreach drafting)
- **Pattern 05**: RAG with Firestore vector search (company knowledge base for personalized outreach)

---

**Why GCIP over Auth0/Clerk?** GCIP is free up to 50k users, natively integrated with Firebase (Firestore, Cloud Functions), and your JWT validation logic is 3 lines of Python. For startups, that's hard to beat.
