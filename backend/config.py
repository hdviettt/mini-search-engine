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
    # ── Wikipedia super-hubs (300-600 outgoing links each) ──
    "https://en.wikipedia.org/wiki/List_of_association_football_records",
    "https://en.wikipedia.org/wiki/List_of_association_football_competitions",
    "https://en.wikipedia.org/wiki/List_of_top-division_football_clubs_in_UEFA_countries",
    "https://en.wikipedia.org/wiki/List_of_men%27s_national_association_football_teams",
    "https://en.wikipedia.org/wiki/FIFA_World_Cup_records_and_statistics",
    "https://en.wikipedia.org/wiki/List_of_UEFA_Champions_League_records_and_statistics",

    # ── Wikipedia competitions & leagues ──
    "https://en.wikipedia.org/wiki/FIFA_World_Cup",
    "https://en.wikipedia.org/wiki/UEFA_Champions_League",
    "https://en.wikipedia.org/wiki/UEFA_Europa_League",
    "https://en.wikipedia.org/wiki/UEFA_European_Championship",
    "https://en.wikipedia.org/wiki/Copa_Am%C3%A9rica",
    "https://en.wikipedia.org/wiki/Africa_Cup_of_Nations",
    "https://en.wikipedia.org/wiki/Premier_League",
    "https://en.wikipedia.org/wiki/La_Liga",
    "https://en.wikipedia.org/wiki/Serie_A",
    "https://en.wikipedia.org/wiki/Bundesliga",
    "https://en.wikipedia.org/wiki/Ligue_1",

    # ── Wikipedia players & awards ──
    "https://en.wikipedia.org/wiki/Ballon_d%27Or",
    "https://en.wikipedia.org/wiki/Lionel_Messi",
    "https://en.wikipedia.org/wiki/Cristiano_Ronaldo",
    "https://en.wikipedia.org/wiki/Kylian_Mbapp%C3%A9",
    "https://en.wikipedia.org/wiki/Erling_Haaland",

    # ── Wikipedia fundamentals ──
    "https://en.wikipedia.org/wiki/Association_football",
    "https://en.wikipedia.org/wiki/History_of_association_football",
    "https://en.wikipedia.org/wiki/Association_football_tactics_and_skills",
    "https://en.wikipedia.org/wiki/List_of_association_football_stadiums_by_capacity",

    # ── News: BBC Sport ──
    "https://www.bbc.com/sport/football",
    "https://www.bbc.com/sport/football/premier-league",
    "https://www.bbc.com/sport/football/champions-league",

    # ── News: ESPN Soccer ──
    "https://www.espn.com/soccer/",

    # ── News: Sky Sports ──
    "https://www.skysports.com/football",

    # ── News: The Guardian ──
    "https://www.theguardian.com/football",

    # ── Data: Transfermarkt ──
    "https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1",
    "https://www.transfermarkt.com/laliga/startseite/wettbewerb/ES1",
    "https://www.transfermarkt.com/serie-a/startseite/wettbewerb/IT1",

    # ── Stats: FBref (clean HTML, no JS, all football data) ──
    "https://fbref.com/en/comps/9/Premier-League-Stats",
    "https://fbref.com/en/comps/12/La-Liga-Stats",
    "https://fbref.com/en/comps/11/Serie-A-Stats",
    "https://fbref.com/en/comps/20/Bundesliga-Stats",
    "https://fbref.com/en/comps/13/Ligue-1-Stats",
    "https://fbref.com/en/comps/8/Champions-League-Stats",
]
ALLOWED_DOMAINS = [
    "en.wikipedia.org",
    "www.bbc.com",
    "www.espn.com",
    "www.skysports.com",
    "www.theguardian.com",
    "www.transfermarkt.com",
    "fbref.com",
    # Dropped: www.goal.com (404/JS SPA), www.givemesport.com (bot-blocked),
    #          www.fourfourtwo.com (broken URL structure)
]
MAX_PAGES = 3000
MAX_DEPTH = 3
CRAWL_DELAY = 1.5  # seconds between requests to same domain
USER_AGENT = "Mozilla/5.0 (compatible; VietSearchBot/1.0; +https://github.com/hdviettt/mini-search-engine)"
REQUEST_TIMEOUT = 10  # seconds

# URL filtering — only crawl football-related paths
# Wikipedia is handled separately via WIKIPEDIA_FOOTBALL_KEYWORDS in crawler/manager.py
ALLOWED_PATH_PATTERNS = [
    "/sport/football",   # BBC
    "/soccer/",          # ESPN
    "/football",         # Sky Sports, Guardian
    "/en/",              # FBref (all stats pages under /en/)
    "/",                 # Transfermarkt (all football)
]

# Wikipedia: only crawl pages whose URL path contains a football-related keyword
WIKIPEDIA_FOOTBALL_KEYWORDS = [
    "football", "soccer", "fifa", "uefa", "conmebol", "concacaf", "afc_",
    "premier_league", "la_liga", "serie_a", "bundesliga", "ligue_1",
    "eredivisie", "primeira_liga", "mls",
    "champions_league", "europa_league", "world_cup", "copa_am",
    "euro_", "european_championship",
    "ballon_d", "golden_boot", "golden_ball", "golden_glove",
    # Club patterns
    "f.c.", "fc_", "a.f.c.", "s.c._", "cf_",
    "_united_f", "_city_f", "_athletic", "_sporting",
    "_national_football", "_football_club", "_football_team",
    "_stadium", "_derby", "_season",
    "_transfer", "_goalkeeper", "_midfielder", "_striker", "_defender",
    "_forward_", "_winger", "_manager",
    # Player/records patterns
    "_footballer", "_football_career", "_international_goal",
    "_cap_", "_goal_scorer",
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

# Ranking combination weight (0.8 = 80% BM25, 20% PageRank)
# Higher BM25 weight reduces Wikipedia link-graph bias for sports queries
RANK_ALPHA = 0.8

# Freshness signal — exponential decay: floor + (1-floor)*exp(-days*decay)
# Pages < 7 days old receive a 1.15x bonus to surface recent news
FRESHNESS_DECAY = 0.02   # decay constant (90 days old ≈ 0.58 multiplier)
FRESHNESS_FLOOR = 0.5    # minimum multiplier for very stale content

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
