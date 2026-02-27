# -*- coding: utf-8 -*-
"""
EcoHunt AI - FastAPI Bridge Server
====================================
REST API server that processes deal data and integrates with Gemini Flash LLM.
Reads from the same CSV data files as the Pathway pipeline.
Runs on Windows natively (no WSL required).

Run: python api_server.py
"""

import os
import json
import pandas as pd
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# ─── Try importing Gemini ────────────────────────────────────────────────────
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("[WARN] google-genai not installed. Using mock LLM responses.")

# ─── App Setup ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="EcoHunt AI - Deal Hunting API",
    description="Real-time eco-friendly deal hunting powered by Pathway + Gemini",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Data Models ─────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    answer: str
    deals: list
    query: str
    timestamp: str

# ─── Data Loading (simulates Pathway's real-time join) ───────────────────────

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
START_TIME = datetime.now()

def load_and_join_data():
    """Load CSV files and perform join - mirrors Pathway's real-time join operation."""
    prices_path = os.path.join(DATA_DIR, "live_prices.csv")
    discounts_path = os.path.join(DATA_DIR, "live_discounts.csv")

    prices = pd.read_csv(prices_path)
    discounts = pd.read_csv(discounts_path)

    # Join on product_id (same as Pathway's pw.left.product_id == pw.right.product_id)
    joined = prices.merge(discounts, on="product_id", how="inner")

    # Calculate final price after discount
    joined["final_price"] = round(joined["current_price"] * (1 - joined["discount_percent"] / 100), 2)
    joined["savings"] = round(joined["base_price"] - joined["final_price"], 2)
    joined["savings_percent"] = round((joined["savings"] / joined["base_price"]) * 100, 1)

    return joined


def deals_to_list(df):
    """Convert DataFrame to list of deal dictionaries."""
    deals = []
    for _, row in df.iterrows():
        deals.append({
            "product_id": row["product_id"],
            "name": row["name"],
            "category": row["category"],
            "base_price": float(row["base_price"]),
            "current_price": float(row["current_price"]),
            "final_price": float(row["final_price"]),
            "savings": float(row["savings"]),
            "savings_percent": float(row["savings_percent"]),
            "unit": row["unit"],
            "eco_rating": float(row["eco_rating"]),
            "brand": row["brand"],
            "discount_code": row["discount_code"],
            "discount_percent": float(row["discount_percent"]),
            "valid_until": row["valid_until"],
            "flash_sale": bool(row["flash_sale"]),
        })
    return deals

# ─── Gemini LLM Integration ─────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

def setup_gemini():
    """Configure Gemini API if available."""
    if GEMINI_AVAILABLE and GEMINI_API_KEY:
        return True
    return False

def query_gemini(user_query: str, deals_context: str) -> str:
    """Query Gemini Flash with deal context (RAG-style)."""
    gemini_ready = setup_gemini()

    if not gemini_ready:
        return generate_mock_response(user_query, deals_context)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = f"""You are EcoHunt AI, a helpful deal-hunting assistant for eco-friendly products in India.
You are part of the "Hack For Green Bharat" initiative promoting sustainable shopping.

Based on the following real-time deal data from our Pathway streaming pipeline, answer the user's query.
Be concise, friendly, and highlight the best savings. Use Rs. for Indian Rupees.
Always mention the discount code so users can apply it.

CURRENT DEALS DATA:
{deals_context}

USER QUERY: {user_query}

Respond naturally in 2-3 sentences. Focus on the BEST matching deals with highest savings."""

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        return response.text
    except Exception as e:
        print(f"Gemini error: {e}")
        return generate_mock_response(user_query, deals_context)


