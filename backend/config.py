from pathlib import Path
import os

from dotenv import load_dotenv

load_dotenv()

# Paths
BASE_DIR = Path(__file__).parent

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://searchengine:searchengine@localhost:5432/searchengine")

# Crawler settings
SEED_URLS = ["https://en.wikipedia.org/wiki/Search_engine_optimization"]
ALLOWED_DOMAINS = ["en.wikipedia.org"]
MAX_PAGES = 1000
MAX_DEPTH = 4
CRAWL_DELAY = 1.5  # seconds between requests to same domain
USER_AGENT = "VietSearchBot/1.0 (learning project; github.com/viet)"
REQUEST_TIMEOUT = 10  # seconds

# BM25 parameters
BM25_K1 = 1.2
BM25_B = 0.75

# Ranking combination weight (0.7 = 70% BM25, 30% PageRank)
RANK_ALPHA = 0.7

# PageRank
PAGERANK_DAMPING = 0.85
PAGERANK_ITERATIONS = 20

# AI Overview
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-20250514"
AI_OVERVIEW_MAX_TOKENS = 300
AI_CACHE_TTL_HOURS = 24
