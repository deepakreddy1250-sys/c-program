# Smart Agriculture Profit Optimization System

A local web application for crop detection, quality analysis, price prediction, and sell/wait recommendations.

## Features
- Upload or capture crop images
- Detect crop type for wheat, rice, maize, barley, and soybean
- Analyze image-based crop quality
- Dynamic price estimation per quintal
- Smart recommendation engine
- Responsive glassmorphism dashboard UI

## Setup
1. Create a Python environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the Flask backend:
   ```bash
   python app.py
   ```
4. Open the app in your browser at `http://127.0.0.1:5000`

## API Endpoints
- `POST /predict` - upload an image file to receive crop type, quality, confidence, price, trend, and recommendation
- `POST /predict-quality` - upload an image file to receive only quality prediction details

## Notes
The backend uses image heuristics with Pillow to classify crops and quality. It is designed for demonstration and can be extended with TensorFlow or OpenCV models for production use.
