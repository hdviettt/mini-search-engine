import os
from pathlib import Path

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

    # ── News ──
    # Chosen on measured article yield: how many words the parser actually
    # extracts from a story page. Hub pages are link lists and yield almost
    # nothing everywhere, so counting their bytes or their links says nothing
    # about a source. That mistake is what put five JS-rendered sites on this
    # list; the rejection table under ALLOWED_DOMAINS records each one.
    #
    #   source          indexed/crawled   median article
    #   football365          (new)           607 words
    #   mirror.co.uk         67/68 = 99%     603 words
    #   teamtalk             (new)           428 words
    #   caughtoffside        (new)           407 words
    #   independent.co.uk    62/69 = 90%     345 words
    #   skysports.com        72/145 = 50%
    "https://www.football365.com/",
    "https://www.football365.com/news",
    "https://www.teamtalk.com/",
    "https://www.teamtalk.com/news",
    "https://www.caughtoffside.com/",
    "https://www.mirror.co.uk/sport/football/",
    "https://www.independent.co.uk/sport/football",
    "https://www.skysports.com/football",
    "https://www.skysports.com/football/news",
    "https://www.skysports.com/premier-league-news",
]
ALLOWED_DOMAINS = [
    "en.wikipedia.org",
    "www.football365.com",
    "www.teamtalk.com",
    "www.caughtoffside.com",
    "www.mirror.co.uk",
    "www.independent.co.uk",
    "www.skysports.com",
    # Removed, with the measurement that removed them. Each answers 200 with
    # plenty of bytes and plenty of links, then renders its article text in the
    # browser, so the crawler stores a shell. The fraction is pages that passed
    # the quality gate out of pages crawled.
    #
    #   www.bbc.com            0/24   median 0 chars of extracted body
    #   www.espn.com           0/46   median 129 chars
    #   www.theguardian.com    1/60   median 0 chars
    #   www.goal.com           0/39   median 62 chars
    #   www.premierleague.com  0/2    median 44 chars
    #   www.uefa.com          11/73   mostly JS, median 233 chars
    #   talksport.com                 disallowed by robots.txt
    #   www.sportsmole.co.uk          403
    #   www.transfermarkt.com         405 to any bot UA
    #   fbref.com                     403
    #   www.reuters.com               401
    #   apnews.com                    403
    #   www.90min.com                 404 on its football hub
    #   www.eurosport.com             JS shell
    #   www.fourfourtwo.com           JS shell, 0 words extracted
    #
    # Pages already crawled from these domains stay in the index if they passed
    # the quality gate. Dropping a source stops us fetching more of it; it is
    # not a reason to discard content that is already good.
]
MAX_PAGES = 3000
MAX_DEPTH = 3
CRAWL_DELAY = 1.5  # seconds between requests to same domain
USER_AGENT = "Mozilla/5.0 (compatible; MiniSearchBot/1.0; +https://github.com/hdviettt/mini-search-engine)"
REQUEST_TIMEOUT = 10  # seconds

# URL filtering — only crawl football-related paths.
#
# Per domain, not one global list, and that matters. A shared list was used
# once and it had two failure modes. A bare "/" entry added for Transfermarkt
# matched every path on every host, making the whole filter a no-op. Then a
# "/news" entry added for premierleague.com matched bbc.com/news, which is how
# "Pound Sterling (GBP) - BBC News" and "Ukraine War - BBC News" ended up in a
# football index and then ranked for "bbc sport football".
#
# A path pattern is only ever meaningful for the site it was written for.
# "*" means the whole site is in scope. Honest for a site that publishes only
# football, and not the same trap as the bare "/" that used to sit in the
# shared list: this applies solely to the domain it is written under.
DOMAIN_PATH_PATTERNS = {
    "www.football365.com":   ["*"],
    "www.teamtalk.com":      ["*"],
    "www.caughtoffside.com": ["*"],
    "www.skysports.com":     ["/football", "/premier-league"],
    "www.mirror.co.uk":      ["/sport/football"],
    "www.independent.co.uk": ["/sport/football"],
}
# Applied to an allowed domain that has no entry above. Conservative, because
# an unlisted domain is one nobody has looked at yet.
ALLOWED_PATH_PATTERNS = ["/football", "/soccer"]

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
#
# Read what this is actually measuring before tuning it. The input is
# COALESCE(last_checked_at, crawled_at): when *we* last fetched the page, not
# when it was written or updated. Those are different things, and conflating
# them makes crawl scheduling leak into relevance.
#
# With a floor of 0.5 the swing was 2.4x, from 1.2 for anything fetched this
# week down to 0.5 for anything fetched six months ago. A single crawl that
# added 300 news pages therefore demoted the entire reference corpus by
# construction: "offside rule" started returning Independent and Mirror
# comment pieces above "Offside (association football)", not because they are
# better answers but because they had been fetched more recently.
#
# Narrowed to a 0.85-1.0 band until freshness is computed from a published
# date rather than a crawl date. It should be a tiebreak between comparable
# results, not a signal strong enough to reorder the corpus.
FRESHNESS_DECAY = 0.02   # decay constant (90 days old ≈ 0.91 multiplier)
FRESHNESS_FLOOR = 0.85   # minimum multiplier for content we fetched long ago

# PageRank
PAGERANK_DAMPING = 0.85
PAGERANK_ITERATIONS = 20

# AI Overview (Groq)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
# Groq retires models without warning and the endpoint answers 404 with
# `model_not_found`, which looked exactly like an outage: AI Overviews
# returned null for days while the key was fine and /api/overview still
# answered 200. llama-3.3-70b-versatile went that way in September 2026.
# If overviews stop again, check this first:
#   curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# Embeddings (Voyage AI)
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "")
VOYAGE_MODEL = os.getenv("VOYAGE_MODEL", "voyage-3-lite")
VOYAGE_DIMENSIONS = 512

# Headroom, not a target. The prompt asks for two to three sentences, so the
# visible answer is bounded by the instruction and Groq bills what is actually
# generated. The cap exists to stop a runaway, and on a reasoning model it also
# has to cover the thinking: at 300 the model hit finish_reason=length after
# only 355 visible characters on "premier league history", because reasoning
# tokens come out of the same budget. Do not lower this below about 800.
AI_OVERVIEW_MAX_TOKENS = 1000
AI_CACHE_TTL_HOURS = 24

