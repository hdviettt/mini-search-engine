"""Generate the architecture figures in a scientific-paper register.

Two constraints drive every decision here:

1. An SVG loaded through <img> cannot fetch a webfont and cannot read the host
   page's CSS variables. So the typeface is embedded as a base64 WOFF2 subset,
   and the dark variant is a separate file rather than a media query.

2. The register is arXiv, not product marketing. Linux Libertine (the LaTeX
   `libertine` package), square corners, hairline rules, panel labels (a)-(c),
   numerals set upright and parameters italic, and a caption that reads
   "Figure N: ..." beneath the frame.

The embedded subset is Linux Libertine, released under the SIL Open Font
License 1.1, which permits embedding and redistribution. `_libertine_b64.py`
holds regular, bold and italic subset to the glyphs these two figures use
(about 80 KB of base64 in total).

Run:  python build.py
"""
from pathlib import Path

from _libertine_b64 import FONTS

HERE = Path(__file__).parent
BLOG = Path("C:/Users/admin/Desktop/workspace/personal/projects/personal-blog/public/figures")

LIGHT = dict(bg="#ffffff", ink="#111111", sub="#555555", rule="#111111",
             panel="#8a8a8a", faint="#bdbdbd", inv_bg="#111111", inv_ink="#ffffff")
DARK = dict(bg="#131314", ink="#ececec", sub="#a4a4a4", rule="#ececec",
            panel="#6f6f6f", faint="#4a4a4a", inv_bg="#ececec", inv_ink="#131314")


def face(style, weight, b64):
    return (f"@font-face{{font-family:'LibertineFig';font-style:{style};"
            f"font-weight:{weight};src:url(data:font/woff2;base64,{b64}) format('woff2');}}")


def head(w, h, t):
    fonts = (face("normal", 400, FONTS["r"]) + face("normal", 700, FONTS["b"])
             + face("italic", 400, FONTS["i"]))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
