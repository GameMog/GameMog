"""MOG CITY: the synthesised voices' renderer (Python, run by wagmi/radio/build/voices.mjs; not loaded by the game).

    <venv>/bin/python -I wagmi/radio/build/tts.py <job.json>

The job (written by voices.mjs, or by an audition script) names the models, the voices (wagmi/radio/build/tts-voices.mjs)
and the lines, and this writes one dry 24 kHz mono WAV per line. It prints one JSON object per line on stdout.

  job = { "models": { "qwenDesign": dir, "qwenBase": dir, "kokoroModel": file, "kokoroVoices": file },
          "refDir": dir,                       # a qwen voice's designed reference clip: <refDir>/<name>-ref.wav
          "voices": { name: { "engine": "qwen" | "kokoro", ... } },
          "lines": [ { "id", "voice", "text", "out", "fit": seconds | null, "take0": n (optional) } ] }

qwen    Qwen3-TTS 12Hz through mlx-audio. A voice with no reference clip yet is DESIGNED first (1.7B VoiceDesign, its words
        in `design`, its `seed`), and that clip is the voice from then on. Each line is then CLONED from it (0.6B Base),
        seeded by the voice's seed and the line's id, so a rebuild repeats it. A take longer than `fit` x 1.15 (what
        the build may still stretch) or a bad one (silent, or far longer or shorter than its words need) is taken again, up to
        TAKES times (twice that while every take is bad), and the shortest good one kept; "bad": true when none was.
kokoro  Kokoro-82M through kokoro-onnx: the voice (a blend {id: weight}) at its speed; a line longer than `fit` x 1.15 is
        said up to 12 % quicker. Deterministic.
crowd   a crowd saying the line together (the Camp answering the people's mic): each of `crowd` ({voice, speed, delay s,
        gain dB}) a Kokoro voice saying it, late by its delay plus a little more seeded by the line (ragged, never in
        step), mixed down, with two faint slaps off the buildings (outdoors). Deterministic.
Only the audio ships: the models are Apache-2.0, mlx-audio and kokoro-onnx MIT; the phonemizer kokoro-onnx uses is
GPL-3.0 and is run here, never vendored.
"""
import hashlib
import json
import os
import sys

# the models are local folders: never fetch anything
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import numpy as np
import soundfile as sf

SR = 24000
STRETCH = 1.15  # the build may still stretch a line this much (voices.mjs MAXK_TTS)
TAKES = 4


def trimmed_len(x, sr=SR):
    """seconds of x between its first and last sound above -45 dB of the peak (the build trims the same way)"""
    if len(x) == 0:
        return 0.0
    pk = float(np.max(np.abs(x))) or 1.0
    w = int(0.01 * sr)
    n = len(x) // w
    if n == 0:
        return len(x) / sr
    loud = np.max(np.abs(x[: n * w].reshape(n, w)), axis=1) > pk * 0.0056
    idx = np.nonzero(loud)[0]
    return 0.0 if len(idx) == 0 else (idx[-1] - idx[0] + 1) * w / sr


def runaway(x, text):
    """a bad take: far longer than its words need (the sampled models sometimes babble or hang on a sound), or far
    shorter (silence, or words dropped)"""
    words, d = max(1, len(text.split())), trimmed_len(x)
    pk = float(np.max(np.abs(x))) if len(x) else 0.0
    return pk < 0.02 or d > 1.6 + words * 0.75 or d < 0.2 + words * 0.06


def seed_of(base, key):
    return (int(base) * 1000003 + int(hashlib.sha1(key.encode()).hexdigest()[:8], 16)) % (2**31)


