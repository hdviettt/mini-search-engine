from pathlib import Path
import os

from dotenv import load_dotenv

load_dotenv()

# Paths
BASE_DIR = Path(__file__).parent

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://searchengine:searchengine@localhost:5432/searchengine")

# Crawler settings
SEED_URLS = [
    # Wikipedia — football overview pages
    "https://en.wikipedia.org/wiki/Association_football",
    "https://en.wikipedia.org/wiki/FIFA_World_Cup",
    "https://en.wikipedia.org/wiki/UEFA_Champions_League",
    "https://en.wikipedia.org/wiki/Premier_League",
    "https://en.wikipedia.org/wiki/La_Liga",
    "https://en.wikipedia.org/wiki/Lionel_Messi",
    "https://en.wikipedia.org/wiki/Cristiano_Ronaldo",
    # BBC Sport Football
    "https://www.bbc.com/sport/football",
    "https://www.bbc.com/sport/football/premier-league",
    "https://www.bbc.com/sport/football/champions-league",
    # ESPN Soccer
    "https://www.espn.com/soccer/",
]
ALLOWED_DOMAINS = [
    "en.wikipedia.org",
    "www.bbc.com",
    "www.espn.com",
]
MAX_PAGES = 1000
MAX_DEPTH = 3
CRAWL_DELAY = 1.5  # seconds between requests to same domain
USER_AGENT = "Mozilla/5.0 (compatible; VietSearchBot/1.0; +https://github.com/hdviettt/mini-search-engine)"
REQUEST_TIMEOUT = 10  # seconds

# URL filtering — only crawl football-related paths
ALLOWED_PATH_PATTERNS = [
    # Wikipedia: any /wiki/ page (we filter by football content later)
    "/wiki/",
    # BBC: only football section
    "/sport/football",
    # ESPN: only soccer section
    "/soccer/",
]

# Spam/junk domain blocklist
BLOCKED_DOMAINS = [
    "bet365.com", "betfair.com", "williamhill.com", "paddypower.com",
    "bwin.com", "888sport.com", "unibet.com", "betway.com",
    "draftkings.com", "fanduel.com",
]

# BM25 parameters
BM25_K1 = 1.2
BM25_B = 0.75

# Ranking combination weight (0.7 = 70% BM25, 30% PageRank)
RANK_ALPHA = 0.7

# PageRank
PAGERANK_DAMPING = 0.85
PAGERANK_ITERATIONS = 20

# AI Overview (Ollama + Qwen3)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:4b")
AI_OVERVIEW_MAX_TOKENS = 300
AI_CACHE_TTL_HOURS = 24
