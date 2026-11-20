# run MediaPipe Face Landmarker on an image -> json (478 landmarks in px, pose matrix, blendshapes)
import sys, json, numpy as np
from PIL import Image
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
MODEL = sys.argv[3] if len(sys.argv) > 3 else None
_det = None
def detector(model):
    global _det
    if _det is None:
        _det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model), output_face_blendshapes=True,
            output_facial_transformation_matrixes=True, num_faces=1))
    return _det
def detect(path, model):
    im = Image.open(path).convert('RGB'); w, h = im.size
    r = detector(model).detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(im).copy()))
    if not r.face_landmarks: return None
    L = r.face_landmarks[0]
    return {'w': w, 'h': h, 'px': [[p.x * w, p.y * h, p.z * w] for p in L],
            'M': np.array(r.facial_transformation_matrixes[0]).tolist(),
            'bs': {c.category_name: c.score for c in r.face_blendshapes[0]}}
if __name__ == '__main__':
    d = detect(sys.argv[1], MODEL)
    json.dump(d, open(sys.argv[2], 'w'))
    print('ok' if d else 'NO FACE', d and (d['w'], d['h']))
