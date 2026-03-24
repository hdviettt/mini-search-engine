"""Porter stemmer — reduces words to their root form.

Based on the original Porter (1980) algorithm. Implemented from scratch
for educational clarity rather than using NLTK/snowball.

Examples:
    "running"  → "run"
    "played"   → "play"
    "happiness" → "happi"
    "football"  → "footbal"  (not perfect, but consistent)

The key insight: both index-time and query-time stemming must use the
SAME algorithm. If we stem "running" → "run" at index time, we must
also stem "running" → "run" at query time for matching to work.
"""

import re


def _measure(stem: str) -> int:
    """Count the number of VC (vowel-consonant) sequences in stem."""
    cv = re.sub(r"[aeiou]+", "V", stem)
    cv = re.sub(r"[^V]+", "C", cv)
    return cv.count("CV")


def _has_vowel(stem: str) -> bool:
    return bool(re.search(r"[aeiou]", stem))


def _ends_double_consonant(stem: str) -> bool:
    return len(stem) >= 2 and stem[-1] == stem[-2] and stem[-1] not in "aeiou"


def _ends_cvc(stem: str) -> bool:
    """Ends consonant-vowel-consonant where final C is not w, x, or y."""
    if len(stem) < 3:
        return False
    c1, v, c2 = stem[-3], stem[-2], stem[-1]
    return (c1 not in "aeiou" and v in "aeiou" and c2 not in "aeiouwxy")


def _step1a(word: str) -> str:
    if word.endswith("sses"):
        return word[:-2]
    if word.endswith("ies"):
        return word[:-2]
    if word.endswith("ss"):
        return word
    if word.endswith("s"):
        return word[:-1]
    return word


def _step1b(word: str) -> str:
    if word.endswith("eed"):
        stem = word[:-3]
        if _measure(stem) > 0:
            return word[:-1]
        return word

    changed = False
    if word.endswith("ed"):
        stem = word[:-2]
        if _has_vowel(stem):
            word = stem
            changed = True
    elif word.endswith("ing"):
        stem = word[:-3]
        if _has_vowel(stem):
            word = stem
            changed = True

    if changed:
        if word.endswith(("at", "bl", "iz")):
            return word + "e"
        if _ends_double_consonant(word) and not word.endswith(("l", "s", "z")):
            return word[:-1]
        if _measure(word) == 1 and _ends_cvc(word):
            return word + "e"

    return word


def _step1c(word: str) -> str:
    if word.endswith("y") and _has_vowel(word[:-1]):
        return word[:-1] + "i"
    return word


_STEP2_MAP = {
    "ational": "ate", "tional": "tion", "enci": "ence", "anci": "ance",
    "izer": "ize", "abli": "able", "alli": "al", "entli": "ent",
    "eli": "e", "ousli": "ous", "ization": "ize", "ation": "ate",
    "ator": "ate", "alism": "al", "iveness": "ive", "fulness": "ful",
    "ousness": "ous", "aliti": "al", "iviti": "ive", "biliti": "ble",
}


def _step2(word: str) -> str:
    for suffix, replacement in _STEP2_MAP.items():
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 0:
                return stem + replacement
    return word


_STEP3_MAP = {
    "icate": "ic", "ative": "", "alize": "al", "iciti": "ic",
    "ical": "ic", "ful": "", "ness": "",
}


def _step3(word: str) -> str:
    for suffix, replacement in _STEP3_MAP.items():
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 0:
                return stem + replacement
    return word


_STEP4_SUFFIXES = [
    "al", "ance", "ence", "er", "ic", "able", "ible", "ant",
    "ement", "ment", "ent", "ion", "ou", "ism", "ate", "iti",
    "ous", "ive", "ize",
]


def _step4(word: str) -> str:
    for suffix in _STEP4_SUFFIXES:
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if suffix == "ion" and stem and stem[-1] in "st":
                if _measure(stem) > 1:
                    return stem
            elif _measure(stem) > 1:
                return stem
    return word


def _step5a(word: str) -> str:
    if word.endswith("e"):
        stem = word[:-1]
        if _measure(stem) > 1:
            return stem
        if _measure(stem) == 1 and not _ends_cvc(stem):
            return stem
    return word


def _step5b(word: str) -> str:
    if _measure(word) > 1 and _ends_double_consonant(word) and word.endswith("l"):
        return word[:-1]
    return word


def stem(word: str) -> str:
    """Apply the Porter stemming algorithm to a single word."""
    if len(word) <= 2:
        return word

    word = word.lower()
    word = _step1a(word)
    word = _step1b(word)
    word = _step1c(word)
    word = _step2(word)
    word = _step3(word)
    word = _step4(word)
    word = _step5a(word)
    word = _step5b(word)
    return word
