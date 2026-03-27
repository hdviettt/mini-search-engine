import re

from indexer.stemmer import stem

# Common English stopwords — words too frequent to be useful for search
_ENGLISH_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "as", "be", "was", "were",
    "are", "been", "being", "have", "has", "had", "do", "does", "did",
    "will", "would", "could", "should", "may", "might", "shall", "can",
    "not", "no", "nor", "so", "if", "then", "than", "that", "this",
    "these", "those", "what", "which", "who", "whom", "how", "when",
    "where", "why", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "only", "own", "same", "too",
    "very", "just", "about", "above", "after", "again", "also", "any",
    "because", "before", "between", "below", "during", "into", "its",
    "out", "over", "through", "under", "until", "up", "while", "he",
    "she", "they", "we", "you", "me", "him", "her", "us", "them",
    "my", "your", "his", "our", "their", "here", "there",
})

# Wikipedia metadata and web noise that leaks through HTML parsing
_WIKI_WEB_STOPWORDS = frozenset({
    # Wikipedia editing/citation metadata
    "edit", "edited", "retrieved", "archived", "accessed", "cite",
    "citation", "isbn", "issn", "doi", "pmid", "oclc",
    "original", "wayback", "pdf",
    # Web infrastructure noise
    "http", "https", "www", "com", "org", "html", "htm", "php",
    # Web boilerplate
    "cookie", "cookies", "privacy", "policy", "subscribe", "newsletter",
    "login", "signup", "register", "advertisement", "sponsored",
    "share", "tweet", "facebook", "twitter", "instagram",
    # Navigation noise
    "menu", "previous", "next", "skip", "navigation",
})

STOPWORDS = _ENGLISH_STOPWORDS | _WIKI_WEB_STOPWORDS


def tokenize(text: str) -> list[str]:
    """Convert text into a list of normalized, stemmed tokens.

    Pipeline: lowercase → normalize seasons → keep alphanumeric → split → filter → stem
    Filters: stopwords, pure numbers (except 4-digit years), length bounds (2-30 chars).
    Stemming ensures "running", "runs", "ran" all reduce to "run".
    """
    text = text.lower()
    # Normalize season strings: "2024/25" or "2024-25" → "2024" (keep the base year)
    text = re.sub(r"\b(\d{4})[/\-]\d{2}\b", r"\1", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = text.split()
    return [
        stem(t) for t in tokens
        if t not in STOPWORDS
        and 2 <= len(t) <= 30
        and not (t.isdigit() and not (len(t) == 4 and t[:2] in ("19", "20")))
    ]
