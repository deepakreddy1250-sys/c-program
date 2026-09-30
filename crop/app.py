import os
import random
import colorsys
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image, ImageStat, ImageFilter

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

BASE_PRICES = {
    'wheat': 2200,
    'rice': 2800,
    'maize': 2000,
    'barley': 1700,
    'soybean': 3200,
    'tomato': 4500
}

QUALITY_LABELS = ['Low Quality', 'Medium Quality', 'High Quality']

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'bmp'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def compute_image_statistics(image: Image.Image):
    rgb = image.convert('RGB')
    stat = ImageStat.Stat(rgb)
    mean_r, mean_g, mean_b = stat.mean
    max_color = max(mean_r, mean_g, mean_b)
    min_color = min(mean_r, mean_g, mean_b)
    lightness = (mean_r + mean_g + mean_b) / 3 / 255
    saturation = 0 if max_color == min_color else (max_color - min_color) / max_color
    contrast = stat.stddev[0] + stat.stddev[1] + stat.stddev[2]
    contrast = min(contrast / 50, 1.0)
    edge = rgb.filter(ImageFilter.FIND_EDGES)
    edge_stat = ImageStat.Stat(edge)
    edge_strength = sum(edge_stat.rms) / (255 * 3)
    return {
        'lightness': lightness,
        'saturation': saturation,
        'contrast': contrast,
        'edge_strength': min(edge_strength, 1.0),
        'avg_rgb': (mean_r, mean_g, mean_b)
    }


def detect_crop_type(image: Image.Image):
    stats = compute_image_statistics(image)
    mean_r, mean_g, mean_b = stats['avg_rgb']
    total = mean_r + mean_g + mean_b + 1e-6
    normalized = (mean_r / total, mean_g / total, mean_b / total)
    hue, saturation, value = colorsys.rgb_to_hsv(normalized[0], normalized[1], normalized[2])

    if value > 0.75 and saturation < 0.2:
        return 'rice'
    if (hue <= 0.05 or hue >= 0.95) and saturation > 0.35 and value > 0.35:
        return 'tomato'
    if 0.08 <= hue <= 0.18 and saturation > 0.35:
        return 'wheat'
    if 0.1 <= hue <= 0.2 and saturation > 0.45:
        return 'maize'
    if saturation < 0.3 and value < 0.6:
        return 'barley'
    return 'soybean'


def calculate_quality_score(image: Image.Image):
    stats = compute_image_statistics(image)
    score = (
        stats['lightness'] * 0.35 +
        stats['saturation'] * 0.25 +
        stats['contrast'] * 0.25 +
        stats['edge_strength'] * 0.15
    )
    return min(max(score, 0.0), 1.0)


def assign_quality_label(score: float):
    if score >= 0.72:
        return 'High Quality'
    if score >= 0.45:
        return 'Medium Quality'
    return 'Low Quality'


def predict_market_price(crop_type: str, quality_label: str):
    base_price = BASE_PRICES.get(crop_type, 2100)
    if quality_label == 'High Quality':
        return int(base_price * 1.2)
    if quality_label == 'Low Quality':
        return int(base_price * 0.8)
    return int(base_price)


def estimate_market_trend(crop_type: str):
    month = datetime.now().month
    if crop_type == 'wheat' and month in (4, 5):
        return 'up'
    if crop_type == 'rice' and month in (9, 10, 11):
        return 'up'
    if crop_type == 'maize' and month in (6, 7, 8):
        return 'up'
    if random.random() < 0.35:
        return 'down'
    return 'stable'


def build_market_trend_text(trend: str):
    if trend == 'up':
        return 'Price is trending upward'
    if trend == 'down':
        return 'Price is weakening'
    return 'Price remains stable'


def generate_recommendation(quality_label: str, trend: str):
    if quality_label == 'Low Quality':
        return 'Low Quality – Sell immediately'
    if quality_label == 'High Quality' and trend == 'up':
        return 'Sell Now – High Profit'
    if quality_label == 'High Quality' and trend == 'stable':
        return 'Sell Now – Good profit expected'
    if quality_label == 'Medium Quality' and trend == 'up':
        return 'Wait – Price may increase'
    return 'Sell Now – Moderate profit opportunity'


@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')


@app.route('/ping', methods=['GET'])
def ping():
    return jsonify({'status': 'ok'}), 200


@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file included.'}), 400

    file = request.files['image']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Use a PNG, JPG, JPEG, WEBP, or BMP image.'}), 400

    try:
        image = Image.open(file.stream)
        image.thumbnail((640, 640), Image.LANCZOS)
    except Exception:
        return jsonify({'error': 'Unable to read the image. Please upload a valid photo.'}), 400

    crop_type = detect_crop_type(image)
    quality_score = calculate_quality_score(image)
    quality_label = assign_quality_label(quality_score)
    estimated_price = predict_market_price(crop_type, quality_label)
    market_trend = estimate_market_trend(crop_type)
    recommendation = generate_recommendation(quality_label, market_trend)
    confidence_score = round(min(0.95, 0.6 + quality_score * 0.35), 2)

    return jsonify({
        'crop_type': crop_type,
        'quality_level': quality_label,
        'confidence_score': confidence_score,
        'estimated_price': estimated_price,
        'market_trend': market_trend,
        'market_trend_text': build_market_trend_text(market_trend),
        'recommendation': recommendation
    })


@app.route('/predict-quality', methods=['POST'])
def predict_quality():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file included.'}), 400

    file = request.files['image']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Use a PNG, JPG, JPEG, WEBP, or BMP image.'}), 400

    try:
        image = Image.open(file.stream)
        image.thumbnail((640, 640), Image.LANCZOS)
    except Exception:
        return jsonify({'error': 'Unable to read the image. Please upload a valid photo.'}), 400

    quality_score = calculate_quality_score(image)
    quality_label = assign_quality_label(quality_score)
    confidence_score = round(min(0.95, 0.65 + quality_score * 0.3), 2)

    return jsonify({
        'quality_level': quality_label,
        'confidence_score': confidence_score,
        'quality_score': round(quality_score, 2)
    })


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
    if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
