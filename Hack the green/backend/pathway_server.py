"""
EcoHunt AI - Pathway Real-Time Deal Processing Pipeline
========================================================
Uses Pathway's real-time connectors to ingest live_prices.csv and live_discounts.csv,
join them to calculate best deals, and expose a REST API via Pathway's HTTP connector.

NOTE: Pathway requires Linux/macOS. Use WSL or Docker on Windows.
Run: python pathway_server.py
"""

import pathway as pw
import json


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PriceSchema(pw.Schema):
    product_id: str
    name: str
    category: str
    base_price: float
    current_price: float
    unit: str
    eco_rating: float
    brand: str


class DiscountSchema(pw.Schema):
    product_id: str
    discount_code: str
    discount_percent: float
    valid_until: str
    flash_sale: bool


class QuerySchema(pw.Schema):
    query: str


# ─── Data Ingestion ──────────────────────────────────────────────────────────

# Pathway monitors these directories for CSV file changes in real-time
prices = pw.io.csv.read(
    "./data/live_prices/",
    schema=PriceSchema,
    mode="streaming",
    autocommit_duration_ms=1000,
)

discounts = pw.io.csv.read(
    "./data/live_discounts/",
    schema=DiscountSchema,
    mode="streaming",
    autocommit_duration_ms=1000,
)


# ─── Real-Time Join ─────────────────────────────────────────────────────────

# Join prices and discounts on product_id
joined = prices.join(
    discounts,
    pw.left.product_id == pw.right.product_id,
).select(
    product_id=pw.left.product_id,
    name=pw.left.name,
    category=pw.left.category,
    base_price=pw.left.base_price,
    current_price=pw.left.current_price,
    unit=pw.left.unit,
    eco_rating=pw.left.eco_rating,
    brand=pw.left.brand,
    discount_code=pw.right.discount_code,
    discount_percent=pw.right.discount_percent,
    valid_until=pw.right.valid_until,
    flash_sale=pw.right.flash_sale,
)


# ─── Compute Final Prices ───────────────────────────────────────────────────

deals = joined.select(
    *pw.this,
    final_price=pw.this.current_price * (1.0 - pw.this.discount_percent / 100.0),
    savings=pw.this.base_price - pw.this.current_price * (1.0 - pw.this.discount_percent / 100.0),
    savings_percent=((pw.this.base_price - pw.this.current_price * (1.0 - pw.this.discount_percent / 100.0)) / pw.this.base_price * 100.0),
)


# ─── Output: Write joined deals to CSV ──────────────────────────────────────

pw.io.csv.write(deals, "./output/joined_deals.csv")


# ─── REST API via Pathway HTTP Connector ─────────────────────────────────────

webserver = pw.io.http.PathwayWebserver(
    host="0.0.0.0",
    port=8080,
)

# Query endpoint: accepts POST with {"query": "..."} and returns matching deals
queries, response_writer = pw.io.http.rest_connector(
    webserver=webserver,
    route="/query",
    schema=QuerySchema,
    methods=("POST",),
)


# Simple keyword matching for deal search
@pw.udf
def search_deals(query: str, deal_data: str) -> str:
    """Search deals based on query keywords and return best matches."""
    import json as j
    try:
        deals_list = j.loads(deal_data)
        query_lower = query.lower()
        keywords = query_lower.split()

        scored = []
        for deal in deals_list:
            score = 0
            deal_text = f"{deal['name']} {deal['category']} {deal['brand']}".lower()
            for kw in keywords:
                if kw in deal_text:
                    score += 1
            if score > 0:
                scored.append((score, deal))

        scored.sort(key=lambda x: (-x[0], -x[1].get('savings_percent', 0)))
        top = [d for _, d in scored[:5]]

        if not top:
            return j.dumps({"message": "No matching deals found.", "deals": []})
        return j.dumps({"message": f"Found {len(top)} deals!", "deals": top})
    except Exception as e:
        return j.dumps({"message": f"Error: {str(e)}", "deals": []})


# Convert deals table to JSON for searching
deals_json = deals.reduce(
    data=pw.reducers.sorted_tuple(
        pw.this.product_id,
    )
)

# Process query responses
results = queries.select(
    result=search_deals(pw.this.query, "[]"),
)

response_writer(results)


# ─── Run the Pathway Engine ─────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("🌿 EcoHunt AI - Pathway Real-Time Deal Engine")
    print("=" * 60)
    print("📡 Ingesting: ./data/live_prices/")
    print("📡 Ingesting: ./data/live_discounts/")
    print("🔗 Joining streams in real-time...")
    print("🌐 REST API: http://0.0.0.0:8080/query")
    print("📄 Output:   ./output/joined_deals.csv")
    print("=" * 60)
    pw.run(monitoring_level=pw.MonitoringLevel.NONE)
