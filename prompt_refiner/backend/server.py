"""
PromptRefiner Backend v0.2 (Flask)
No compiled dependencies. Works on Python 3.10-3.14+.
"""

import json
import os
import time
import requests as req_lib
from pathlib import Path
from collections import deque
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS

app = Flask(__name__, static_folder=None)
CORS(app)

# --- Config ---
CONFIG_PATH = Path(__file__).parent.parent / "config" / "settings.json"
OLLAMA_BASE = os.environ.get("OLLAMA_URL", "http://localhost:11434")
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# In-memory history
history = deque(maxlen=50)


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def call_ollama(system, user_msg, model, temperature, timeout=180):
    """Call Ollama chat API. Returns raw text response."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        "stream": False,
        "options": {"temperature": temperature, "num_predict": 4096},
    }
    try:
        r = req_lib.post(f"{OLLAMA_BASE}/api/chat", json=payload, timeout=timeout)
        r.raise_for_status()
        return r.json().get("message", {}).get("content", "")
    except req_lib.ConnectionError:
        abort(502, description="Cannot connect to Ollama. Is it running?")
    except req_lib.Timeout:
        abort(504, description="Ollama timeout. Try a smaller model or shorter prompt.")
    except Exception as e:
        abort(500, description=f"Ollama error: {str(e)}")


def compose_system_prompt(mode, persona, toggles, custom_instructions):
    config = load_config()
    parts = [config["meta_system_prompt"]]

    persona_data = next((p for p in config["personas"] if p["id"] == persona), None)
    if persona_data and persona_data["system_prompt"]:
        parts.append(f"\n## PERSONA LENS\n{persona_data['system_prompt']}")

    mode_data = next((m for m in config["refinement_modes"] if m["id"] == mode), None)
    if mode_data:
        parts.append(f"\n## REFINEMENT MODE: {mode_data['name'].upper()}\n{mode_data['system_prompt']}")

    active_toggles = [t for t in config["toggles"] if t["id"] in toggles]
    if active_toggles:
        parts.append("\n## ACTIVE MODIFIERS")
        for toggle in active_toggles:
            parts.append(f"\n### {toggle['name']}\n{toggle['prompt_addition']}")

    if custom_instructions and custom_instructions.strip():
        parts.append(f"\n## CUSTOM INSTRUCTIONS\n{custom_instructions}")

    return "\n".join(parts)


def parse_response(raw):
    result = {"refined_prompt": "", "changelog": "", "metrics": "", "raw_response": raw}

    if "---REFINED PROMPT---" in raw and "---END REFINED PROMPT---" in raw:
        result["refined_prompt"] = raw.split("---REFINED PROMPT---")[1].split("---END REFINED PROMPT---")[0].strip()
    elif "---REFINED PROMPT---" in raw:
        after = raw.split("---REFINED PROMPT---")[1]
        for end in ["---CHANGELOG---", "---METRICS---", "---END"]:
            if end in after:
                after = after.split(end)[0]
                break
        result["refined_prompt"] = after.strip()
    else:
        clean = raw.strip()
        for pm in ["here is", "here's", "refined prompt:", "refined version:"]:
            idx = clean.lower().find(pm)
            if idx != -1 and idx < 100:
                clean = clean[idx + len(pm):].strip().lstrip(':').strip()
                break
        result["refined_prompt"] = clean

    if "---CHANGELOG---" in raw:
        after = raw.split("---CHANGELOG---")[1]
        for end in ["---END CHANGELOG---", "---METRICS---", "---END"]:
            if end in after:
                after = after.split(end)[0]
                break
        result["changelog"] = after.strip()

    if "---METRICS---" in raw:
        after = raw.split("---METRICS---")[1]
        for end in ["---END METRICS---", "---END", "---"]:
            if end in after:
                after = after.split(end)[0]
                break
        result["metrics"] = after.strip()

    return result


# ===== Error handler =====
@app.errorhandler(400)
@app.errorhandler(500)
@app.errorhandler(502)
@app.errorhandler(504)
def handle_error(e):
    return jsonify({"detail": e.description if hasattr(e, 'description') else str(e)}), e.code if hasattr(e, 'code') else 500


# ===== Routes =====

@app.route("/")
def serve_index():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return send_from_directory(str(FRONTEND_DIR), "index.html")
    return jsonify({"message": "PromptRefiner API v0.2 running."})


@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(str(FRONTEND_DIR), filename)


@app.route("/api/health")
def health():
    try:
        r = req_lib.get(f"{OLLAMA_BASE}/api/tags", timeout=5)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        return jsonify({"status": "ok", "ollama": True, "models": models})
    except Exception:
        return jsonify({"status": "degraded", "ollama": False, "models": []})


@app.route("/api/settings")
def get_settings():
    return jsonify(load_config())


@app.route("/api/models")
def get_models():
    try:
        r = req_lib.get(f"{OLLAMA_BASE}/api/tags", timeout=10)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        return jsonify({"models": models})
    except req_lib.ConnectionError:
        abort(502, description="Cannot connect to Ollama.")
    except Exception as e:
        abort(500, description=str(e))


@app.route("/api/refine", methods=["POST"])
def refine_prompt():
    data = request.get_json()
    prompt = data.get("prompt", "").strip()
    if not prompt:
        abort(400, description="Empty prompt")

    mode = data.get("mode", "professional")
    persona = data.get("persona", "none")
    toggles = data.get("toggles", [])
    model = data.get("model", "llama3.1:8b")
    temperature = data.get("temperature", 0.7)
    custom = data.get("custom_instructions", "")

    system_prompt = compose_system_prompt(mode, persona, toggles, custom)
    raw = call_ollama(system_prompt, f"Original prompt to refine:\n\n{prompt}", model, temperature)
    parsed = parse_response(raw)

    history.append({
        "timestamp": time.time(), "original": prompt,
        "refined": parsed["refined_prompt"], "mode": mode,
        "persona": persona, "toggles": toggles, "model": model, "type": "single",
    })

    return jsonify({
        "refined_prompt": parsed["refined_prompt"],
        "changelog": parsed["changelog"],
        "metrics": parsed["metrics"],
        "raw_response": raw,
        "composed_system_prompt": system_prompt,
    })


@app.route("/api/refine/chain", methods=["POST"])
def refine_chain():
    data = request.get_json()
    prompt = data.get("prompt", "").strip()
    if not prompt:
        abort(400, description="Empty prompt")

    mode = data.get("mode", "professional")
    persona = data.get("persona", "none")
    toggles = data.get("toggles", [])
    model = data.get("model", "llama3.1:8b")
    temperature = data.get("temperature", 0.7)
    custom = data.get("custom_instructions", "")

    # Pass 1
    system_prompt = compose_system_prompt(mode, persona, toggles, custom)
    raw1 = call_ollama(system_prompt, f"Original prompt to refine:\n\n{prompt}", model, temperature)
    parsed1 = parse_response(raw1)

    # Pass 2
    critique_system = (
        "You are a prompt quality auditor. You receive a refined prompt.\n"
        "Find remaining ambiguities, tighten language, verify all constraints are explicit.\n"
        "Use the same format:\n---REFINED PROMPT---\n[text]\n---END REFINED PROMPT---\n\n"
        "---CHANGELOG---\n[changes]\n---END CHANGELOG---\n\n"
        "---METRICS---\nSpecificity: [1-10]\nCompleteness: [1-10]\nClarity: [1-10]\n---END METRICS---"
    )

    parsed2 = None
    raw2 = ""
    try:
        raw2 = call_ollama(critique_system, f"Critique and tighten:\n\n{parsed1['refined_prompt']}", model, 0.4)
        parsed2 = parse_response(raw2)
    except Exception:
        pass

    final = parsed2 if parsed2 else parsed1
    history.append({
        "timestamp": time.time(), "original": prompt,
        "refined": final["refined_prompt"], "mode": mode,
        "persona": persona, "toggles": toggles, "model": model, "type": "chain",
    })

    result = {
        "pass_1": {
            "refined_prompt": parsed1["refined_prompt"],
            "changelog": parsed1["changelog"],
            "metrics": parsed1["metrics"],
            "raw_response": raw1,
            "composed_system_prompt": system_prompt,
        },
        "pass_2": None,
    }
    if parsed2:
        result["pass_2"] = {
            "refined_prompt": parsed2["refined_prompt"],
            "changelog": parsed2["changelog"],
            "metrics": parsed2["metrics"],
            "raw_response": raw2,
        }

    return jsonify(result)


@app.route("/api/refine/agentic", methods=["POST"])
def refine_agentic():
    data = request.get_json()
    prompt = data.get("prompt", "").strip()
    if not prompt:
        abort(400, description="Empty prompt")

    pipeline_id = data.get("pipeline_id", "full_review")
    model = data.get("model", "llama3.1:8b")
    temperature = data.get("temperature", 0.5)
    custom_agents = data.get("custom_agents", [])

    config = load_config()

    if pipeline_id == "custom" and custom_agents:
        agents = custom_agents
    else:
        pipeline = next((p for p in config["agentic_pipelines"] if p["id"] == pipeline_id), None)
        if not pipeline:
            abort(400, description=f"Unknown pipeline: {pipeline_id}")
        if not pipeline["agents"]:
            abort(400, description="Pipeline has no agents.")
        agents = pipeline["agents"]

    base_system = config.get("agentic_system_prompt", "")
    current_prompt = prompt
    steps = []

    for i, agent in enumerate(agents):
        agent_system = f"{base_system}\n\n## YOUR ROLE: {agent['role']}\n{agent['instruction']}"

        if i == 0:
            user_msg = f"Original prompt to refine:\n\n{current_prompt}"
        else:
            user_msg = f"Prompt refined by previous agent(s). Continue improving:\n\n{current_prompt}"

        raw = call_ollama(agent_system, user_msg, model, temperature)
        cleaned = raw.strip()
        if cleaned.startswith("```") and cleaned.endswith("```"):
            cleaned = cleaned[3:].lstrip("\n")
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].rstrip("\n")

        steps.append({
            "agent": agent["role"],
            "instruction": agent["instruction"],
            "input": current_prompt,
            "output": cleaned,
            "raw": raw,
        })
        current_prompt = cleaned

    history.append({
        "timestamp": time.time(), "original": prompt,
        "refined": current_prompt, "pipeline": pipeline_id,
        "agents": [a["role"] for a in agents], "model": model, "type": "agentic",
    })

    return jsonify({
        "final_prompt": current_prompt,
        "original_prompt": prompt,
        "pipeline_id": pipeline_id,
        "steps": steps,
        "agent_count": len(agents),
    })


@app.route("/api/history")
def get_history():
    limit = request.args.get("limit", 20, type=int)
    items = list(history)[-limit:]
    items.reverse()
    return jsonify({"history": items, "total": len(history)})


@app.route("/api/presets")
def get_presets():
    config = load_config()
    return jsonify({"presets": config.get("presets", [])})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
