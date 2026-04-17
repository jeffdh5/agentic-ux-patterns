"""Streaming Progress backend — real Genkit agentic flow with structured error UX.

Every subflow is backed by a real Gemini call. Failures are first-class in the
chunk taxonomy so the frontend can render graceful-degradation UX instead of
blank screens.

Error model
-----------

Each step is classified as:

    fatal       — the pipeline cannot continue. Emit `flow_error` and stop.
                  Today: search_leads.

    degraded    — the step failed but downstream can continue with a fallback.
                  Emit a `notice` and a structured error on the tool_result.
                  Today: score_leads (fall back to seed order),
                         enrich_profiles if all 3 fail (fall back to snippets).

    partial     — some of a fan-out failed but enough succeeded. Emit error on
                  the failing tool_results; continue with survivors.
                  Today: one or two of three enrich_company calls.

    mid-stream  — artifact streaming starts, then fails. Keep what was already
                  streamed and emit an error note on the artifact.
                  Today: draft_outreach.

Debug affordance
----------------

Prefix the target with `fail:<step>:` to force a deterministic failure at that
step. e.g. `fail:score: climate tech Series A` will simulate a scoring outage
and exercise the degraded-mode UX without needing a real outage.

Structured error shape
----------------------

    {
        "code": "parse_failure" | "upstream_error" | "no_results" | ...,
        "message": "human-readable one-line explanation",
        "severity": "error" | "warning" | "fatal",
        "recoverable": bool,
        "hint": "optional user-facing suggestion"
    }
"""

import asyncio
import json
import re
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, TypeAdapter

from genkit import Genkit
from genkit._core._typing import ReasoningPart
from genkit.plugins.google_genai import GoogleAI

MODEL = "googleai/gemini-2.5-flash"

ai = Genkit(plugins=[GoogleAI()], model=MODEL)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Schemas ----------


class ResearchInput(BaseModel):
    target: str


class Company(BaseModel):
    name: str = Field(description="Official company name")
    url: str | None = Field(default=None, description="Primary website or LinkedIn URL")
    snippet: str = Field(description="One-sentence description of what they do")


class Enrichment(BaseModel):
    name: str
    headquarters: str | None = None
    employees: str | None = Field(default=None, description="Approximate headcount, e.g. '50-100' or '120'")
    stage: str | None = Field(default=None, description="Funding stage, e.g. 'Series A'")
    raised_usd: str | None = Field(default=None, description="Total funding raised, e.g. '$12M'")
    summary: str = Field(description="Two-sentence summary of what makes this company relevant")


class ScoredLead(BaseModel):
    name: str
    score: float = Field(description="ICP fit score between 0 and 1")
    reason: str = Field(description="One-sentence justification")


SCORED_LEAD_LIST_SCHEMA = TypeAdapter(list[ScoredLead]).json_schema()


# ---------- Error helpers ----------


