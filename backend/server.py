import os
import uuid
import io
import json
import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

app = FastAPI(title="Founder Intelligence Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ─── Auth Helpers ───────────────────────────────────────────────

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return user_doc

# ─── Auth Endpoints ─────────────────────────────────────────────

class SessionRequest(BaseModel):
    session_id: str

@app.post("/api/auth/session")
async def create_session(req: SessionRequest, response: Response):
    async with httpx.AsyncClient() as hc:
        resp = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = resp.json()
    email = data["email"]
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data["session_token"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"email": email}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc),
        })
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 3600,
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return user_doc

@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user

@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
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
    await db.datasets.insert_one(dataset_doc)
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
    cursor = db.datasets.find({"user_id": user["user_id"]}, {"_id": 0, "data": 0})
    datasets = await cursor.to_list(100)
    return datasets

@app.get("/api/data/datasets/{dataset_id}")
async def get_dataset(dataset_id: str, user: dict = Depends(get_current_user)):
    doc = await db.datasets.find_one(
        {"dataset_id": dataset_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return doc

@app.delete("/api/data/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str, user: dict = Depends(get_current_user)):
    result = await db.datasets.delete_one({"dataset_id": dataset_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await db.metrics.delete_many({"dataset_id": dataset_id})
    await db.insights.delete_many({"dataset_id": dataset_id})
    return {"ok": True}

# ─── Strategic Metrics Engine ───────────────────────────────────

def compute_growth_metrics(data: list, numeric_cols: list) -> dict:
    """Compute composite strategic metrics from raw data."""
    df = pd.DataFrame(data)
    if df.empty or not numeric_cols:
        return {
            "growth_score": 0, "efficiency_score": 0,
            "pmf_signal": 0, "scalability_index": 0,
            "capital_efficiency": 0, "metrics_detail": {},
            "trends": {}
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
        # Month-over-month growth rates
        if len(vals) > 1:
            pct_changes = []
            for i in range(1, len(vals)):
                if vals[i - 1] != 0:
                    pct_changes.append((vals[i] - vals[i - 1]) / abs(vals[i - 1]) * 100)
            metrics_detail[col]["avg_growth_rate"] = round(float(pd.Series(pct_changes).mean()), 2) if pct_changes else 0
            metrics_detail[col]["growth_rates"] = [round(g, 2) for g in pct_changes]
            trends[col] = [round(float(v), 2) for v in vals]

    # Revenue-like columns
    revenue_cols = [c for c in numeric_cols if any(kw in c for kw in ["revenue", "mrr", "arr", "income", "sales", "gmv"])]
    cost_cols = [c for c in numeric_cols if any(kw in c for kw in ["cost", "expense", "spend", "burn", "cac"])]
    user_cols = [c for c in numeric_cols if any(kw in c for kw in ["user", "customer", "subscriber", "client", "account"])]
    retention_cols = [c for c in numeric_cols if any(kw in c for kw in ["retention", "churn", "nrr", "ndr"])]

    # Growth Score (0-100): Based on revenue/user growth rates
    growth_rates = []
    for col in (revenue_cols or user_cols or numeric_cols[:2]):
        if col in metrics_detail and "avg_growth_rate" in metrics_detail[col]:
            growth_rates.append(metrics_detail[col]["avg_growth_rate"])
    avg_growth = sum(growth_rates) / len(growth_rates) if growth_rates else 0
    growth_score = max(0, min(100, 50 + avg_growth * 2))

    # Efficiency Score (0-100): Revenue vs costs
    efficiency_score = 65
    if revenue_cols and cost_cols:
        rev_total = sum(metrics_detail.get(c, {}).get("total", 0) for c in revenue_cols)
        cost_total = sum(metrics_detail.get(c, {}).get("total", 0) for c in cost_cols)
        if cost_total > 0:
            ratio = rev_total / cost_total
            efficiency_score = max(0, min(100, ratio * 25))

    # PMF Signal (0-100): Based on retention and growth consistency
    pmf_signal = 55
    if retention_cols:
        ret_vals = []
        for c in retention_cols:
            if c in metrics_detail:
                ret_vals.append(metrics_detail[c].get("latest", 0))
        if ret_vals:
            pmf_signal = max(0, min(100, sum(ret_vals) / len(ret_vals)))
    elif growth_rates:
        consistency = 100 - min(100, abs(pd.Series(growth_rates).std()) * 2) if len(growth_rates) > 1 else 60
        pmf_signal = max(0, min(100, (consistency + growth_score) / 2))

    # Scalability Index (0-100): Growth rate relative to cost growth
    scalability_index = 60
    if revenue_cols and cost_cols:
        rev_growth = max(metrics_detail.get(c, {}).get("avg_growth_rate", 0) for c in revenue_cols) if revenue_cols else 0
        cost_growth = max(metrics_detail.get(c, {}).get("avg_growth_rate", 0) for c in cost_cols) if cost_cols else 0
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
    dataset = await db.datasets.find_one(
        {"dataset_id": dataset_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    result = compute_growth_metrics(dataset["data"], dataset["numeric_columns"])
    metrics_id = f"met_{uuid.uuid4().hex[:12]}"
    metrics_doc = {
        "metrics_id": metrics_id,
        "dataset_id": dataset_id,
        "user_id": user["user_id"],
        **result,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.metrics.delete_many({"dataset_id": dataset_id, "user_id": user["user_id"]})
    await db.metrics.insert_one(metrics_doc)
    return {k: v for k, v in metrics_doc.items() if k != "_id"}


@app.get("/api/metrics/{dataset_id}")
async def get_metrics(dataset_id: str, user: dict = Depends(get_current_user)):
    doc = await db.metrics.find_one(
        {"dataset_id": dataset_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Metrics not computed yet")
    return doc

# ─── AI Signal Interpretation ──────────────────────────────────

@app.post("/api/insights/generate/{dataset_id}")
async def generate_insights(dataset_id: str, user: dict = Depends(get_current_user)):
    metrics_doc = await db.metrics.find_one(
        {"dataset_id": dataset_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not metrics_doc:
        raise HTTPException(status_code=404, detail="Compute metrics first")

    dataset = await db.datasets.find_one(
        {"dataset_id": dataset_id, "user_id": user["user_id"]}, {"_id": 0, "data": 0}
    )

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
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"insights_{dataset_id}_{uuid.uuid4().hex[:8]}",
            system_message="You are a world-class startup analyst. Always respond with valid JSON only."
        )
        chat.with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))

        # Parse response
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0]
        insights_data = json.loads(response_text)
    except Exception as e:
        traceback.print_exc()
        insights_data = {
            "strategic_insights": [{"title": "Analysis Error", "description": str(e), "impact": "high", "category": "growth"}],
            "red_flags": [],
            "opportunities": [],
            "overall_assessment": "Unable to generate full analysis. Please try again."
        }

    insight_id = f"ins_{uuid.uuid4().hex[:12]}"
    insight_doc = {
        "insight_id": insight_id,
        "dataset_id": dataset_id,
        "user_id": user["user_id"],
        **insights_data,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.insights.delete_many({"dataset_id": dataset_id, "user_id": user["user_id"]})
    await db.insights.insert_one(insight_doc)
    return {k: v for k, v in insight_doc.items() if k != "_id"}


@app.get("/api/insights/{dataset_id}")
async def get_insights(dataset_id: str, user: dict = Depends(get_current_user)):
    doc = await db.insights.find_one(
        {"dataset_id": dataset_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No insights generated yet")
    return doc

# ─── Narrative Generator ───────────────────────────────────────

class NarrativeRequest(BaseModel):
    dataset_id: str
    narrative_type: str = "traction_statement"  # traction_statement, vc_email, executive_summary, monthly_update
    custom_context: Optional[str] = None

@app.post("/api/narrative/generate")
async def generate_narrative(req: NarrativeRequest, user: dict = Depends(get_current_user)):
    metrics_doc = await db.metrics.find_one(
        {"dataset_id": req.dataset_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not metrics_doc:
        raise HTTPException(status_code=404, detail="Compute metrics first")

    insights_doc = await db.insights.find_one(
        {"dataset_id": req.dataset_id, "user_id": user["user_id"]}, {"_id": 0}
    )

    type_prompts = {
        "traction_statement": "Generate a compelling one-line traction statement and a 3-4 sentence expansion that would make a VC want to take a meeting. Focus on the strongest growth signals.",
        "vc_email": "Generate a professional VC update email. Include: subject line, greeting, key highlights (3-4 bullet points with specific numbers), challenges being addressed, ask/next steps, and sign-off. Make it concise and data-driven.",
        "executive_summary": "Generate a structured executive summary suitable for a board meeting or investor deck. Include: headline, key metrics summary, growth analysis, efficiency analysis, risks & mitigations, and strategic outlook.",
        "monthly_update": "Generate a monthly investor update. Include: headline with month context, top 3 wins (with numbers), key metrics table, challenges & learnings, next month priorities, and a funding/runway note.",
    }

    prompt = f"""You are an elite startup communications strategist. Generate investor-grade content.

{type_prompts.get(req.narrative_type, type_prompts['traction_statement'])}

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
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"narrative_{req.dataset_id}_{uuid.uuid4().hex[:8]}",
            system_message="You are a startup communications expert. Always respond with valid JSON only."
        )
        chat.with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))

        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0]
        narrative_data = json.loads(response_text)
    except Exception as e:
        traceback.print_exc()
        narrative_data = {
            "title": "Generation Error",
            "content": f"Unable to generate narrative: {str(e)}",
            "type": req.narrative_type,
            "key_highlights": []
        }

    narrative_id = f"nar_{uuid.uuid4().hex[:12]}"
    narrative_doc = {
        "narrative_id": narrative_id,
        "dataset_id": req.dataset_id,
        "user_id": user["user_id"],
        **narrative_data,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.narratives.insert_one(narrative_doc)
    return {k: v for k, v in narrative_doc.items() if k != "_id"}


@app.get("/api/narratives")
async def list_narratives(user: dict = Depends(get_current_user)):
    cursor = db.narratives.find({"user_id": user["user_id"]}, {"_id": 0}).sort("generated_at", -1)
    return await cursor.to_list(50)

@app.get("/api/narratives/{narrative_id}")
async def get_narrative(narrative_id: str, user: dict = Depends(get_current_user)):
    doc = await db.narratives.find_one(
        {"narrative_id": narrative_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Narrative not found")
    return doc

# ─── Dashboard Overview ────────────────────────────────────────

@app.get("/api/dashboard/overview")
async def dashboard_overview(user: dict = Depends(get_current_user)):
    datasets = await db.datasets.find(
        {"user_id": user["user_id"]}, {"_id": 0, "data": 0}
    ).sort("uploaded_at", -1).to_list(50)

    latest_metrics = None
    latest_insights = None
    if datasets:
        latest_ds = datasets[0]
        latest_metrics = await db.metrics.find_one(
            {"dataset_id": latest_ds["dataset_id"], "user_id": user["user_id"]}, {"_id": 0}
        )
        latest_insights = await db.insights.find_one(
            {"dataset_id": latest_ds["dataset_id"], "user_id": user["user_id"]}, {"_id": 0}
        )

    recent_narratives = await db.narratives.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("generated_at", -1).to_list(5)

    return {
        "datasets": datasets,
        "latest_metrics": latest_metrics,
        "latest_insights": latest_insights,
        "recent_narratives": recent_narratives,
        "total_datasets": len(datasets),
        "total_narratives": await db.narratives.count_documents({"user_id": user["user_id"]}),
    }

# ─── Health ─────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Founder Intelligence Platform"}
