import hashlib
import re
from urllib.parse import urljoin, urlparse, urldefrag

from lxml import html


def parse_page(url: str, raw_html: str) -> dict:
    """Parse HTML into structured data: title, body text, and links."""
    tree = html.fromstring(raw_html)

    # Extract title
    title_elements = tree.xpath("//title/text()")
    title = title_elements[0].strip() if title_elements else ""

    # Remove script, style, nav, footer, header elements before extracting text
    for tag in tree.xpath("//script | //style | //nav | //footer | //header | //noscript"):
        tag.getparent().remove(tag)

    # Extract body text
    body_text = tree.text_content()
    # Clean up whitespace: collapse multiple spaces/newlines into single space
    body_text = re.sub(r"\s+", " ", body_text).strip()

    # Extract links
    links = set()
    for element in tree.xpath("//a[@href]"):
        href = element.get("href", "").strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        # Resolve relative URLs to absolute
        absolute_url = urljoin(url, href)
        # Remove fragment
        absolute_url, _ = urldefrag(absolute_url)
        # Only keep http/https
        if urlparse(absolute_url).scheme in ("http", "https"):
            links.add(absolute_url)

    # Content hash for deduplication
    content_hash = hashlib.md5(body_text.encode()).hexdigest()

    return {
        "title": title,
        "body_text": body_text,
        "links": links,
        "content_hash": content_hash,
    }
