"""Corpus-aware spell corrector using page title vocabulary + edit distance."""
import re
import threading


def _levenshtein(a: str, b: str, cutoff: int = 2) -> int:
    """Compute Levenshtein distance; returns cutoff+1 immediately if impossible."""
    if abs(len(a) - len(b)) > cutoff:
        return cutoff + 1
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            temp = dp[j]
            dp[j] = prev if a[i - 1] == b[j - 1] else 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
        if min(dp) > cutoff:
            return cutoff + 1
    return dp[n]


class SpellChecker:
    """Spell corrector built from words extracted from page titles.

    Vocabulary is loaded lazily on first use and cached in memory.
    Uses edit distance ≤ 2 to find the closest known word.
    Length-bucketed lookup keeps correction to < 5ms for typical queries.
    """

    def __init__(self):
        self._vocab: set[str] = set()
        self._by_len: dict[int, list[str]] = {}
        self._freq: dict[str, int] = {}
        self._loaded = False
        self._lock = threading.Lock()

    def _load(self, conn):
        # No LIMIT. It was 5000 while the corpus was already larger, so the
        # tail of the index was invisible to the corrector.
        rows = conn.execute(
            "SELECT title FROM pages WHERE title IS NOT NULL AND is_dead = false"
        ).fetchall()
        words: set[str] = set()
        freq: dict[str, int] = {}
        for (title,) in rows:
            for raw in title.split():
                word = re.sub(r"[^a-z]", "", raw.lower())
                if 3 <= len(word) <= 20:
                    words.add(word)
                    # How often a word appears across page titles. Titles are
                    # where entity names live, so this is a good stand-in for
                    # "how likely was this the intended word", and it is cheap
                    # next to counting postings over 3.5M rows.
                    freq[word] = freq.get(word, 0) + 1

        # Add all indexed stems — these are known-valid words (player names, entities, etc.)
        # Any word whose stem appears in the index is treated as valid and won't be over-corrected.
        term_rows = conn.execute("SELECT term FROM terms").fetchall()
        for (term,) in term_rows:
            if 3 <= len(term) <= 20:
                words.add(term)

        by_len: dict[int, list[str]] = {}
        for w in words:
            by_len.setdefault(len(w), []).append(w)
        self._vocab = words
        self._by_len = by_len
        self._freq = freq
        self._loaded = True

    def correct_query(self, query: str, conn) -> str | None:
        """Return a corrected query string, or None if no correction is needed.

        Each word is checked against the vocab; any word not found and within
        edit distance 2 of a known word is replaced with the closest match.
        """
        with self._lock:
            if not self._loaded:
                self._load(conn)

        words = query.lower().split()
        corrected: list[str] = []
        any_changed = False

        for word in words:
            clean = re.sub(r"[^a-z]", "", word)
            if not clean or len(clean) < 3:
                corrected.append(word)
                continue

            if clean in self._vocab:
                corrected.append(word)
                continue

            # Closest word within edit distance 2, ties broken by how common
            # the word is.
            #
            # Distance alone is not enough to pick a winner. In a 200k-word
            # vocabulary a great many words sit exactly two edits from any
            # given typo, and the old `d < best_dist` test kept whichever one
            # set iteration happened to reach first. "premeir league" is two
            # edits from "premier", and also from a pile of words nobody meant;
            # it drew one of those and the query stayed broken.
            best: str | None = None
            best_key: tuple[int, int] | None = None
            wlen = len(clean)
            candidates: list[str] = []
            for delta in range(-2, 3):
                candidates.extend(self._by_len.get(wlen + delta, []))

            for candidate in candidates:
                d = _levenshtein(clean, candidate, cutoff=2)
                if d > 2:
                    continue
                # Smaller distance wins; at equal distance, the word that
                # appears in more page titles wins.
                key = (d, -self._freq.get(candidate, 0))
                if best_key is None or key < best_key:
                    best_key = key
                    best = candidate

            if best:
                corrected.append(best)
                any_changed = True
            else:
                corrected.append(word)

        return " ".join(corrected) if any_changed else None

    def invalidate(self):
        """Force vocab reload on next call (e.g. after a crawl adds new pages)."""
        with self._lock:
            self._loaded = False


spell_checker = SpellChecker()
