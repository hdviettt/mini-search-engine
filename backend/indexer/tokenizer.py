import re

from indexer.stemmer import stem

# Common English stopwords — words too frequent to be useful for search
STOPWORDS = frozenset({
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


def tokenize(text: str) -> list[str]:
    """Convert text into a list of normalized, stemmed tokens.

    Pipeline: lowercase → keep alphanumeric → split → remove stopwords → stem
    Stemming ensures "running", "runs", "ran" all reduce to "run".
    """
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = text.split()
    return [stem(t) for t in tokens if t not in STOPWORDS and len(t) > 1]
