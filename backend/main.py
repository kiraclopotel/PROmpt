"""
PromptForge FastAPI backend.
Provides REST API for prompt transformation pipeline.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio

from .ollama_client import OllamaClient
from .pipeline import Pipeline
from .transforms import (
    PlannerTransform,
    ProfessionalStyleTransform,
    ExpertPersonaTransform,
)


# ============================================================================
# Request/Response Models
# ============================================================================

class RefineRequest(BaseModel):
    """Request to refine a prompt."""
    prompt: str
    model: str
    enabled_transforms: list[str]


class RefineResponse(BaseModel):
    """Response from refine endpoint."""
    original_input: str
    final_output: str
    steps: list[dict]
    error: str | None = None
    total_duration_ms: float


class TransformInfo(BaseModel):
    """Information about a transform."""
    name: str
    category: str
    description: str
    enabled: bool


class ModelsResponse(BaseModel):
    """Response from models endpoint."""
    models: list[dict]
    error: str | None = None


# ============================================================================
# FastAPI App Setup
# ============================================================================

app = FastAPI(
    title="PromptForge",
    description="Local prompt transformation workbench",
    version="1.0.0",
)

# Enable CORS for frontend on localhost:5173 (Vite default)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Ollama client and transforms
ollama_client = OllamaClient()
transforms = [
    PlannerTransform(),
    ProfessionalStyleTransform(),
    ExpertPersonaTransform(),
]
pipeline = Pipeline(transforms)


# ============================================================================
# Endpoints
# ============================================================================

@app.get("/api/models", response_model=ModelsResponse)
async def get_models():
    """List available Ollama models."""
    try:
        result = await ollama_client.list_models()
        if "error" in result:
            return ModelsResponse(models=[], error=result["error"])
        return ModelsResponse(models=result.get("models", []))
    except Exception as e:
        return ModelsResponse(models=[], error=str(e))


@app.get("/api/transforms", response_model=list[TransformInfo])
async def get_transforms():
    """List all available transforms."""
    return [
        TransformInfo(
            name=t.name,
            category=t.category,
            description=t.description,
            enabled=t.enabled,
        )
        for t in transforms
    ]


@app.post("/api/refine", response_model=RefineResponse)
async def refine_prompt(request: RefineRequest):
    """
    Refine a prompt through the transform pipeline.
    
    Args:
        request: RefineRequest with prompt, model, and enabled_transforms
    
    Returns:
        RefineResponse with original, final output, and step log
    """
    # Validate input
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    
    if not request.model:
        raise HTTPException(status_code=400, detail="Model must be specified")
    
    if not request.enabled_transforms:
        raise HTTPException(status_code=400, detail="At least one transform must be enabled")
    
    try:
        # Execute pipeline
        result = await pipeline.execute(
            input_text=request.prompt,
            enabled_transforms=request.enabled_transforms,
            ollama_client=ollama_client,
            model=request.model,
        )
        
        # Return result
        return RefineResponse(
            original_input=result.original_input,
            final_output=result.final_output,
            steps=result.to_dict()["steps"],
            error=result.error,
            total_duration_ms=result.total_duration_ms,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# ============================================================================
# Startup/Shutdown
# ============================================================================

@app.on_event("shutdown")
async def shutdown_event():
    """Close Ollama client on shutdown."""
    await ollama_client.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
