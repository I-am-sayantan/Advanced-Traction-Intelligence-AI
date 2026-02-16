import os
import uuid
import io
import json
import base64
import asyncio
import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import httpx
import resend
import pandas as pd
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Response, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

resend.api_key = RESEND_API_KEY

# ─── Initialize Supabase ────────────────────────────────────────

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── Initialize Gemini ──────────────────────────────────────────

genai.configure(api_key=GEMINI_API_KEY)


async def call_llm(system_message: str, prompt: str) -> str:
    """Call Google Gemini and return the text response."""
    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        system_instruction=system_message,
    )
    response = await asyncio.to_thread(model.generate_content, prompt)
    return response.text


# ─── DB Helper ───────────────────────────────────────────────────

async def run_db(fn):
    """Execute a synchronous Supabase operation in a thread pool."""
    return await asyncio.to_thread(fn)


# ─── FastAPI App ─────────────────────────────────────────────────

app = FastAPI(title="Founder Intelligence Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth Helpers ───────────────────────────────────────────────

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await run_db(
        lambda: sb.table("user_sessions")
        .select("*")
        .eq("session_token", session_token)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid session")

    session_doc = result.data[0]
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_result = await run_db(
        lambda: sb.table("users")
        .select("user_id, email, name, picture, created_at")
        .eq("user_id", session_doc["user_id"])
        .limit(1)
        .execute()
    )
    if not user_result.data:
        raise HTTPException(status_code=401, detail="User not found")
    return user_result.data[0]


# ─── Auth Endpoints ─────────────────────────────────────────────

class SessionRequest(BaseModel):
    session_id: str


@app.post("/api/auth/session")
async def create_session(req: SessionRequest, response: Response):
    async with httpx.AsyncClient() as hc:
        resp = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = resp.json()
    email = data["email"]
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data["session_token"]

    existing = await run_db(
        lambda: sb.table("users").select("*").eq("email", email).limit(1).execute()
    )
    if existing.data:
        user_id = existing.data[0]["user_id"]
        await run_db(
            lambda: sb.table("users")
            .update({"name": name, "picture": picture})
            .eq("email", email)
            .execute()
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await run_db(
            lambda: sb.table("users")
            .insert(
                {
                    "user_id": user_id,
                    "email": email,
                    "name": name,
                    "picture": picture,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )

    await run_db(
        lambda: sb.table("user_sessions")
        .insert(
            {
                "user_id": user_id,
                "session_token": session_token,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 3600,
    )
    user_result = await run_db(
        lambda: sb.table("users")
        .select("user_id, email, name, picture, created_at")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return user_result.data[0]


# ─── Dev Login (local development only) ─────────────────────────

@app.post("/api/auth/dev-login")
async def dev_login(response: Response):
    """Quick login for local development — no OAuth required."""
    email = "dev@localhost.com"
    name = "Dev User"
    user_id = "user_dev_local"

    existing = await run_db(
        lambda: sb.table("users").select("*").eq("email", email).limit(1).execute()
    )
    if not existing.data:
        await run_db(
            lambda: sb.table("users")
            .insert(
                {
                    "user_id": user_id,
                    "email": email,
                    "name": name,
                    "picture": "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )

    session_token = uuid.uuid4().hex
    await run_db(
        lambda: sb.table("user_sessions")
        .insert(
            {
                "user_id": user_id,
                "session_token": session_token,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 3600,
    )
    return {"user_id": user_id, "email": email, "name": name, "picture": ""}


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await run_db(
            lambda: sb.table("user_sessions")
            .delete()
            .eq("session_token", session_token)
            .execute()
        )
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ─── Data Upload ────────────────────────────────────────────────

@app.post("/api/data/upload")
async def upload_data(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    contents = await file.read()
    filename = file.filename or "upload.csv"
    try:
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {str(e)}")

    # Normalize column names
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Detect date/period column
    period_col = None
    for col in df.columns:
        if any(kw in col for kw in ["date", "month", "period", "time", "year", "quarter"]):
            period_col = col
            break

    records = json.loads(df.to_json(orient="records", date_format="iso"))
    columns = list(df.columns)
    numeric_cols = list(df.select_dtypes(include=["number"]).columns)

    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    dataset_doc = {
        "dataset_id": dataset_id,
        "user_id": user["user_id"],
        "filename": filename,
        "columns": columns,
        "numeric_columns": numeric_cols,
        "period_column": period_col,
        "row_count": len(records),
        "data": records,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await run_db(lambda: sb.table("datasets").insert(dataset_doc).execute())
    return {
        "dataset_id": dataset_id,
        "filename": filename,
        "columns": columns,
        "numeric_columns": numeric_cols,
        "period_column": period_col,
        "row_count": len(records),
    }


@app.get("/api/data/datasets")
async def list_datasets(user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("datasets")
        .select("dataset_id, user_id, filename, columns, numeric_columns, period_column, row_count, uploaded_at")
        .eq("user_id", user["user_id"])
        .order("uploaded_at", desc=True)
        .limit(100)
        .execute()
    )
    return result.data


@app.get("/api/data/datasets/{dataset_id}")
async def get_dataset(dataset_id: str, user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("datasets")
        .select("dataset_id, user_id, filename, columns, numeric_columns, period_column, row_count, data, uploaded_at")
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return result.data[0]


@app.delete("/api/data/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str, user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("datasets")
        .delete()
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Dataset not found")
    # Clean up related data
    await run_db(lambda: sb.table("metrics").delete().eq("dataset_id", dataset_id).execute())
    await run_db(lambda: sb.table("insights").delete().eq("dataset_id", dataset_id).execute())
    return {"ok": True}


# ─── Strategic Metrics Engine ───────────────────────────────────

def compute_growth_metrics(data: list, numeric_cols: list) -> dict:
    """Compute composite strategic metrics from raw data."""
    df = pd.DataFrame(data)
    if df.empty or not numeric_cols:
        return {
            "growth_score": 0,
            "efficiency_score": 0,
            "pmf_signal": 0,
            "scalability_index": 0,
            "capital_efficiency": 0,
            "metrics_detail": {},
            "trends": {},
        }

    metrics_detail = {}
    trends = {}

    # Calculate per-column stats
    for col in numeric_cols:
        if col not in df.columns:
            continue
        series = pd.to_numeric(df[col], errors="coerce").dropna()
        if series.empty:
            continue
        vals = series.values
        metrics_detail[col] = {
            "mean": round(float(vals.mean()), 2),
            "latest": round(float(vals[-1]), 2),
            "min": round(float(vals.min()), 2),
            "max": round(float(vals.max()), 2),
            "total": round(float(vals.sum()), 2),
        }
        if len(vals) > 1:
            pct_changes = []
            for i in range(1, len(vals)):
                if vals[i - 1] != 0:
                    pct_changes.append((vals[i] - vals[i - 1]) / abs(vals[i - 1]) * 100)
            metrics_detail[col]["avg_growth_rate"] = (
                round(float(pd.Series(pct_changes).mean()), 2) if pct_changes else 0
            )
            metrics_detail[col]["growth_rates"] = [round(g, 2) for g in pct_changes]
            trends[col] = [round(float(v), 2) for v in vals]

    # Classify columns
    revenue_cols = [
        c for c in numeric_cols if any(kw in c for kw in ["revenue", "mrr", "arr", "income", "sales", "gmv"])
    ]
    cost_cols = [
        c for c in numeric_cols if any(kw in c for kw in ["cost", "expense", "spend", "burn", "cac"])
    ]
    user_cols = [
        c for c in numeric_cols if any(kw in c for kw in ["user", "customer", "subscriber", "client", "account"])
    ]
    retention_cols = [
        c for c in numeric_cols if any(kw in c for kw in ["retention", "churn", "nrr", "ndr"])
    ]

    # Growth Score (0-100)
    growth_rates = []
    for col in revenue_cols or user_cols or numeric_cols[:2]:
        if col in metrics_detail and "avg_growth_rate" in metrics_detail[col]:
            growth_rates.append(metrics_detail[col]["avg_growth_rate"])
    avg_growth = sum(growth_rates) / len(growth_rates) if growth_rates else 0
    growth_score = max(0, min(100, 50 + avg_growth * 2))

    # Efficiency Score (0-100)
    efficiency_score = 65
    if revenue_cols and cost_cols:
        rev_total = sum(metrics_detail.get(c, {}).get("total", 0) for c in revenue_cols)
        cost_total = sum(metrics_detail.get(c, {}).get("total", 0) for c in cost_cols)
        if cost_total > 0:
            ratio = rev_total / cost_total
            efficiency_score = max(0, min(100, ratio * 25))

    # PMF Signal (0-100)
    pmf_signal = 55
    churn_cols = [c for c in numeric_cols if "churn" in c]
    pure_retention_cols = [c for c in retention_cols if "churn" not in c]
    if pure_retention_cols:
        ret_vals = []
        for c in pure_retention_cols:
            if c in metrics_detail:
                ret_vals.append(metrics_detail[c].get("latest", 0))
        if ret_vals:
            pmf_signal = max(0, min(100, sum(ret_vals) / len(ret_vals)))
    elif churn_cols:
        churn_vals = []
        for c in churn_cols:
            if c in metrics_detail:
                churn_vals.append(metrics_detail[c].get("latest", 0))
        if churn_vals:
            avg_churn = sum(churn_vals) / len(churn_vals)
            pmf_signal = max(0, min(100, 100 - avg_churn * 10))
    elif growth_rates:
        consistency = (
            100 - min(100, abs(pd.Series(growth_rates).std()) * 2)
            if len(growth_rates) > 1
            else 60
        )
        pmf_signal = max(0, min(100, (consistency + growth_score) / 2))

    # Scalability Index (0-100)
    scalability_index = 60
    if revenue_cols and cost_cols:
        rev_growth = (
            max(metrics_detail.get(c, {}).get("avg_growth_rate", 0) for c in revenue_cols)
            if revenue_cols
            else 0
        )
        cost_growth = (
            max(metrics_detail.get(c, {}).get("avg_growth_rate", 0) for c in cost_cols)
            if cost_cols
            else 0
        )
        if cost_growth != 0:
            scalability_index = max(0, min(100, 50 + (rev_growth - cost_growth)))
        elif rev_growth > 0:
            scalability_index = max(0, min(100, 50 + rev_growth))

    # Capital Efficiency (0-100)
    capital_efficiency = 55
    if revenue_cols and cost_cols:
        rev_latest = sum(metrics_detail.get(c, {}).get("latest", 0) for c in revenue_cols)
        cost_latest = sum(metrics_detail.get(c, {}).get("latest", 0) for c in cost_cols)
        if cost_latest > 0:
            capital_efficiency = max(0, min(100, (rev_latest / cost_latest) * 30))

    return {
        "growth_score": round(growth_score, 1),
        "efficiency_score": round(efficiency_score, 1),
        "pmf_signal": round(pmf_signal, 1),
        "scalability_index": round(scalability_index, 1),
        "capital_efficiency": round(capital_efficiency, 1),
        "metrics_detail": metrics_detail,
        "trends": trends,
    }


@app.post("/api/metrics/compute/{dataset_id}")
async def compute_metrics(dataset_id: str, user: dict = Depends(get_current_user)):
    ds_result = await run_db(
        lambda: sb.table("datasets")
        .select("*")
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not ds_result.data:
        raise HTTPException(status_code=404, detail="Dataset not found")
    dataset = ds_result.data[0]

    result = compute_growth_metrics(dataset["data"], dataset["numeric_columns"])
    metrics_id = f"met_{uuid.uuid4().hex[:12]}"
    metrics_doc = {
        "metrics_id": metrics_id,
        "dataset_id": dataset_id,
        "user_id": user["user_id"],
        "growth_score": result["growth_score"],
        "efficiency_score": result["efficiency_score"],
        "pmf_signal": result["pmf_signal"],
        "scalability_index": result["scalability_index"],
        "capital_efficiency": result["capital_efficiency"],
        "metrics_detail": result["metrics_detail"],
        "trends": result["trends"],
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }

    # Delete previous metrics for this dataset
    await run_db(
        lambda: sb.table("metrics")
        .delete()
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .execute()
    )
    await run_db(lambda: sb.table("metrics").insert(metrics_doc).execute())
    return metrics_doc


@app.get("/api/metrics/{dataset_id}")
async def get_metrics(dataset_id: str, user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("metrics")
        .select("metrics_id, dataset_id, user_id, growth_score, efficiency_score, pmf_signal, scalability_index, capital_efficiency, metrics_detail, trends, computed_at")
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Metrics not computed yet")
    return result.data[0]


# ─── AI Signal Interpretation ──────────────────────────────────

@app.post("/api/insights/generate/{dataset_id}")
async def generate_insights(dataset_id: str, user: dict = Depends(get_current_user)):
    metrics_result = await run_db(
        lambda: sb.table("metrics")
        .select("*")
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not metrics_result.data:
        raise HTTPException(status_code=404, detail="Compute metrics first")
    metrics_doc = metrics_result.data[0]

    ds_result = await run_db(
        lambda: sb.table("datasets")
        .select("dataset_id, filename, columns")
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    dataset = ds_result.data[0] if ds_result.data else {}

    prompt = f"""You are a strategic startup analyst. Analyze these metrics for a startup and provide actionable insights.

Dataset: {dataset.get('filename', 'Unknown')}
Columns: {', '.join(dataset.get('columns', []))}

COMPOSITE SCORES:
- Growth Score: {metrics_doc['growth_score']}/100
- Efficiency Score: {metrics_doc['efficiency_score']}/100
- PMF Signal Score: {metrics_doc['pmf_signal']}/100
- Scalability Index: {metrics_doc['scalability_index']}/100
- Capital Efficiency: {metrics_doc['capital_efficiency']}/100

DETAILED METRICS:
{json.dumps(metrics_doc.get('metrics_detail', {}), indent=2)}

Provide your analysis in this EXACT JSON format (no markdown, just raw JSON):
{{
  "strategic_insights": [
    {{"title": "...", "description": "...", "impact": "high|medium|low", "category": "growth|efficiency|retention|revenue"}}
  ],
  "red_flags": [
    {{"title": "...", "description": "...", "severity": "critical|warning|info"}}
  ],
  "opportunities": [
    {{"title": "...", "description": "...", "potential_impact": "...", "priority": "high|medium|low"}}
  ],
  "overall_assessment": "A 2-3 sentence strategic summary"
}}

Be specific, data-driven, and actionable. Reference actual numbers."""

    try:
        response_text = await call_llm(
            "You are a world-class startup analyst. Always respond with valid JSON only.",
            prompt,
        )
        response_text = response_text.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0]
        insights_data = json.loads(response_text)
    except Exception as e:
        traceback.print_exc()
        insights_data = {
            "strategic_insights": [
                {"title": "Analysis Error", "description": str(e), "impact": "high", "category": "growth"}
            ],
            "red_flags": [],
            "opportunities": [],
            "overall_assessment": "Unable to generate full analysis. Please try again.",
        }

    insight_id = f"ins_{uuid.uuid4().hex[:12]}"
    insight_doc = {
        "insight_id": insight_id,
        "dataset_id": dataset_id,
        "user_id": user["user_id"],
        "strategic_insights": insights_data.get("strategic_insights", []),
        "red_flags": insights_data.get("red_flags", []),
        "opportunities": insights_data.get("opportunities", []),
        "overall_assessment": insights_data.get("overall_assessment", ""),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    await run_db(
        lambda: sb.table("insights")
        .delete()
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .execute()
    )
    await run_db(lambda: sb.table("insights").insert(insight_doc).execute())
    return insight_doc


@app.get("/api/insights/{dataset_id}")
async def get_insights(dataset_id: str, user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("insights")
        .select("*")
        .eq("dataset_id", dataset_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No insights generated yet")
    row = result.data[0]
    row.pop("id", None)
    return row


# ─── Narrative Generator ───────────────────────────────────────

class NarrativeRequest(BaseModel):
    dataset_id: str
    narrative_type: str = "traction_statement"
    custom_context: Optional[str] = None


@app.post("/api/narrative/generate")
async def generate_narrative(req: NarrativeRequest, user: dict = Depends(get_current_user)):
    metrics_result = await run_db(
        lambda: sb.table("metrics")
        .select("*")
        .eq("dataset_id", req.dataset_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not metrics_result.data:
        raise HTTPException(status_code=404, detail="Compute metrics first")
    metrics_doc = metrics_result.data[0]

    insights_result = await run_db(
        lambda: sb.table("insights")
        .select("*")
        .eq("dataset_id", req.dataset_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    insights_doc = insights_result.data[0] if insights_result.data else None

    type_prompts = {
        "traction_statement": "Generate a compelling one-line traction statement and a 3-4 sentence expansion that would make a VC want to take a meeting. Focus on the strongest growth signals.",
        "vc_email": "Generate a professional VC update email. Include: subject line, greeting, key highlights (3-4 bullet points with specific numbers), challenges being addressed, ask/next steps, and sign-off. Make it concise and data-driven.",
        "executive_summary": "Generate a structured executive summary suitable for a board meeting or investor deck. Include: headline, key metrics summary, growth analysis, efficiency analysis, risks & mitigations, and strategic outlook.",
        "monthly_update": "Generate a monthly investor update. Include: headline with month context, top 3 wins (with numbers), key metrics table, challenges & learnings, next month priorities, and a funding/runway note.",
    }

    prompt = f"""{type_prompts.get(req.narrative_type, type_prompts['traction_statement'])}

METRICS DATA:
- Growth Score: {metrics_doc['growth_score']}/100
- Efficiency Score: {metrics_doc['efficiency_score']}/100
- PMF Signal: {metrics_doc['pmf_signal']}/100
- Scalability Index: {metrics_doc['scalability_index']}/100
- Capital Efficiency: {metrics_doc['capital_efficiency']}/100

DETAILED METRICS:
{json.dumps(metrics_doc.get('metrics_detail', {}), indent=2)}

{'AI INSIGHTS: ' + json.dumps(insights_doc.get('strategic_insights', []), indent=2) if insights_doc else ''}
{'OVERALL ASSESSMENT: ' + insights_doc.get('overall_assessment', '') if insights_doc else ''}
{f'ADDITIONAL CONTEXT: {req.custom_context}' if req.custom_context else ''}

Return your response in this EXACT JSON format (no markdown, just raw JSON):
{{
  "title": "Title of this narrative",
  "content": "The full formatted narrative text (use markdown formatting)",
  "type": "{req.narrative_type}",
  "key_highlights": ["highlight 1", "highlight 2", "highlight 3"]
}}"""

    try:
        response_text = await call_llm(
            "You are an elite startup communications strategist. Generate investor-grade content. Always respond with valid JSON only.",
            prompt,
        )
        response_text = response_text.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0]
        narrative_data = json.loads(response_text)
    except Exception as e:
        traceback.print_exc()
        narrative_data = {
            "title": "Generation Error",
            "content": f"Unable to generate narrative: {str(e)}",
            "type": req.narrative_type,
            "key_highlights": [],
        }

    narrative_id = f"nar_{uuid.uuid4().hex[:12]}"
    narrative_doc = {
        "narrative_id": narrative_id,
        "dataset_id": req.dataset_id,
        "user_id": user["user_id"],
        "title": narrative_data.get("title", ""),
        "content": narrative_data.get("content", ""),
        "type": narrative_data.get("type", req.narrative_type),
        "key_highlights": narrative_data.get("key_highlights", []),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await run_db(lambda: sb.table("narratives").insert(narrative_doc).execute())
    return narrative_doc


@app.get("/api/narratives")
async def list_narratives(user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("narratives")
        .select("*")
        .eq("user_id", user["user_id"])
        .order("generated_at", desc=True)
        .limit(50)
        .execute()
    )
    for row in result.data:
        row.pop("id", None)
    return result.data


@app.get("/api/narratives/{narrative_id}")
async def get_narrative(narrative_id: str, user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("narratives")
        .select("*")
        .eq("narrative_id", narrative_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Narrative not found")
    row = result.data[0]
    row.pop("id", None)
    return row


# ─── Dashboard Overview ────────────────────────────────────────

@app.get("/api/dashboard/overview")
async def dashboard_overview(user: dict = Depends(get_current_user)):
    ds_result = await run_db(
        lambda: sb.table("datasets")
        .select("dataset_id, user_id, filename, columns, numeric_columns, period_column, row_count, uploaded_at")
        .eq("user_id", user["user_id"])
        .order("uploaded_at", desc=True)
        .limit(50)
        .execute()
    )
    datasets = ds_result.data

    latest_metrics = None
    latest_insights = None
    if datasets:
        latest_ds = datasets[0]
        met_result = await run_db(
            lambda: sb.table("metrics")
            .select("*")
            .eq("dataset_id", latest_ds["dataset_id"])
            .eq("user_id", user["user_id"])
            .limit(1)
            .execute()
        )
        if met_result.data:
            latest_metrics = met_result.data[0]
            latest_metrics.pop("id", None)

        ins_result = await run_db(
            lambda: sb.table("insights")
            .select("*")
            .eq("dataset_id", latest_ds["dataset_id"])
            .eq("user_id", user["user_id"])
            .limit(1)
            .execute()
        )
        if ins_result.data:
            latest_insights = ins_result.data[0]
            latest_insights.pop("id", None)

    nar_result = await run_db(
        lambda: sb.table("narratives")
        .select("*")
        .eq("user_id", user["user_id"])
        .order("generated_at", desc=True)
        .limit(5)
        .execute()
    )
    recent_narratives = nar_result.data
    for row in recent_narratives:
        row.pop("id", None)

    nar_count_result = await run_db(
        lambda: sb.table("narratives")
        .select("*", count="exact")
        .eq("user_id", user["user_id"])
        .execute()
    )

    return {
        "datasets": datasets,
        "latest_metrics": latest_metrics,
        "latest_insights": latest_insights,
        "recent_narratives": recent_narratives,
        "total_datasets": len(datasets),
        "total_narratives": nar_count_result.count or 0,
    }


# ─── Health ─────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Founder Intelligence Platform"}


# ─── Startup Updates Journal ────────────────────────────────────

@app.post("/api/updates")
async def create_update(request: Request, user: dict = Depends(get_current_user)):
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        content = form.get("content", "")
        tags_raw = form.get("tags", "")
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []
        images = []
        for key in form:
            if key.startswith("image"):
                upload_file = form[key]
                if hasattr(upload_file, "read"):
                    img_bytes = await upload_file.read()
                    img_b64 = base64.b64encode(img_bytes).decode("utf-8")
                    img_type = upload_file.content_type or "image/png"
                    images.append({"data": img_b64, "type": img_type, "name": upload_file.filename})
    else:
        body = await request.json()
        content = body.get("content", "")
        tags = body.get("tags", [])
        images = body.get("images", [])

    update_id = f"upd_{uuid.uuid4().hex[:12]}"
    update_doc = {
        "update_id": update_id,
        "user_id": user["user_id"],
        "content": content,
        "images": images,
        "tags": tags,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await run_db(lambda: sb.table("updates").insert(update_doc).execute())
    return update_doc


@app.get("/api/updates")
async def list_updates(user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("updates")
        .select("*")
        .eq("user_id", user["user_id"])
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    for row in result.data:
        row.pop("id", None)
    return result.data


@app.get("/api/updates/{update_id}")
async def get_update(update_id: str, user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("updates")
        .select("*")
        .eq("update_id", update_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Update not found")
    row = result.data[0]
    row.pop("id", None)
    return row


@app.delete("/api/updates/{update_id}")
async def delete_update(update_id: str, user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("updates")
        .delete()
        .eq("update_id", update_id)
        .eq("user_id", user["user_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Update not found")
    return {"ok": True}


class UpdateAnalysisRequest(BaseModel):
    days: int = 7


@app.post("/api/updates/ai-analyze")
async def ai_analyze_updates(req: UpdateAnalysisRequest, user: dict = Depends(get_current_user)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=req.days)).isoformat()

    updates_result = await run_db(
        lambda: sb.table("updates")
        .select("update_id, user_id, content, tags, created_at")
        .eq("user_id", user["user_id"])
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    updates = updates_result.data
    if not updates:
        raise HTTPException(status_code=404, detail="No updates in this period")

    # Get latest metrics for context
    latest_metrics = None
    latest_ds_result = await run_db(
        lambda: sb.table("datasets")
        .select("dataset_id")
        .eq("user_id", user["user_id"])
        .order("uploaded_at", desc=True)
        .limit(1)
        .execute()
    )
    if latest_ds_result.data:
        ds_id = latest_ds_result.data[0]["dataset_id"]
        met_result = await run_db(
            lambda: sb.table("metrics")
            .select("growth_score, efficiency_score, pmf_signal, scalability_index, capital_efficiency")
            .eq("dataset_id", ds_id)
            .eq("user_id", user["user_id"])
            .limit(1)
            .execute()
        )
        if met_result.data:
            latest_metrics = met_result.data[0]

    updates_text = "\n\n".join(
        [
            f"[{u['created_at'][:10]}] {u['content']}"
            + (f" (tags: {', '.join(u.get('tags', []))})" if u.get("tags") else "")
            for u in updates
        ]
    )

    metrics_context = ""
    if latest_metrics:
        metrics_context = f"""
CURRENT METRICS:
- Growth Score: {latest_metrics.get('growth_score', 'N/A')}/100
- Efficiency Score: {latest_metrics.get('efficiency_score', 'N/A')}/100
- PMF Signal: {latest_metrics.get('pmf_signal', 'N/A')}/100
- Scalability Index: {latest_metrics.get('scalability_index', 'N/A')}/100
- Capital Efficiency: {latest_metrics.get('capital_efficiency', 'N/A')}/100
"""

    prompt = f"""You are a strategic startup advisor analyzing a founder's recent journal entries/updates.

FOUNDER UPDATES ({len(updates)} entries from last {req.days} days):
{updates_text}

{metrics_context}

Analyze these updates and provide a comprehensive summary. Return EXACT JSON (no markdown):
{{
  "summary": "2-3 sentence overview of what's been happening",
  "key_themes": ["theme1", "theme2", "theme3"],
  "momentum_signal": "positive|neutral|negative",
  "suggested_metrics_to_track": ["metric1", "metric2"],
  "recommended_update_for_investors": "A polished 3-4 sentence investor-ready update based on these journal entries",
  "action_items": ["action1", "action2", "action3"],
  "trend_observations": [
    {{"observation": "...", "implication": "...", "priority": "high|medium|low"}}
  ]
}}

Be specific, reference actual details from the updates. Think like a VC-advisor hybrid."""

    try:
        response_text = await call_llm(
            "You are a startup strategic advisor. Always respond with valid JSON only.",
            prompt,
        )
        response_text = response_text.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0]
        analysis = json.loads(response_text)
    except Exception as e:
        traceback.print_exc()
        analysis = {
            "summary": f"Analysis error: {str(e)}",
            "key_themes": [],
            "momentum_signal": "neutral",
            "suggested_metrics_to_track": [],
            "recommended_update_for_investors": "",
            "action_items": [],
            "trend_observations": [],
        }

    return {
        "analysis": analysis,
        "updates_analyzed": len(updates),
        "period_days": req.days,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


# ─── Contact Manager ───────────────────────────────────────────

class ContactCreate(BaseModel):
    name: str
    email: str
    company: Optional[str] = None
    role: Optional[str] = None
    tags: List[str] = []
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None


@app.post("/api/contacts")
async def create_contact(req: ContactCreate, user: dict = Depends(get_current_user)):
    existing = await run_db(
        lambda: sb.table("contacts")
        .select("contact_id")
        .eq("user_id", user["user_id"])
        .eq("email", req.email)
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="Contact with this email already exists")

    contact_id = f"con_{uuid.uuid4().hex[:12]}"
    contact_doc = {
        "contact_id": contact_id,
        "user_id": user["user_id"],
        "name": req.name,
        "email": req.email,
        "company": req.company or "",
        "role": req.role or "",
        "tags": req.tags,
        "notes": req.notes or "",
        "emails_sent": 0,
        "last_contacted": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await run_db(lambda: sb.table("contacts").insert(contact_doc).execute())
    return contact_doc


@app.get("/api/contacts")
async def list_contacts(tag: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = sb.table("contacts").select("*").eq("user_id", user["user_id"])
    if tag:
        query = query.contains("tags", [tag])
    query = query.order("name").limit(500)
    result = await run_db(lambda: query.execute())
    for row in result.data:
        row.pop("id", None)
    return result.data


@app.put("/api/contacts/{contact_id}")
async def update_contact(contact_id: str, req: ContactUpdate, user: dict = Depends(get_current_user)):
    update_fields = {k: v for k, v in req.dict().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await run_db(
        lambda: sb.table("contacts")
        .update(update_fields)
        .eq("contact_id", contact_id)
        .eq("user_id", user["user_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    row = result.data[0]
    row.pop("id", None)
    return row


@app.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("contacts")
        .delete()
        .eq("contact_id", contact_id)
        .eq("user_id", user["user_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"ok": True}


@app.post("/api/contacts/import")
async def import_contacts(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    contents = await file.read()
    filename = file.filename or "contacts.csv"
    try:
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {str(e)}")

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    if "email" not in df.columns:
        raise HTTPException(status_code=400, detail="CSV must have an 'email' column")

    imported = 0
    skipped = 0
    for _, row in df.iterrows():
        email = str(row.get("email", "")).strip()
        if not email or "@" not in email:
            skipped += 1
            continue
        existing = await run_db(
            lambda: sb.table("contacts")
            .select("contact_id")
            .eq("user_id", user["user_id"])
            .eq("email", email)
            .limit(1)
            .execute()
        )
        if existing.data:
            skipped += 1
            continue
        contact_id = f"con_{uuid.uuid4().hex[:12]}"
        tags_raw = str(row.get("tags", row.get("tag", "")))
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []
        await run_db(
            lambda: sb.table("contacts")
            .insert(
                {
                    "contact_id": contact_id,
                    "user_id": user["user_id"],
                    "name": str(row.get("name", row.get("first_name", ""))).strip(),
                    "email": email,
                    "company": str(row.get("company", row.get("organization", ""))).strip(),
                    "role": str(row.get("role", row.get("title", row.get("position", "")))).strip(),
                    "tags": tags,
                    "notes": str(row.get("notes", "")).strip(),
                    "emails_sent": 0,
                    "last_contacted": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )
        imported += 1

    return {"imported": imported, "skipped": skipped, "total_rows": len(df)}


# ─── Email Sending ──────────────────────────────────────────────

class EmailSendRequest(BaseModel):
    contact_ids: List[str]
    subject: str
    html_content: str
    narrative_id: Optional[str] = None


@app.post("/api/email/send")
async def send_email(req: EmailSendRequest, user: dict = Depends(get_current_user)):
    if not RESEND_API_KEY:
        raise HTTPException(status_code=500, detail="Email service not configured")

    contacts = []
    for cid in req.contact_ids:
        result = await run_db(
            lambda: sb.table("contacts")
            .select("*")
            .eq("contact_id", cid)
            .eq("user_id", user["user_id"])
            .limit(1)
            .execute()
        )
        if result.data:
            contacts.append(result.data[0])

    if not contacts:
        raise HTTPException(status_code=400, detail="No valid contacts found")

    results = []
    for contact in contacts:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [contact["email"]],
                "subject": req.subject,
                "html": req.html_content,
                "reply_to": user["email"],
            }
            email_result = await asyncio.to_thread(resend.Emails.send, params)
            email_id = (
                email_result.get("id")
                if isinstance(email_result, dict)
                else getattr(email_result, "id", None)
            )

            # Update contact: increment emails_sent
            current_sent = contact.get("emails_sent", 0) or 0
            await run_db(
                lambda: sb.table("contacts")
                .update(
                    {
                        "last_contacted": datetime.now(timezone.utc).isoformat(),
                        "emails_sent": current_sent + 1,
                    }
                )
                .eq("contact_id", contact["contact_id"])
                .execute()
            )
            results.append(
                {
                    "contact_id": contact["contact_id"],
                    "email": contact["email"],
                    "status": "sent",
                    "email_id": email_id,
                }
            )
        except Exception as e:
            results.append(
                {
                    "contact_id": contact["contact_id"],
                    "email": contact["email"],
                    "status": "failed",
                    "error": str(e),
                }
            )

    log_id = f"elog_{uuid.uuid4().hex[:12]}"
    await run_db(
        lambda: sb.table("email_logs")
        .insert(
            {
                "log_id": log_id,
                "user_id": user["user_id"],
                "subject": req.subject,
                "recipients": results,
                "narrative_id": req.narrative_id,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )

    sent_count = sum(1 for r in results if r["status"] == "sent")
    return {
        "log_id": log_id,
        "sent": sent_count,
        "failed": len(results) - sent_count,
        "results": results,
    }


@app.get("/api/email/logs")
async def email_logs(user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("email_logs")
        .select("*")
        .eq("user_id", user["user_id"])
        .order("sent_at", desc=True)
        .limit(50)
        .execute()
    )
    for row in result.data:
        row.pop("id", None)
    return result.data


@app.get("/api/contacts/tags")
async def get_contact_tags(user: dict = Depends(get_current_user)):
    result = await run_db(
        lambda: sb.table("contacts")
        .select("tags")
        .eq("user_id", user["user_id"])
        .execute()
    )
    tag_counts = {}
    for row in result.data:
        for tag in row.get("tags") or []:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
    return [{"tag": t, "count": c} for t, c in sorted_tags[:50]]
