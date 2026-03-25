import hashlib
import re
from urllib.parse import urljoin, urlparse, urldefrag

from lxml import html


# Elements to remove entirely before text extraction
_STRIP_TAGS = [
    "script", "style", "nav", "footer", "header", "noscript",
    "aside",       # sidebars
    "iframe",      # embedded content
    "svg",         # icons
    "figure",      # images with captions (often noisy)
]

# CSS class/id patterns that indicate boilerplate (not article content)
_BOILERPLATE_PATTERNS = [
    # Wikipedia
    "sidebar", "navbox", "infobox", "mw-jump-link", "reflist", "references",
    "catlinks", "toc", "mw-editsection", "external_links", "see_also",
    "mw-navigation", "mw-panel", "portal", "sister-project", "authority-control",
    "noprint", "metadata", "hatnote", "ambox", "dmbox", "tmbox", "fmbox",
    # Generic
    "breadcrumb", "cookie", "popup", "modal", "social-share", "share-bar",
    "newsletter", "related-articles", "comments", "ad-", "advertisement",
    "footer", "sidebar", "widget", "menu", "dropdown",
]


def _is_boilerplate(element) -> bool:
    """Check if an element is boilerplate based on its class/id attributes."""
    classes = (element.get("class") or "").lower()
    elem_id = (element.get("id") or "").lower()
    role = (element.get("role") or "").lower()

    combined = f"{classes} {elem_id} {role}"

    for pattern in _BOILERPLATE_PATTERNS:
        if pattern in combined:
            return True

    return False


def _find_main_content(tree) -> str:
    """Extract the main article content, stripping boilerplate.

    Strategy:
    1. Look for <main>, <article>, or content-specific containers
    2. If found, extract text from there (much cleaner)
    3. Fallback: use full body but strip more aggressively
    """
    # Try to find the main content container
    candidates = [
        # Wikipedia
        '//div[@id="mw-content-text"]',
        '//div[@id="bodyContent"]',
        # Generic article containers
        "//article",
        "//main",
        '//div[@role="main"]',
        '//div[contains(@class, "article-body")]',
        '//div[contains(@class, "post-content")]',
        '//div[contains(@class, "entry-content")]',
        '//div[contains(@class, "story-body")]',
        '//div[contains(@class, "content-body")]',
    ]

    content_root = None
    for xpath in candidates:
        elements = tree.xpath(xpath)
        if elements:
            content_root = elements[0]
            break

    if content_root is None:
        # Fallback: use <body> or entire tree
        bodies = tree.xpath("//body")
        content_root = bodies[0] if bodies else tree

    return content_root


def parse_page(url: str, raw_html: str) -> dict:
    """Parse HTML into structured data: title, clean body text, and links."""
    tree = html.fromstring(raw_html)

    # Extract title
    title_elements = tree.xpath("//title/text()")
    title = title_elements[0].strip() if title_elements else ""

    # Remove noisy tags entirely
    for tag in tree.xpath(" | ".join(f"//{t}" for t in _STRIP_TAGS)):
        parent = tag.getparent()
        if parent is not None:
            parent.remove(tag)

    # Remove boilerplate elements (sidebars, navboxes, references, etc.)
    for element in tree.xpath("//*"):
        if _is_boilerplate(element):
            parent = element.getparent()
            if parent is not None:
                parent.remove(element)

    # Find main content container
    content_root = _find_main_content(tree)

    # Extract text from main content only
    body_text = content_root.text_content()

    # Clean up whitespace
    body_text = re.sub(r"\s+", " ", body_text).strip()

    # Remove common Wikipedia trailing noise
    # Cut at "References" or "External links" section if present
    for marker in ["References[edit]", "References [edit]", "External links[edit]",
                    "External links [edit]", "See also[edit]", "See also [edit]",
                    " References ", " External links "]:
        idx = body_text.find(marker)
        if idx > 500:  # only cut if there's enough content before it
            body_text = body_text[:idx].strip()
            break

    # Extract links (from full tree, not just content)
    links = set()
    for element in tree.xpath("//a[@href]"):
        href = element.get("href", "").strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        absolute_url = urljoin(url, href)
        absolute_url, _ = urldefrag(absolute_url)
        if urlparse(absolute_url).scheme in ("http", "https"):
            links.add(absolute_url)

    content_hash = hashlib.md5(body_text.encode()).hexdigest()

    return {
        "title": title,
        "body_text": body_text,
        "links": links,
        "content_hash": content_hash,
    }
