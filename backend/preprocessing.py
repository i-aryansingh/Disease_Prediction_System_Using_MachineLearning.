"""Dataset loading, cleaning and symptom-vector helpers."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

TARGET_COLUMN = "prognosis"


class DatasetError(Exception):
    """The dataset is missing required structure."""


class DatasetNotFoundError(DatasetError):
    """The dataset file does not exist."""


def load_dataset(path):
    """Load the CSV and return (X, y): binary symptom columns and disease labels."""
    path = Path(path)
    if not path.is_file():
        raise DatasetNotFoundError(
            "Dataset file not found. Place it at dataset/disease_symptoms.csv."
        )
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        raise DatasetError("The dataset could not be read as a CSV file.") from exc

    df.columns = [str(c).strip() for c in df.columns]
    if TARGET_COLUMN not in df.columns:
        raise DatasetError(f"The dataset needs a '{TARGET_COLUMN}' column with disease labels.")

    df = df.dropna(subset=[TARGET_COLUMN]).copy()
    df[TARGET_COLUMN] = df[TARGET_COLUMN].astype(str).str.strip()
    df = df[df[TARGET_COLUMN] != ""]

    X = df.drop(columns=[TARGET_COLUMN])
    X = X.loc[:, ~X.columns.str.startswith("Unnamed")]  # stray index/empty columns
    X = X.loc[:, ~X.columns.duplicated()]
    # Missing/non-numeric symptom cells mean "not reported" -> 0; any positive value -> 1.
    X = (X.apply(pd.to_numeric, errors="coerce").fillna(0) > 0).astype(int)

    if X.shape[1] == 0 or len(X) == 0:
        raise DatasetError("The dataset contains no usable symptom columns or rows.")
    return X.reset_index(drop=True), df[TARGET_COLUMN].reset_index(drop=True)


def read_dataset_info(dataset_path):
    """Optional sidecar file (dataset_info.json) describing the dataset's origin."""
    info_path = Path(dataset_path).parent / "dataset_info.json"
    try:
        return json.loads(info_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"is_demo": False}


def normalize_symptom(name):
    """'  Skin Rash ' -> 'skin_rash'."""
    return "_".join(str(name).strip().lower().replace("-", " ").split())


def symptom_label(key):
    return key.replace("_", " ").title()


def build_vector(selected, features):
    """Binary vector in the exact column order used for training."""
    chosen = {normalize_symptom(s) for s in selected}
    return np.array([[1 if f in chosen else 0 for f in features]], dtype=float)