def write(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    x = np.asarray(x, dtype=np.float32).reshape(-1)
    pk = float(np.max(np.abs(x))) if len(x) else 0.0
    if pk > 0.99:
        x = x * (0.99 / pk)
    sf.write(path, x, SR, subtype="PCM_16")


class Qwen:
    def __init__(self, models):
        self.models, self.design_model, self.base_model = models, None, None

    def _audio(self, results):
        import mlx.core as mx
        parts = [np.array(r.audio, dtype=np.float32).reshape(-1) for r in results]
        mx.clear_cache() if hasattr(mx, "clear_cache") else None
        return np.concatenate(parts) if parts else np.zeros(0, np.float32)

    def design(self, v, ref_path):
        import mlx.core as mx
        from mlx_audio.tts.utils import load_model
        if self.design_model is None:
            self.design_model = load_model(self.models["qwenDesign"])
        best, used = None, 0
        for take in range(TAKES):  # (take n is seeded seed + 7919 n)
            mx.random.seed(int(v["seed"]) + 7919 * take)
            x = self._audio(self.design_model.generate_voice_design(text=v["refText"], language="english", instruct=v["design"]))
            if not runaway(x, v["refText"]):
                best, used = x, take
                break
            if best is None or len(x) < len(best):
                best, used = x, take
        write(ref_path, best)
        with open(ref_path[:-4] + ".json", "w") as f:
            json.dump({k: v[k] for k in ("design", "seed", "refText")} | {"take": used, "model": os.path.basename(self.models["qwenDesign"].rstrip("/"))}, f, indent=1)
        return best

    def line(self, v, ref_path, L):
        import mlx.core as mx
        from mlx_audio.tts.utils import load_model
        if self.base_model is None:
            self.base_model = load_model(self.models["qwenBase"])
        fit, best, takes, t0 = L.get("fit"), None, [], int(L.get("take0") or 0)
        # (TAKES tries; when every one of them was bad, as many again: a clone can come back empty. take0: a line's
        # first take, to hear other takes of it: cast.mjs TWEAK take)
        for take in range(t0, t0 + TAKES * 2):
            if take >= t0 + TAKES and best is not None:
                break
            s = seed_of(v["seed"], f"{L['id']}#{take}")
            mx.random.seed(s)
            x = self._audio(self.base_model.generate(text=L["text"], ref_audio=ref_path, ref_text=v["refText"], lang_code="english"))
            d = trimmed_len(x)
            takes.append((x, d, s, take))
            bad = runaway(x, L["text"])
            if not bad and (best is None or d < best[1]):
                best = (x, d, s, take)
            if not bad and (not fit or d <= fit * STRETCH):
                break
        bad = best is None
        if bad:  # every take ran away: keep the shortest that has sound in it (the build flags it)
            heard = [t for t in takes if len(t[0]) and float(np.max(np.abs(t[0]))) >= 0.02 and t[1] > 0.1]
            best = min(heard or takes, key=lambda t: t[1])
        return best[0], {"seed": best[2], "take": best[3], "takes": [round(t[1], 3) for t in takes], **({"bad": True} if bad else {})}


class Kokoro:
    def __init__(self, models):
        from kokoro_onnx import Kokoro as K
        self.k = K(models["kokoroModel"], models["kokoroVoices"])

    def crowd(self, v, L):
        rng = np.random.default_rng(seed_of(v.get("seed", 1), L["id"]))
        parts = []
        for m in v["crowd"]:
            x, sr = self.k.create(L["text"], voice=self.k.get_voice_style(m["voice"]), speed=float(m["speed"]), lang="en-us")
            assert sr == SR, sr
            x = np.asarray(x, dtype=np.float32).reshape(-1)
            pk = float(np.max(np.abs(x))) or 1.0
            lead = np.nonzero(np.abs(x) > pk * 0.0056)[0]
            x = x[int(lead[0]) if len(lead) else 0:]  # (each voice from its first sound, then late by its delay)
            rms = float(np.sqrt(np.mean(x ** 2))) or 1.0
            at = int((float(m["delay"]) + rng.uniform(0, float(v.get("jitter", 0.06)))) * SR)
            parts.append((at, x / rms * 10 ** (float(m.get("gain", 0)) / 20)))
        n = max(at + len(x) for at, x in parts)
        y = np.zeros(n + int(0.12 * SR), np.float32)
        for at, x in parts:
            y[at:at + len(x)] += x
        for d, g in v.get("slaps", [[0.047, 0.22], [0.083, 0.13]]):  # outdoors: faint slaps off the buildings
            k = int(d * SR)
            y[k:] += g * y[: len(y) - k].copy()
        return y / (float(np.max(np.abs(y))) or 1.0) * 0.9, {"voices": len(parts)}

    def line(self, v, L):
        style = sum(float(w) * self.k.get_voice_style(name) for name, w in v["voice"].items())
        speed, fit, tries = float(v["speed"]), L.get("fit"), []
        for _ in range(4):
            x, sr = self.k.create(L["text"], voice=style, speed=speed, lang="en-us")
            assert sr == SR, sr
            d = trimmed_len(x)
            tries.append([round(speed, 3), round(d, 3)])
            if not fit or d <= fit * STRETCH or speed >= float(v["speed"]) * 1.12 - 1e-6:
                break
            speed = min(float(v["speed"]) * 1.12, speed * d / (fit * STRETCH) * 1.02)
        return x, {"speed": round(speed, 3), "takes": tries}


def main(job_path):
    with open(job_path) as f:
        job = json.load(f)
    models, voices, ref_dir = job["models"], job["voices"], job.get("refDir")
    qwen, kokoro = None, None
    # first every qwen voice that has no reference clip yet is designed (then the big design model is let go)
    for name in dict.fromkeys(L["voice"] for L in job["lines"]):
        ref = os.path.join(ref_dir, f"{name}-ref.wav")
        if voices[name]["engine"] == "qwen" and not os.path.exists(ref):
            qwen = qwen or Qwen(models)
            x = qwen.design(voices[name], ref)
            print(json.dumps({"designed": name, "ref": ref, "dur": round(trimmed_len(x), 3)}), flush=True)
    if qwen and qwen.design_model is not None:
        import gc
        import mlx.core as mx
        qwen.design_model = None
        gc.collect()
        mx.clear_cache() if hasattr(mx, "clear_cache") else None
    for L in job["lines"]:
        v = voices[L["voice"]]
        if v["engine"] == "qwen":
            qwen = qwen or Qwen(models)
            x, info = qwen.line(v, os.path.join(ref_dir, f"{L['voice']}-ref.wav"), L)
        elif v["engine"] == "kokoro":
            kokoro = kokoro or Kokoro(models)
            x, info = kokoro.line(v, L)
        elif v["engine"] == "crowd":
            kokoro = kokoro or Kokoro(models)
            x, info = kokoro.crowd(v, L)
        else:
            raise SystemExit(f"unknown engine {v['engine']} for {L['voice']}")
        write(L["out"], x)
        res = {"id": L["id"], "voice": L["voice"], "out": L["out"], "dur": round(trimmed_len(x), 3), **info}
        # (what made it, beside it: the build's cache, kept even if a later line fails)
        with open(L["out"][:-4] + ".json", "w") as f:
            json.dump({"text": L["text"], "fit": L.get("fit"), "vkey": L.get("vkey"), "take0": int(L.get("take0") or 0), **res}, f, indent=1)
        print(json.dumps(res), flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
