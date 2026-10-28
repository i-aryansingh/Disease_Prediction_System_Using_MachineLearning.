"""FastAPI backend. Serves the REST API and the static frontend.

Run from the project root:  uvicorn backend.main:app --reload
"""
import json
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from predict import InvalidSymptomError, ModelNotFoundError, Predictor  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "random_forest.joblib"
METADATA_PATH = ROOT / "models" / "metadata.json"
FRONTEND_DIR = ROOT / "frontend"

DISCLAIMER = (
    "This is a preliminary machine learning prediction for academic demonstration. "
    "It is not a medical diagnosis. Please consult a qualified healthcare professional."
)
log = logging.getLogger("sbdps")


def load_predictor():
    try:
        return Predictor(MODEL_PATH), None
    except ModelNotFoundError as exc:
        log.warning("Model not loaded: %s", exc)
        return None, str(exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.predictor, app.state.load_error = load_predictor()
    yield


app = FastAPI(title="SBDPS API", version="1.0.0", lifespan=lifespan)


class PredictRequest(BaseModel):
    symptoms: list[str] = Field(..., max_length=200)


def get_predictor(request: Request):
    predictor = getattr(request.app.state, "predictor", None)
    if predictor is None:
        raise HTTPException(503, "The prediction model is not available. Train the model first.")
    return predictor


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Invalid request. Send JSON like {\"symptoms\": [\"fever\"]}."},
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log.exception("Unhandled error")  # trace stays in server logs only
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


@app.get("/api/health")
def health(request: Request):
    return {"status": "ok", "model_loaded": getattr(request.app.state, "predictor", None) is not None}


@app.get("/api/symptoms")
def symptoms(request: Request):
    items = get_predictor(request).symptom_list()
    return {"count": len(items), "symptoms": items}


@app.post("/api/predict")
def predict(body: PredictRequest, request: Request):
    predictor = get_predictor(request)
    cleaned = [s.strip() for s in body.symptoms if s and s.strip()]
    if not cleaned:
        raise HTTPException(400, "Select at least one symptom.")
    if any(len(s) > 64 for s in cleaned):
        raise HTTPException(400, "Symptom names are too long.")
    try:
        result = predictor.predict(cleaned, top_k=3)
    except InvalidSymptomError as exc:
        return JSONResponse(
            status_code=400,
            content={"detail": "One or more symptoms are not supported.", "invalid_symptoms": exc.invalid},
        )
    result["disclaimer"] = DISCLAIMER
    result["score_note"] = "Scores are model-generated estimates, not calibrated medical probabilities."
    return result


@app.get("/api/model-info")
def model_info():
    try:
        return json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise HTTPException(503, "Model information is not available. Train the model first.")


if FRONTEND_DIR.is_dir():  # mounted last so /api routes take priority
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
