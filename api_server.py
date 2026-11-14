from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from io import BytesIO
import gzip
import json
import joblib
import numpy as np
import pandas as pd
import os

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "models" / "NGBoost_deployment_288data.joblib"
MODEL_GZIP_PATH = Path(os.environ.get("MODEL_GZIP_PATH", "/etc/secrets/NGBoost_deployment_288data.joblib.gz"))
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "http://localhost:3000")
if MODEL_GZIP_PATH.is_file():
    MODEL = joblib.load(BytesIO(gzip.decompress(MODEL_GZIP_PATH.read_bytes())))
else:
    MODEL = joblib.load(MODEL_PATH)
POLLUTANT_MAP = {"Cd(II)": "Cd", "Pb(II)": "Pb", "As(III)": "As", "Nap": "萘", "Naphthalene": "萘"}

class API(BaseHTTPRequestHandler):
    def _headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/api/health":
            self._headers()
            self.wfile.write(json.dumps({"status": "ok", "model": "NGBoost", "n_modeling": 288}, ensure_ascii=False).encode("utf-8"))
            return
        if self.path == "/api/metrics":
            self._headers()
            result = {"model": "NGBoost", "n_modeling": 288, "n_train": 230, "n_test": 58,
                      "r2": 0.9950997145, "rmse": 2.5241557038, "mae": 1.9038054541,
                      "metric_scope": "held-out test set; removal efficiency (%)"}
            self.wfile.write(json.dumps(result).encode("utf-8"))
            return
        self._headers(404)
        self.wfile.write(b'{"error":"not found"}')

    def do_POST(self):
        if self.path not in ("/api/predict", "/api/predict/batch"):
            self._headers(404)
            self.wfile.write(b'{"error":"not found"}')
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            rows = payload if isinstance(payload, list) else [payload]
            frame = pd.DataFrame([self._row(r) for r in rows])
            prep = MODEL.named_steps["prep"].transform(frame)
            estimator = MODEL.named_steps["model"]
            dist = estimator.pred_dist(prep)
            means = np.asarray(estimator.predict(prep), dtype=float)
            scales = np.asarray(dist.params.get("scale", np.full(len(means), np.nan)), dtype=float)
            results = [{"mean": float(np.clip(mu, 0, 100)),
                        "std": float(max(0, sd)) if np.isfinite(sd) else None,
                        "lower95": float(np.clip(mu - 1.96 * sd, 0, 100)) if np.isfinite(sd) else None,
                        "upper95": float(np.clip(mu + 1.96 * sd, 0, 100)) if np.isfinite(sd) else None}
                       for mu, sd in zip(means, scales)]
            self._headers()
            body = results if self.path.endswith("/batch") else results[0]
            self.wfile.write(json.dumps(body).encode("utf-8"))
        except Exception as exc:
            self._headers(400)
            self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))

    @staticmethod
    def _row(r):
        required = ["adsorbent", "pollutant", "pH", "concentration", "volume", "mass", "time"]
        missing = [k for k in required if k not in r]
        if missing:
            raise ValueError("Missing input fields: " + ", ".join(missing))
        return {
            "吸附剂类型": str(r["adsorbent"]),
            "污染物类型": POLLUTANT_MAP.get(str(r["pollutant"]), str(r["pollutant"])),
            "初始pH值": float(r["pH"]),
            "初始浓度(mg/L)": float(r["concentration"]),
            "溶液体积(ml)": float(r["volume"]),
            "吸附剂质量(g)": float(r["mass"]),
            "吸附时间": float(r["time"]),
        }

    def log_message(self, *_args):
        pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"NGBoost inference API listening on 0.0.0.0:{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), API).serve_forever()