<defs><style>
{fonts}
text{{font-family:'LibertineFig','Linux Libertine','Libertinus Serif','STIX Two Text','Times New Roman',Times,serif;fill:{t["ink"]}}}
.nm{{font-size:13.5px}}
.pm{{font-size:11.5px;font-style:italic;fill:{t["sub"]}}}
.ix{{font-size:10px;fill:{t["sub"]}}}
.pl{{font-size:11.5px;font-weight:700}}
.cap{{font-size:12px}}
.capb{{font-size:12px;font-weight:700}}
.mn{{font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:10.5px;fill:{t["sub"]}}}
.box{{fill:none;stroke:{t["rule"]};stroke-width:0.6}}
.pan{{fill:none;stroke:{t["panel"]};stroke-width:0.5;stroke-dasharray:2.5 2.5}}
.ar{{stroke:{t["rule"]};stroke-width:0.7;fill:none}}
.arf{{stroke:{t["faint"]};stroke-width:0.7;fill:none;stroke-dasharray:2.5 2.5}}
.rule{{stroke:{t["rule"]};stroke-width:0.6}}
</style>
<marker id="h" viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto">
<path d="M0 0.8 L8 4 L0 7.2 Z" fill="{t["rule"]}"/></marker>
<marker id="hf" viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto">
<path d="M0 0.8 L8 4 L0 7.2 Z" fill="{t["faint"]}"/></marker>
</defs>
<rect width="{w}" height="{h}" fill="{t["bg"]}"/>'''


def node(x, y, w, name, params, idx=None, strong=False, t=None):
    """A component. `strong` draws the double rule papers use for a terminal."""
    h = 40
    s = f'<rect class="box" x="{x}" y="{y}" width="{w}" height="{h}"/>'
    if strong:
        s += f'<rect class="box" x="{x-3}" y="{y-3}" width="{w+6}" height="{h+6}"/>'
    if idx:
        s += f'<text class="ix" x="{x+6}" y="{y+13}">{idx}</text>'
    s += f'<text class="nm" x="{x+w/2}" y="{y+18}" text-anchor="middle">{name}</text>'
    s += f'<text class="pm" x="{x+w/2}" y="{y+32}" text-anchor="middle">{params}</text>'
    return s


def caption(x, y, w, num, bold, rest, t):
    out = f'<line class="rule" x1="{x}" y1="{y-16}" x2="{x+w}" y2="{y-16}"/>'
    out += f'<text class="capb" x="{x}" y="{y}">Figure {num}: </text>'
    out += f'<text class="cap" x="{x+58}" y="{y}">{bold}</text>'
    for i, line in enumerate(rest):
        out += f'<text class="cap" x="{x}" y="{y+16*(i+1)}">{line}</text>'
    return out


def fig1(t):
    W, H = 940, 570
    s = head(W, H, t)
    s += '<text class="pl" x="40" y="34">(a) Fetch</text>'
    s += '<text class="pl" x="330" y="34">(b) Index</text>'
    s += '<text class="pl" x="670" y="34">(c) Semantic</text>'
    # Panels are sized to contain their stages. (b) runs the full chain down to
    # PageRank, so it is the tall one.
    s += '<rect class="pan" x="40" y="44" width="230" height="196"/>'
    s += '<rect class="pan" x="330" y="44" width="250" height="380"/>'
    s += '<rect class="pan" x="670" y="44" width="230" height="196"/>'

    s += node(60, 64, 190, "Crawler", "BFS, robots.txt, 1.5 s", "1", t=t)
    s += node(60, 156, 190, "Parser", "text, links, content hash", "2", t=t)
    s += '<path class="ar" marker-end="url(#h)" d="M 155 104 V 154"/>'

    s += node(350, 64, 210, "Quality gate", "≥100 words, hash dedup", "3", t=t)
    s += node(350, 156, 210, "Tokenizer", "stopwords, Porter stem", "4", t=t)
    s += node(350, 248, 210, "Inverted index", "term → postings", "5", t=t)
    s += node(350, 340, 210, "PageRank", "d = 0.85, 20 iterations", "6", t=t)
    s += '<path class="ar" marker-end="url(#h)" d="M 455 104 V 154"/>'
    s += '<path class="ar" marker-end="url(#h)" d="M 455 196 V 246"/>'
    s += '<path class="ar" marker-end="url(#h)" d="M 455 288 V 338"/>'
    s += '<path class="ar" marker-end="url(#h)" d="M 250 176 H 300 V 84 H 348"/>'

    s += node(690, 64, 190, "Chunker", "≈300-token passages", "7", t=t)
    s += node(690, 156, 190, "Embedder", "voyage-3-lite, 512 d", "8", t=t)
    s += '<path class="ar" marker-end="url(#h)" d="M 785 104 V 154"/>'
    s += '<path class="ar" marker-end="url(#h)" d="M 560 84 H 688"/>'

    s += node(390, 460, 280, "PostgreSQL 16 + pgvector", "pages, postings, chunks", None, strong=True, t=t)
    s += '<path class="ar" marker-end="url(#h)" d="M 455 380 V 458"/>'
    s += '<path class="ar" marker-end="url(#h)" d="M 785 196 V 480 H 674"/>'

    s += caption(40, 530, 860, 1,
                 "Offline build path. Panels group the three stages that run before any query is",
                 ["served. Every stage writes to Postgres, which is the only state the query path in Figure 2",
                  "reads. Numerals give execution order."], t)
    return s + "</svg>"


def fig2(t):
    W, H = 940, 650
    s = head(W, H, t)
    s += '<text class="pl" x="40" y="34">(c) Measured gaps</text>'
    s += '<text class="pl" x="310" y="34">(a) Retrieve and score</text>'
    s += '<text class="pl" x="680" y="34">(b) Synthesis</text>'

    # Panel (a) reaches down past the reranker; results sit outside it because
    # they are the output, not a stage.
    s += '<rect class="pan" x="40" y="44" width="230" height="300"/>'
    s += '<rect class="pan" x="310" y="44" width="270" height="426"/>'
    s += '<rect class="pan" x="660" y="44" width="240" height="248"/>'

    s += node(330, 60, 230, "Query", "", None, strong=True, t=t)
    s += node(330, 148, 230, "Tokenize and stem", "same path as stage 4, Fig. 1", "1", t=t)
    s += node(330, 236, 230, "BM25F", "title × 4, k₁ = 1.2, b = 0.75", "2", t=t)
    s += node(330, 324, 230, "PageRank and freshness", "0.8 BM25 + 0.2 PR", "3", t=t)
    s += node(330, 412, 230, "Cross-encoder rerank", "top 5, 22 M params, ONNX", "4", t=t)
    s += node(330, 512, 230, "Ranked results", "", None, strong=True, t=t)

    for y0, y1 in [(100, 146), (188, 234), (276, 322), (364, 410), (452, 510)]:
        s += f'<path class="ar" marker-end="url(#h)" d="M 445 {y0} V {y1}"/>'

    s += node(680, 60, 200, "Query fan-out", "co-occurrence", None, t=t)
    s += node(680, 148, 200, "Hybrid retrieval", "pgvector + BM25", None, t=t)
    s += node(680, 236, 200, "AI Overview", "Groq, with citations", None, t=t)
    s += '<path class="ar" marker-end="url(#h)" d="M 780 100 V 146"/>'
    s += '<path class="ar" marker-end="url(#h)" d="M 780 188 V 234"/>'
    s += '<path class="arf" marker-end="url(#hf)" d="M 560 80 H 678"/>'

    # Each connector gets its own elbow column so none of them overlap.
    gaps = [("i", "spell correction is bound", "to another endpoint", 96, 160, 280),
            ("ii", "no phrase or proximity", "signal survives stemming", 162, 176, 290),
            ("iii", "any single term admits", "a document", 234, 248, 280),
            ("iv", "no URL or domain field", "is scored", 300, 264, 290)]
    for num, l1, l2, y, target, elbow in gaps:
        s += f'<text class="ix" x="58" y="{y}">({num})</text>'
        s += f'<text class="pm" x="84" y="{y}">{l1}</text>'
        s += f'<text class="pm" x="84" y="{y+14}">{l2}</text>'
        s += f'<path class="arf" marker-end="url(#hf)" d="M 250 {y-4} H {elbow} V {target} H 328"/>'

    # Set beside the column, not across it: the arrow from stage 4 runs at x=445.
    s += '<text class="pm" x="600" y="440">stage 4 is worth 23% of nDCG and 46% of</text>'
    s += '<text class="pm" x="600" y="454">MRR, and costs 1158 ms at p50</text>'
    s += '<path class="arf" d="M 592 444 H 570"/>'

    s += caption(40, 612, 860, 2,
                 "Per-request query path. Solid arrows carry the ranked list; the dashed arrow into",
                 ["panel (b) is an independent branch. Roman numerals in panel (c) mark defects a 50-query",
                  "evaluation surfaced, each drawn to the stage that produces it."], t)
    return s + "</svg>"


if __name__ == "__main__":
    BLOG.mkdir(parents=True, exist_ok=True)
    for name, fn in [("01-build-pipeline", fig1), ("02-query-pipeline", fig2)]:
        for suffix, theme in [("", LIGHT), ("-dark", DARK)]:
            svg = fn(theme)
            (HERE / f"{name}{suffix}.svg").write_text(svg, encoding="utf-8")
            (BLOG / f"mse-{name}{suffix}.svg").write_text(svg, encoding="utf-8")
            print(f"  {name}{suffix}.svg  {len(svg)/1024:.0f} KB")
