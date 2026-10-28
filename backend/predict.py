"""Loads the saved model and turns selected symptoms into predictions."""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from preprocessing import normalize_symptom, symptom_label


class ModelNotFoundError(Exception):
    """Model file missing or unreadable."""


class InvalidSymptomError(ValueError):
    def __init__(self, invalid):
        super().__init__("Unknown symptom(s) in request.")
        self.invalid = invalid


class Predictor:
    def __init__(self, model_path):
        path = Path(model_path)
        if not path.is_file():
            raise ModelNotFoundError("Trained model not found. Run backend/train_model.py first.")
        try:
            bundle = joblib.load(path)
            self.model = bundle["model"]
            self.features = list(bundle["features"])
        except Exception as exc:
            raise ModelNotFoundError("The trained model file could not be loaded.") from exc
        self._known = set(self.features)

    def symptom_list(self):
        items = [{"key": f, "label": symptom_label(f)} for f in self.features]
        return sorted(items, key=lambda i: i["label"])

    def normalize(self, symptoms):
        """Normalise, validate against the training features, de-duplicate."""
        names = [normalize_symptom(s) for s in symptoms]
        invalid = [str(s)[:64] for s, n in zip(symptoms, names) if n not in self._known]
        if invalid:
            raise InvalidSymptomError(invalid)
        return list(dict.fromkeys(names))

    def vectorize(self, symptoms):
        """1 x n DataFrame whose columns follow the training feature order."""
        chosen = set(self.normalize(symptoms))
        row = [1 if f in chosen else 0 for f in self.features]
        return pd.DataFrame([row], columns=self.features)

    def predict(self, symptoms, top_k=3):
        selected = self.normalize(symptoms)
        proba = self.model.predict_proba(self.vectorize(selected))[0]
        order = np.argsort(proba)[::-1][:top_k]
        preds = [
            {"disease": str(self.model.classes_[i]), "score": round(float(proba[i]), 4)}
            for i in order if proba[i] > 0
        ]
        return {"selected_symptoms": selected, "predictions": preds}
