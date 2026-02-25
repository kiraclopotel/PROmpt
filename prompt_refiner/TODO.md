# PromptRefiner v0.2 — Development Roadmap & Handoff

## STATUS: v0.2 — Chrome Extension + Agentic Pipelines

### Completed
- [x] FastAPI backend with Ollama integration
- [x] Prompt composition engine (mode + persona + toggles → system prompt)
- [x] Single-pass + double-pass refinement
- [x] Improved response parser with multiple fallback strategies
- [x] 8 refinement modes, 8 personas, 12 toggle modifiers
- [x] **Chrome extension** — popup UI over any page
- [x] Grab text from: page selection, textarea/contenteditable, clipboard
- [x] **Replace** refined text directly back into page textarea
- [x] Right-click context menu: "Refine with PromptRefiner"
- [x] **Agentic pipeline system** — multi-agent sequential refinement
- [x] 4 built-in pipelines: Full Review, Research, Development, Creative
- [x] Step-by-step agent output visualization
- [x] **Presets** — one-click mode+persona+toggle combos
- [x] 6 built-in presets: App Dev, Research, Quick Clean, Deep Analysis, Creative Brief, Bulletproof
- [x] **In-memory history** — last 50 refinements, clickable to reload
- [x] Settings persistence via chrome.storage
- [x] Health check endpoint for extension
- [x] **Robust start.bat** — auto-detects Python, auto-starts Ollama, venv, deps caching, port conflict handling
- [x] Config-driven architecture: all prompts/agents/presets in settings.json

---

## PHASE 3 — Next Priority

### 3.1 Response Parsing Robustness
- [ ] Some local models don't follow the ---MARKERS--- format. Add: secondary parsing via regex, or run a small extraction pass.
- [ ] Add "raw mode" toggle that skips format expectations entirely.
- [ ] Surface parsing confidence to user: "Model followed format: yes/partial/no".

### 3.2 Streaming Responses
- [ ] Switch Ollama calls from stream:false to SSE streaming.
- [ ] Show real-time generation in extension popup.
- [ ] Crucial for agentic mode where user waits through 3+ sequential calls.

### 3.3 Custom Pipeline Builder
- [ ] UI for defining custom agent sequences in extension.
- [ ] Save custom pipelines to chrome.storage.
- [ ] Share pipelines as JSON export/import.

### 3.4 Intent Wizard
- [ ] Before refinement, optional quick questionnaire:
  - What is this for? (code / writing / research / planning)
  - Who sees the output? (me / team / client / public)
  - Format? (doc / code / list / plan)
- [ ] Auto-configures mode + toggles based on answers.

### 3.5 Diff View
- [ ] Side-by-side or inline diff: original vs refined.
- [ ] Color-coded: green=added, red=removed, yellow=restructured.
- [ ] For agentic mode: show diff between each agent step.

---

## PHASE 4 — Enhancement

### 4.1 Prompt Templates
- [ ] Library of pre-built templates for common tasks.
- [ ] User fills in variables, system adds structure.
- [ ] Template categories: coding, writing, research, business, creative.

### 4.2 Multi-Model
- [ ] A/B comparison: same prompt, two models side-by-side.
- [ ] Model routing: auto-select model based on task type.
- [ ] Performance tracking: which model/mode combos produce best results.

### 4.3 Persistent History
- [ ] Move history from in-memory to SQLite.
- [ ] Search history by content, mode, date.
- [ ] Star/favorite refinements for reuse.

### 4.4 In-Page UI
- [ ] Small floating button near textareas (like Grammarly).
- [ ] Click to refine textarea content in-place.
- [ ] Mini settings dropdown for quick mode selection.

### 4.5 Export
- [ ] Export refined prompt as .md or .txt.
- [ ] Export agentic pipeline trace as report.
- [ ] Export prompt + settings as shareable JSON.

---

## KNOWN ISSUES
- [ ] Some models produce markdown fences around output — parser handles some but not all cases.
- [ ] Agentic mode: long wait with no feedback (no streaming yet). User may think it hung.
- [ ] toggleStep() in agentic view has escaping issues with complex prompt text containing quotes/newlines.
- [ ] Extension popup height fixed at 600px — could use dynamic sizing.
- [ ] History resets when server restarts (in-memory only).
- [ ] No model-specific temperature defaults.

---

## ARCHITECTURE NOTES (for future Claude)
1. **Config-driven**: settings.json holds ALL prompt content, agent definitions, presets. Add anything by editing JSON.
2. **Composition order**: meta_system → persona → mode → toggles → custom. Intentional layering.
3. **Agentic is sequential**: Agent N's output becomes Agent N+1's input. No parallelism.
4. **Extension ↔ Backend**: Extension calls localhost:8000 directly. Backend serves both web UI and API.
5. **State split**: Extension settings in chrome.storage. History in server memory. Config in JSON file.
6. **Parsing**: Response parser tries multiple strategies — exact markers, partial markers, strip-and-clean. Fallback is always "use entire response."

## HOW TO CONTINUE
1. Read this file.
2. Read config/settings.json for prompt/pipeline definitions.
3. Read backend/server.py for API.
4. Test: start.bat → chrome://extensions → load unpacked → test popup.
5. Pick from Phase 3 or 4.
