# PromptRefiner

Local prompt refinement tool powered by Ollama. Takes rough/incomplete prompts and transforms them into precise, effective prompts using configurable modes, personas, and modifiers.

## Requirements

- Python 3.10+
- Ollama running locally (https://ollama.ai)
- At least one model pulled in Ollama (e.g., `ollama pull llama3.1:8b`)

## Setup (Windows 11)

```bash
# 1. Open terminal in the prompt_refiner directory

# 2. Install dependencies
pip install -r requirements.txt

# 3. Make sure Ollama is running (open Ollama app or run `ollama serve`)

# 4. Pull a model if you haven't
ollama pull llama3.1:8b

# 5. Start the server
uvicorn backend.server:app --reload --port 8000

# 6. Open browser to http://localhost:8000
```

## Architecture

```
prompt_refiner/
├── backend/
│   └── server.py          # FastAPI server, Ollama integration, prompt composition
├── frontend/
│   └── index.html         # Single-file UI (HTML/CSS/JS)
├── config/
│   └── settings.json      # Modes, toggles, personas, system prompts
├── requirements.txt
├── README.md
└── TODO.md                # Development roadmap
```

## How It Works

1. User enters a raw prompt
2. Selects: refinement mode + persona + toggle modifiers
3. Backend composes a meta-system-prompt from all selections
4. Sends to Ollama: system prompt + user's original prompt
5. Parses structured response: refined prompt, changelog, metrics
6. Displays side-by-side with comparison metrics

## Key Features

- **7 Refinement Modes**: Professional, Scientific, Technical, Creative, Concise, Expanded, Socratic
- **6 Personas**: Software Architect, Researcher, UX Designer, Editor, PM, Security Analyst
- **10 Toggles**: Planner, Chain-of-Thought, Constraints-First, Examples, Audience, Anti-Hallucination, Format Spec, Iterative, Devil's Advocate, Measurable
- **Double Refine**: Two-pass refinement with self-critique
- **Metrics**: Word count, specificity, completeness, clarity scores
- **Fully local**: All processing through your Ollama instance

## Model Recommendations (8GB VRAM RTX 4060)

- `llama3.1:8b` — Good general purpose, fits in VRAM
- `qwen2.5:7b` — Strong instruction following
- `mistral:7b` — Fast, good for iteration
- For better results with 64GB RAM: `llama3.1:70b` (CPU, slower but higher quality)
