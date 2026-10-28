"""Train and evaluate the Random Forest, then save model + metadata.

Run from the project root:  python backend/train_model.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parent))
from preprocessing import DatasetError, load_dataset, read_dataset_info  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "dataset" / "disease_symptoms.csv"
MODEL_PATH = ROOT / "models" / "random_forest.joblib"
METADATA_PATH = ROOT / "models" / "metadata.json"
SEED = 42
TEST_SIZE = 0.2


def train(dataset_path=DATASET_PATH, model_path=MODEL_PATH, metadata_path=METADATA_PATH, seed=SEED):
    X, y = load_dataset(dataset_path)
    if y.value_counts().min() < 2:
        raise DatasetError("Every disease needs at least 2 rows for a stratified split.")

    # Split first, so nothing from the test set influences training.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y, random_state=seed
    )
    # Class imbalance is handled with class weights computed from training rows only
    # (no synthetic resampling, so no risk of leaking into the test set).
    model = RandomForestClassifier(
        n_estimators=200, class_weight="balanced_subsample", random_state=seed, n_jobs=-1
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    prec, rec, f1, _ = precision_recall_fscore_support(
        y_test, pred, average="weighted", zero_division=0
    )
    metadata = {
        "algorithm": "Random Forest Classifier (scikit-learn)",
        "n_estimators": 200,
        "class_weight": "balanced_subsample",
        "random_state": seed,
        "test_size": TEST_SIZE,
        "n_samples": int(len(X)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "n_diseases": int(y.nunique()),
        "n_symptoms": int(X.shape[1]),
        "diseases": sorted(y.unique().tolist()),
        "metrics": {
            "accuracy": round(float(accuracy_score(y_test, pred)), 4),
            "precision_weighted": round(float(prec), 4),
            "recall_weighted": round(float(rec), 4),
            "f1_weighted": round(float(f1), 4),
        },
        "dataset": read_dataset_info(dataset_path),
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    Path(model_path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": list(X.columns)}, model_path)
    Path(metadata_path).write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


if __name__ == "__main__":
    try:
        meta = train()
    except DatasetError as exc:
        sys.exit(f"Training failed: {exc}")
    print(json.dumps(meta["metrics"], indent=2))
    print(f"Diseases: {meta['n_diseases']}  Symptoms: {meta['n_symptoms']}  "
          f"Train/Test: {meta['n_train']}/{meta['n_test']}")
    print(f"Saved model to {MODEL_PATH}")
