# UI Redesign: Brave Search Inspired

The frontend was redesigned to match Brave Search's clean, dark aesthetic while keeping the educational pipeline visualization as a core feature.

## Design System

### Color Palette (Dark Theme)
```css
--bg: #1b1b2f           /* Deep navy background */
--bg-card: #242440       /* Card surfaces */
--bg-elevated: #2d2d4a   /* Chips, inputs */
--border: #353558        /* Subtle borders */
--text: #e5e5f0          /* Primary text */
--text-muted: #a0a0b8    /* Secondary text */
--accent: #5b7bff        /* Blue accent */
--link-blue: #8ab4f8     /* Link color */
```

### Typography
- Font: Inter (Google Fonts)
- Body: 14px base
- Result titles: 18px
- Snippets: 14px
- AI Overview: 15px

## Layout Architecture

### Three UI States
1. **Hero** — no query, centered search bar with suggestions
2. **Loading** — query submitted, skeleton pulses (AI Overview + 3 result placeholders)
3. **Results** — search bar header + AI Overview + results + explore toggle

### Search/Explore Toggle
The ViewToggle sits inside the search bar (next to theme toggle), not as a separate tab row. This preserves space and keeps the clean search bar aesthetic.

### SERP + Pipeline Overlay
The SERP (AI Overview + results) is always rendered. The pipeline slides in from the left as an overlay on desktop, pushing the SERP right via `padding-left` transition. On mobile, it's a full tab switch (SERP hidden, pipeline shown).

## AI Overview (Brave-Style)
- Sparkle icon header with gradient
- Inline citation badges (numbered, hover for source preview)
- "AI-generated answer. Please verify critical facts." disclaimer
- Follow-up suggestion chips with sparkle icons
- Copy button + stacked source favicon avatars
- Follow-up input bar

## Mobile Optimization

### Sizing
- Result titles: 18px (was 16px on mobile)
- Snippets: 14px (was 13px)
- Domains: 14px (was 13px)
- Favicons: 32px container (was 28px)
- ViewToggle: 12px (was 11px)
- Follow-up chips: 14px with larger padding

### Layout
- Pipeline: full-width on mobile (SERP hidden via `hidden lg:block`)
- Node detail: swipe-to-dismiss bottom sheet with drag handle
- Header: X button hidden on mobile, tightened gaps
- `overflow-x: hidden` on body prevents pipeline horizontal scroll leak
- Pipeline SVG: `min-w-[380px]` on mobile (was 500px)

### Skeleton Loading
New search clears results immediately and shows skeletons instead of stale old results. Three states: hero → skeleton → results.

## Files
- `frontend/app/globals.css` — Color palette + scrollbar + animations
- `frontend/app/page.tsx` — Main page with all three states
- `frontend/app/layout.tsx` — Font setup + dark theme default
- `frontend/components/AIOverview.tsx` — AI answer with citations
- `frontend/components/PipelineExplorer.tsx` — SVG pipeline diagram
