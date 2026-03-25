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
    # GiveMeSport — football news & lists
    "https://www.givemesport.com/football/",
    # Sky Sports — football coverage
    "https://www.skysports.com/football",
    # Goal.com — football news
    "https://www.goal.com/en/football",
    # Transfermarkt — player/team data
    "https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1",
    # The Guardian — football section
    "https://www.theguardian.com/football",
    # FourFourTwo — football magazine
    "https://www.fourfourtwo.com/football",
]
ALLOWED_DOMAINS = [
    "en.wikipedia.org",
    "www.bbc.com",
    "www.espn.com",
    "www.givemesport.com",
    "www.skysports.com",
    "www.goal.com",
    "www.transfermarkt.com",
    "www.theguardian.com",
    "www.fourfourtwo.com",
]
MAX_PAGES = 3000
MAX_DEPTH = 3
CRAWL_DELAY = 1.5  # seconds between requests to same domain
USER_AGENT = "Mozilla/5.0 (compatible; VietSearchBot/1.0; +https://github.com/hdviettt/mini-search-engine)"
REQUEST_TIMEOUT = 10  # seconds

# URL filtering — only crawl football-related paths
ALLOWED_PATH_PATTERNS = [
    # Wikipedia: any /wiki/ page
    "/wiki/",
    # BBC: only football section
    "/sport/football",
    # ESPN: only soccer section
    "/soccer/",
    # GiveMeSport: football section
    "/football",
    # Sky Sports: football section
    "/football",
    # Goal.com: football section
    "/football",
    # Transfermarkt: any page (all football)
    "/",
    # The Guardian: football section
    "/football",
    # FourFourTwo: football section
    "/football",
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

# AI Overview (Groq)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Embeddings (Voyage AI)
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "")
VOYAGE_MODEL = os.getenv("VOYAGE_MODEL", "voyage-3-lite")
VOYAGE_DIMENSIONS = 512

AI_OVERVIEW_MAX_TOKENS = 300
AI_CACHE_TTL_HOURS = 24

# Live Sports Data (API-Football)
FOOTBALL_API_KEY = os.getenv("FOOTBALL_API_KEY", "")
