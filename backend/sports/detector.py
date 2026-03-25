"""Sports query detector — pure keyword matching, no DB, no LLM.

Detects when a search query is about live matches, upcoming fixtures,
or league standings by matching against known team/league names and
sports action keywords.
"""

# Team name → API-Football team ID
TEAM_MAP: dict[str, int] = {
    # Premier League
    "arsenal": 42, "manchester united": 33, "man utd": 33, "man united": 33,
    "liverpool": 40, "chelsea": 49, "manchester city": 50, "man city": 50,
    "tottenham": 47, "spurs": 47, "newcastle": 34, "newcastle united": 34,
    "aston villa": 66, "west ham": 48, "brighton": 51, "crystal palace": 52,
    "wolves": 39, "wolverhampton": 39, "everton": 45, "fulham": 36,
    "bournemouth": 35, "brentford": 55, "nottingham forest": 65,
    # La Liga
    "barcelona": 529, "barca": 529, "real madrid": 541, "atletico madrid": 530,
    "sevilla": 536, "villarreal": 533, "real sociedad": 548, "athletic bilbao": 531,
    # Serie A
    "ac milan": 489, "inter milan": 505, "inter": 505, "juventus": 496,
    "napoli": 492, "roma": 497, "as roma": 497, "lazio": 487, "atalanta": 499,
    # Bundesliga
    "bayern munich": 157, "bayern": 157, "borussia dortmund": 165, "dortmund": 165,
    "rb leipzig": 173, "bayer leverkusen": 168, "leverkusen": 168,
    # Ligue 1
    "psg": 85, "paris saint-germain": 85, "marseille": 81, "lyon": 80,
    "monaco": 91,
    # Other
    "benfica": 211, "porto": 212, "sporting": 228, "ajax": 194,
    "celtic": 247, "rangers": 257,
    # Vietnam
    "hoang anh gia lai": 2890, "hagl": 2890, "ha noi fc": 2898,
}

# League name → API-Football league ID
LEAGUE_MAP: dict[str, int] = {
    "premier league": 39, "epl": 39, "english premier league": 39,
    "la liga": 140, "spanish league": 140,
    "serie a": 135, "italian league": 135,
    "bundesliga": 78, "german league": 78,
    "ligue 1": 61, "french league": 61,
    "champions league": 2, "ucl": 2, "uefa champions league": 2,
    "europa league": 3, "europa": 3,
    "eredivisie": 88, "dutch league": 88,
    "liga portugal": 94, "portuguese league": 94,
    "mls": 253,
    "v-league": 340, "v league": 340, "vietnamese league": 340,
    "world cup": 1, "fifa world cup": 1,
}

# Action keywords that indicate a sports data query
FIXTURE_KEYWORDS = {"next match", "upcoming", "fixture", "schedule", "next game", "when do", "when does"}
STANDINGS_KEYWORDS = {"standings", "table", "league table", "ranking", "rankings", "leaderboard"}
LIVE_KEYWORDS = {"live score", "live scores", "score", "scores today", "results today", "live"}
H2H_KEYWORDS = {"vs", "versus", "v.", "head to head", "h2h", "against"}


class SportsDetection:
    def __init__(self, action: str, teams: list[int], leagues: list[int], matched_name: str):
        self.action = action      # "upcoming" | "standings" | "live" | "h2h"
        self.teams = teams        # API-Football team IDs
        self.leagues = leagues    # API-Football league IDs
        self.matched_name = matched_name

    def to_dict(self) -> dict:
        return {
            "action": self.action,
            "teams": self.teams,
            "leagues": self.leagues,
            "matched_name": self.matched_name,
        }


def detect_sports(query: str) -> SportsDetection | None:
    """Detect if a query is about sports data.

    Returns SportsDetection with matched IDs and action type, or None.
    """
    q = query.lower().strip()

    # Find team matches (longest first to prefer "Manchester United" over "Manchester")
    matched_teams: list[tuple[str, int]] = []
    for name, team_id in sorted(TEAM_MAP.items(), key=lambda x: -len(x[0])):
        if name in q:
            matched_teams.append((name, team_id))
            break  # take the first (longest) match

    # Find league matches
    matched_leagues: list[tuple[str, int]] = []
    for name, league_id in sorted(LEAGUE_MAP.items(), key=lambda x: -len(x[0])):
        if name in q:
            matched_leagues.append((name, league_id))
            break

    team_ids = [t[1] for t in matched_teams]
    league_ids = [l[1] for l in matched_leagues]
    matched_name = matched_teams[0][0] if matched_teams else (matched_leagues[0][0] if matched_leagues else "")

    # Determine action based on keywords
    if any(kw in q for kw in LIVE_KEYWORDS):
        return SportsDetection("live", team_ids, league_ids, matched_name)

    if any(kw in q for kw in STANDINGS_KEYWORDS):
        if league_ids:
            return SportsDetection("standings", team_ids, league_ids, matched_name)

    if any(kw in q for kw in H2H_KEYWORDS) and len(matched_teams) >= 1:
        return SportsDetection("h2h", team_ids, league_ids, matched_name)

    if any(kw in q for kw in FIXTURE_KEYWORDS) and (team_ids or league_ids):
        return SportsDetection("upcoming", team_ids, league_ids, matched_name)

    # If just a team name with no specific keyword → show upcoming fixtures
    if team_ids and len(q.split()) <= 3:
        return SportsDetection("upcoming", team_ids, league_ids, matched_name)

    # If just a league name with no specific keyword → show standings
    if league_ids and len(q.split()) <= 4:
        return SportsDetection("standings", team_ids, league_ids, matched_name)

    return None
