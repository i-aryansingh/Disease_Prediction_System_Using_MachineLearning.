"""Run from the project root:  pytest tests -v
(The model must exist first: python backend/train_model.py)"""
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from predict import ModelNotFoundError, Predictor  # noqa: E402
from preprocessing import DatasetError, DatasetNotFoundError, load_dataset  # noqa: E402
from train_model import train  # noqa: E402


@pytest.fixture(scope="module")
def client():
    if not main.MODEL_PATH.is_file():
        pytest.skip("Model not trained. Run: python backend/train_model.py")
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "model_loaded": True}


def test_symptom_list(client):
    r = client.get("/api/symptoms")
    body = r.json()
    assert r.status_code == 200
    assert body["count"] == len(body["symptoms"]) > 0
    assert {"key", "label"} <= set(body["symptoms"][0])


def test_successful_prediction(client):
    keys = [s["key"] for s in client.get("/api/symptoms").json()["symptoms"]][:3]
    r = client.post("/api/predict", json={"symptoms": keys})
    body = r.json()
    assert r.status_code == 200
    assert 1 <= len(body["predictions"]) <= 3
    scores = [p["score"] for p in body["predictions"]]
    assert scores == sorted(scores, reverse=True)
    assert "not a medical diagnosis" in body["disclaimer"]


def test_empty_selection(client):
    assert client.post("/api/predict", json={"symptoms": []}).status_code == 400
    assert client.post("/api/predict", json={"symptoms": ["  "]}).status_code == 400


def test_malformed_request(client):
    assert client.post("/api/predict", json={"wrong": 1}).status_code == 422


def test_invalid_symptom(client):
    r = client.post("/api/predict", json={"symptoms": ["fever_of_unicorns"]})
    assert r.status_code == 400
    assert r.json()["invalid_symptoms"] == ["fever_of_unicorns"]


def test_model_info_has_real_metrics(client):
    body = client.get("/api/model-info").json()
    assert 0 <= body["metrics"]["accuracy"] <= 1
    assert body["n_symptoms"] == client.get("/api/symptoms").json()["count"]


def test_missing_model_returns_503(client, monkeypatch):
    monkeypatch.setattr(main.app.state, "predictor", None)
    assert client.get("/api/symptoms").status_code == 503
    r = client.post("/api/predict", json={"symptoms": ["x"]})
    assert r.status_code == 503
    assert str(ROOT) not in r.text  # no server paths leaked


def test_missing_model_file_raises(tmp_path):
    with pytest.raises(ModelNotFoundError):
        Predictor(tmp_path / "nope.joblib")


def test_missing_dataset_raises(tmp_path):
    with pytest.raises(DatasetNotFoundError):
        load_dataset(tmp_path / "nope.csv")
    bad = tmp_path / "bad.csv"
    bad.write_text("a,b\n1,0\n")
    with pytest.raises(DatasetError):
        load_dataset(bad)


def test_feature_order_matches_training(tmp_path):
    """Vector columns follow training order regardless of how symptoms are sent."""
    df = pd.DataFrame({
        "b_sym": [1, 0, 1, 0] * 5, "a_sym": [0, 1, 0, 1] * 5, "c_sym": [1, 1, 0, 0] * 5,
        "prognosis": ["X", "Y", "X", "Y"] * 5,
    })
    csv = tmp_path / "d.csv"
    df.to_csv(csv, index=False)
    model_path = tmp_path / "m.joblib"
    meta = train(csv, model_path, tmp_path / "meta.json")
    p = Predictor(model_path)
    assert p.features == ["b_sym", "a_sym", "c_sym"]  # CSV order preserved
    assert meta["n_symptoms"] == 3 and meta["n_diseases"] == 2
    v1 = p.vectorize(["a_sym", "c_sym"])
    v2 = p.vectorize(["C_SYM", "a_sym"])
    assert list(v1.columns) == p.features
    assert v1.values.tolist() == v2.values.tolist() == [[0, 1, 1]]
    assert p.predict(["a_sym"]) == p.predict(["a_sym", "a_sym"])