def generate_mock_response(user_query: str, deals_context: str) -> str:
    """Generate a smart mock response when Gemini is unavailable."""
    query_lower = user_query.lower()
    deals_data = load_and_join_data()

    # Keyword matching
    matches = []
    for _, row in deals_data.iterrows():
        search_text = f"{row['name']} {row['category']} {row['brand']}".lower()
        keywords = query_lower.split()
        score = sum(1 for kw in keywords if kw in search_text)
        if score > 0:
            matches.append((score, row))

    # Sort by relevance then savings
    matches.sort(key=lambda x: (-x[0], -x[1]["savings_percent"]))

    if not matches:
        # Return highest savings deals
        top = deals_data.nlargest(3, "savings_percent")
        names = ", ".join(top["name"].tolist())
        return f"I couldn't find an exact match for '{user_query}', but here are today's top deals: {names}. Check them out for amazing eco-friendly savings!"

    best = matches[0][1]
    response = f"Great choice! The best deal on {best['name']} ({best['brand']}) is currently Rs.{best['final_price']:.0f} "
    response += f"(was Rs.{best['base_price']:.0f}) - you save Rs.{best['savings']:.0f} ({best['savings_percent']:.0f}% off)! "
    response += f"Use code {best['discount_code']} before {best['valid_until']}."

    if len(matches) > 1:
        other = matches[1][1]
        response += f" Also check out {other['name']} at Rs.{other['final_price']:.0f} ({other['savings_percent']:.0f}% off)!"

    return response

# ─── API Endpoints ───────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "app": "EcoHunt AI",
        "version": "1.0.0",
        "status": "running",
        "hackathon": "Hack For Green Bharat",
        "endpoints": ["/api/deals", "/api/flash-sales", "/api/stream-status", "/api/query"],
    }


@app.get("/api/deals")
async def get_deals():
    """Get all current deals with computed savings."""
    try:
        df = load_and_join_data()
        deals = deals_to_list(df)
        return {
            "status": "success",
            "count": len(deals),
            "deals": deals,
            "timestamp": datetime.now().isoformat(),
            "source": "Pathway Real-Time Pipeline",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/flash-sales")
async def get_flash_sales():
    """Get active flash sale items only."""
    try:
        df = load_and_join_data()
        flash = df[df["flash_sale"] == True]
        deals = deals_to_list(flash)
        return {
            "status": "success",
            "count": len(deals),
            "deals": deals,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stream-status")
async def stream_status():
    """Get simulated Pathway stream statistics."""
    uptime = (datetime.now() - START_TIME).total_seconds()
    df = load_and_join_data()
    return {
        "status": "live",
        "uptime_seconds": round(uptime, 1),
        "streams": {
            "prices": {
                "source": "pw.io.csv.read('./live_prices/')",
                "rows": len(pd.read_csv(os.path.join(DATA_DIR, "live_prices.csv"))),
                "status": "streaming",
            },
            "discounts": {
                "source": "pw.io.csv.read('./live_discounts/')",
                "rows": len(pd.read_csv(os.path.join(DATA_DIR, "live_discounts.csv"))),
                "status": "streaming",
            },
            "joined": {
                "operation": "prices.join(discounts, on=product_id)",
                "rows": len(df),
                "status": "active",
            },
        },
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/api/query")
async def query_deals(request: QueryRequest):
    """RAG-style query endpoint: uses Gemini Flash to find best deals."""
    try:
        df = load_and_join_data()
        deals = deals_to_list(df)
        deals_context = json.dumps(deals, indent=2)

        # Query LLM with deal context
        answer = query_gemini(request.query, deals_context)

        # Also return relevant deals
        query_lower = request.query.lower()
        relevant = []
        for deal in deals:
            search_text = f"{deal['name']} {deal['category']} {deal['brand']}".lower()
            if any(kw in search_text for kw in query_lower.split()):
                relevant.append(deal)

        if not relevant:
            relevant = sorted(deals, key=lambda d: d["savings_percent"], reverse=True)[:5]

        return QueryResponse(
            answer=answer,
            deals=relevant[:5],
            query=request.query,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Serve Frontend Static Files ────────────────────────────────────────────

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("[EcoHunt AI] FastAPI Bridge Server")
    print("=" * 60)
    print(f"[DATA] Directory: {DATA_DIR}")
    gemini_status = 'configured' if GEMINI_API_KEY else 'not set (using mock responses)'
    print(f"[LLM]  Gemini API: {gemini_status}")
    print(f"       Set GEMINI_API_KEY env var to enable Gemini Flash")
    print(f"[API]  http://localhost:8000")
    print(f"[APP]  http://localhost:8000/app")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)