class StepFailure(Exception):
    """Raised inside a step to signal a classified failure."""

    def __init__(self, code: str, message: str, hint: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint


def error_obj(
    code: str,
    message: str,
    *,
    severity: str = "error",
    recoverable: bool = True,
    hint: str | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "code": code,
        "message": message,
        "severity": severity,
        "recoverable": recoverable,
    }
    if hint:
        out["hint"] = hint
    return out


def sse(**kwargs: Any) -> str:
    return f"data: {json.dumps(kwargs)}\n\n"


def extract_json_block(text: str) -> Any | None:
    """Pull the first JSON array/object out of a model response.

    Grounded Gemini calls can't use response_mime_type=json, so we ask for
    fenced JSON in the prompt and parse it out here.
    """
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass
    bracket = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
    if bracket:
        try:
            return json.loads(bracket.group(1))
        except json.JSONDecodeError:
            return None
    return None


def parse_fail_trigger(target: str) -> tuple[str, str | None]:
    """Split an optional `fail:<step>:` prefix off the target.

    Used to force failures deterministically for demo/testing. Returns
    (real_target, fail_step_or_none).
    """
    m = re.match(r"fail:([a-z_]+):\s*(.*)", target, re.IGNORECASE)
    if not m:
        return target, None
    return m.group(2).strip() or "startups", m.group(1).lower()


# ---------- Real steps ----------


async def stream_reasoning(target: str) -> AsyncGenerator[str, None]:
    prompt = (
        f"You are a sales research agent. The user asked for: {target!r}. "
        "Briefly plan how you'll identify the top 3 companies, enrich them with "
        "firmographics, score them against a B2B SaaS ICP, and draft personalized "
        "cold outreach. Keep the plan to 3–4 sentences."
    )
    sr = ai.generate_stream(
        prompt=prompt,
        config={"thinking_config": {"include_thoughts": True, "thinking_budget": 1024}},
    )
    emitted_any = False
    start = asyncio.get_event_loop().time()
    async for chunk in sr.stream:
        for part in chunk.content:
            root = part.root
            if isinstance(root, ReasoningPart) and root.reasoning:
                emitted_any = True
                yield sse(type="reasoning", content=root.reasoning, mode="append")
    if not emitted_any:
        resp = await sr.response
        if resp.text:
            yield sse(type="reasoning", content=resp.text, mode="append")
    duration = round(asyncio.get_event_loop().time() - start, 1)
    yield sse(type="reasoning", status="done", duration=duration)


async def search_leads(target: str, fail_step: str | None) -> list[Company]:
    if fail_step == "search":
        raise StepFailure(
            code="forced_failure",
            message="Search was asked to fail for demo purposes.",
            hint="Remove the 'fail:search:' prefix to run the real search.",
        )
    prompt = (
        f"Use Google Search to find 5 real companies that match: {target}. "
        "Return ONLY a fenced JSON array like:\n"
        "```json\n"
        '[{"name": "...", "url": "https://...", "snippet": "..."}]\n'
        "```\n"
        "Prefer companies with a public website. One-sentence snippets. No commentary."
    )
    resp = await ai.generate(prompt=prompt, config={"google_search_retrieval": True})
    data = extract_json_block(resp.text or "")
    if not isinstance(data, list):
        raise StepFailure(
            code="parse_failure",
            message="The model did not return a parseable JSON array of companies.",
            hint="Try a more specific target, or run again — this is non-deterministic.",
        )
    companies: list[Company] = []
    for item in data[:5]:
        try:
            companies.append(Company.model_validate(item))
        except Exception:
            continue
    if not companies:
        raise StepFailure(
            code="no_results",
            message="Search returned no companies that could be validated.",
            hint="Try a different or broader target description.",
        )
    return companies


async def enrich_company(name: str, fail_step: str | None, index: int) -> Enrichment:
    # Fail the first parallel call only, so we can show partial-failure UX.
    if fail_step == "enrich_one" and index == 0:
        await asyncio.sleep(0.4)
        raise StepFailure(
            code="forced_failure",
            message=f"Enrichment of {name!r} was asked to fail for demo purposes.",
        )
    if fail_step == "enrich_all":
        await asyncio.sleep(0.3)
        raise StepFailure(
            code="forced_failure",
            message=f"Enrichment of {name!r} was asked to fail for demo purposes.",
        )
    prompt = (
        f"Use Google Search to look up the company named {name!r} and return ONLY "
        "a fenced JSON object matching this shape:\n"
        "```json\n"
        '{"name": "...", "headquarters": "City, Country", "employees": "~N or range", '
        '"stage": "Seed|Series A|...", "raised_usd": "$X", "summary": "two sentences"}\n'
        "```\n"
        "If a field is unknown, use null. No commentary outside the fence."
    )
    resp = await ai.generate(prompt=prompt, config={"google_search_retrieval": True})
    data = extract_json_block(resp.text or "")
    if isinstance(data, dict):
        data.setdefault("name", name)
        try:
            return Enrichment.model_validate(data)
        except Exception as e:
            raise StepFailure(
                code="parse_failure",
                message=f"Enrichment response for {name!r} didn't match the expected shape.",
                hint=str(e)[:180],
            )
    raise StepFailure(
        code="parse_failure",
        message=f"Enrichment response for {name!r} was not parseable JSON.",
    )


async def score_leads(
    target: str, enriched: list[Enrichment], fail_step: str | None
) -> list[ScoredLead]:
    if fail_step == "score":
        raise StepFailure(
            code="forced_failure",
            message="Scoring was asked to fail for demo purposes.",
            hint="Drafts below are shown in seed order instead of ranked.",
        )
    context = json.dumps([e.model_dump() for e in enriched], indent=2)
    resp = await ai.generate(
        prompt=(
            f"Score these companies as leads for the search {target!r}. "
            "Judge fit on a B2B SaaS ICP: relevant category, reasonable stage "
            "(Seed–Series B), signs of traction.\n\n"
            f"Companies:\n{context}\n\n"
            "Return a ranked array best-first."
        ),
        output_format="array",
        output_schema=SCORED_LEAD_LIST_SCHEMA,
    )
    output = resp.output
    if not isinstance(output, list) or not output:
        raise StepFailure(
            code="parse_failure",
            message="Scoring returned an empty or malformed result.",
            hint="The drafts below use seed order instead.",
        )
    return [ScoredLead.model_validate(x) for x in output]


# ---------- Flow ----------


@app.post("/flow/research")
async def research(body: ResearchInput):
    raw_target = body.target.strip()
    target, fail_step = parse_fail_trigger(raw_target)

    async def run() -> AsyncGenerator[str, None]:
        # ---------- 1. Reasoning ----------
        try:
            async for ev in stream_reasoning(target):
                yield ev
        except Exception as exc:
            # Reasoning is informational — failing it is never fatal.
            yield sse(
                type="reasoning",
                content=f"(reasoning unavailable: {exc})",
                mode="append",
            )
            yield sse(type="reasoning", status="done", duration=0)

        # ---------- 2. search_leads (FATAL on failure) ----------
        yield sse(type="subflow", name="search_leads", status="started", label="Searching for leads")
        yield sse(
            type="tool_call",
            id="tc-search",
            tool="web_search",
            input={"query": target, "source": "google_search (Gemini grounded)"},
        )
        try:
            companies = await search_leads(target, fail_step)
        except StepFailure as exc:
            err = error_obj(
                exc.code,
                exc.message,
                severity="fatal",
                recoverable=False,
                hint=exc.hint,
            )
            yield sse(type="tool_result", id="tc-search", tool="web_search", error=err)
            yield sse(
                type="subflow",
                name="search_leads",
                status="error",
                label="Search failed",
                error=err,
            )
            yield sse(
                type="flow_error",
                error=error_obj(
                    "search_failed",
                    "The flow can't continue without search results.",
                    severity="fatal",
                    recoverable=False,
                    hint=exc.hint or "Try a different target or check your connection.",
                ),
            )
            return
        except Exception as exc:
            err = error_obj(
                "internal_error",
                str(exc)[:240] or "Unknown error",
                severity="fatal",
                recoverable=False,
            )
            yield sse(type="tool_result", id="tc-search", tool="web_search", error=err)
            yield sse(
                type="subflow",
                name="search_leads",
                status="error",
                label="Search failed",
                error=err,
            )
            yield sse(type="flow_error", error=err)
            return

        yield sse(
            type="tool_result",
            id="tc-search",
            tool="web_search",
            preview=f"Found {len(companies)} companies",
            output={"companies": [c.model_dump() for c in companies]},
        )
        yield sse(
            type="subflow",
            name="search_leads",
            status="done",
            label=f"Found {len(companies)} companies",
        )

        top3 = companies[:3]

        # ---------- 3. enrich_profiles (PARTIAL or DEGRADED) ----------
        yield sse(
            type="subflow",
            name="enrich_profiles",
            status="started",
            label=f"Enriching top {len(top3)} in parallel",
        )
        for i, c in enumerate(top3):
            key = re.sub(r"[^a-z0-9]+", "_", c.name.lower()).strip("_")
            yield sse(
                type="subflow",
                name=f"enrich_{key}",
                parent="enrich_profiles",
                status="started",
                label=f"Enriching {c.name}",
            )
            yield sse(
                type="tool_call",
                id=f"tc-enrich-{i}",
                tool="enrich_company",
                input={"company": c.name, "url": c.url},
            )

        async def enrich_one(i: int, c: Company):
            try:
                return i, c, await enrich_company(c.name, fail_step, i)
            except StepFailure as e:
                return i, c, e
            except Exception as e:
                return i, c, StepFailure("internal_error", str(e)[:240] or "Unknown error")

        results = await asyncio.gather(*(enrich_one(i, c) for i, c in enumerate(top3)))

        enriched: list[Enrichment] = []
        failures: list[tuple[Company, StepFailure]] = []
        for i, c, out in results:
            key = re.sub(r"[^a-z0-9]+", "_", c.name.lower()).strip("_")
            if isinstance(out, StepFailure):
                failures.append((c, out))
                err = error_obj(out.code, out.message, severity="error", recoverable=True, hint=out.hint)
                yield sse(
                    type="tool_result",
                    id=f"tc-enrich-{i}",
                    tool="enrich_company",
                    error=err,
                )
                yield sse(
                    type="subflow",
                    name=f"enrich_{key}",
                    parent="enrich_profiles",
                    status="error",
                    label=f"{c.name} enrichment failed",
                    error=err,
                )
                continue
            enriched.append(out)
            yield sse(
                type="tool_result",
                id=f"tc-enrich-{i}",
                tool="enrich_company",
                preview=f"{out.name}: {out.employees or '?'} emp, {out.stage or '?'}",
                output=out.model_dump(),
            )
            yield sse(
                type="subflow",
                name=f"enrich_{key}",
                parent="enrich_profiles",
                status="done",
                label=f"{c.name} enriched",
            )

        # Decide how enrich_profiles wraps up.
        if not enriched:
            # All failed — degraded mode, fall back to raw snippets for drafting.
            notice_err = error_obj(
                "all_enrich_failed",
                "All enrichment lookups failed. Using raw search snippets for drafting.",
                severity="warning",
                recoverable=True,
                hint="Drafts will be less personalized than usual.",
            )
            yield sse(
                type="subflow",
                name="enrich_profiles",
                status="error",
                label="Enrichment failed for all leads",
                error=notice_err,
            )
            yield sse(type="notice", level="warning", error=notice_err)
            # Build stub enrichments from snippets so draft has something to work with.
            for c in top3:
                enriched.append(Enrichment(name=c.name, summary=c.snippet))
        elif failures:
            n = len(failures)
            yield sse(
                type="subflow",
                name="enrich_profiles",
                status="done",
                label=f"Enriched {len(enriched)} of {len(top3)} ({n} failed)",
            )
            yield sse(
                type="notice",
                level="warning",
                error=error_obj(
                    "partial_enrich_failure",
                    f"{n} of {len(top3)} enrichment lookups failed. Continuing with the survivors.",
                    severity="warning",
                    recoverable=True,
                ),
            )
        else:
            yield sse(type="subflow", name="enrich_profiles", status="done", label="Profiles enriched")

        # ---------- 4. score_leads (DEGRADED on failure) ----------
        yield sse(type="subflow", name="score_leads", status="started", label="Scoring against ICP")
        yield sse(
            type="tool_call",
            id="tc-score",
            tool="score_icp",
            input={"criteria": "B2B SaaS, Seed-Series B, traction signals", "count": len(enriched)},
        )
        ranked: list[ScoredLead] = []
        degraded_score = False
        try:
            ranked = await score_leads(target, enriched, fail_step)
        except StepFailure as exc:
            degraded_score = True
            err = error_obj(
                exc.code,
                exc.message,
                severity="warning",
                recoverable=True,
                hint=exc.hint,
            )
            yield sse(type="tool_result", id="tc-score", tool="score_icp", error=err)
            yield sse(
                type="subflow",
                name="score_leads",
                status="error",
                label="Scoring skipped",
                error=err,
            )
            yield sse(type="notice", level="warning", error=err)
        except Exception as exc:
            degraded_score = True
            err = error_obj(
                "internal_error",
                str(exc)[:240] or "Unknown error",
                severity="warning",
                recoverable=True,
                hint="Continuing with seed order.",
            )
            yield sse(type="tool_result", id="tc-score", tool="score_icp", error=err)
            yield sse(
                type="subflow",
                name="score_leads",
                status="error",
                label="Scoring skipped",
                error=err,
            )
            yield sse(type="notice", level="warning", error=err)
        else:
            yield sse(
                type="tool_result",
                id="tc-score",
                tool="score_icp",
                preview=f"{len(ranked)} leads ranked",
                output={"ranked": [r.model_dump() for r in ranked]},
            )
            yield sse(type="subflow", name="score_leads", status="done", label="Leads ranked by fit")

        # ---------- 5. draft_outreach (MID-STREAM tier on failure) ----------
        yield sse(
            type="subflow",
            name="draft_outreach",
            status="started",
            label="Drafting personalized outreach",
        )

        by_name = {e.name: e for e in enriched}
        if ranked:
            order = ranked
        else:
            order = [ScoredLead(name=e.name, score=0.0, reason="unranked") for e in enriched]
        dossier_rows: list[dict[str, Any]] = []
        for r in order:
            enr = by_name.get(r.name)
            if enr is None:
                continue
            row = enr.model_dump()
            if not degraded_score:
                row["score"] = r.score
                row["score_reason"] = r.reason
            dossier_rows.append(row)
        dossier = json.dumps(dossier_rows, indent=2)
        prompt = (
            f"Write personalized cold-outreach openers for the top {len(dossier_rows)} "
            f"companies for the search {target!r}. Use the real dossier below — "
            "reference specific facts (stage, HQ, headcount, positioning). "
            "Format as markdown: one ### heading per company, then a 2-3 sentence "
            "opener below it. No boilerplate, no placeholders.\n\n"
            f"Dossier:\n{dossier}"
        )

        if fail_step == "draft_mid":
            # Stream a couple of fragments, then fail.
            for fragment in ["### ", "Starting draft…", "\n\nWaiting for model…"]:
                yield sse(
                    type="artifact",
                    id="leads-report",
                    title="Outreach drafts",
                    content=fragment,
                    mode="append",
                )
                await asyncio.sleep(0.2)
            err = error_obj(
                "forced_failure",
                "Draft was cut off mid-stream for demo purposes.",
                severity="error",
                recoverable=True,
                hint="You can retry to regenerate the full drafts.",
            )
            yield sse(type="artifact", id="leads-report", title="Outreach drafts", error=err)
            yield sse(
                type="subflow",
                name="draft_outreach",
                status="error",
                label="Draft cut off",
                error=err,
            )
            yield sse(type="done")
            return

        try:
            sr = ai.generate_stream(prompt=prompt)
            async for model_chunk in sr.stream:
                if model_chunk.text:
                    yield sse(
                        type="artifact",
                        id="leads-report",
                        title="Outreach drafts",
                        content=model_chunk.text,
                        mode="append",
                    )
        except Exception as exc:
            err = error_obj(
                "draft_stream_error",
                str(exc)[:240] or "Unknown error",
                severity="error",
                recoverable=True,
                hint="Partial output above is from before the failure.",
            )
            yield sse(type="artifact", id="leads-report", title="Outreach drafts", error=err)
            yield sse(
                type="subflow",
                name="draft_outreach",
                status="error",
                label="Draft cut off",
                error=err,
            )
            yield sse(type="done")
            return

        label = "Outreach ready" + (" (unranked)" if degraded_score else "")
        yield sse(type="subflow", name="draft_outreach", status="done", label=label)
        yield sse(type="done")

    return StreamingResponse(run(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
