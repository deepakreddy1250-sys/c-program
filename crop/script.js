const BACKEND_URL = 'http://127.0.0.1:5000';

const imageInput = document.getElementById('imageInput');
const dropzone = document.getElementById('dropzone');
const analyzeButton = document.getElementById('analyzeButton');
const previewImage = document.getElementById('previewImage');
const resultCard = document.getElementById('resultCard');
const loader = document.getElementById('loader');
const recommendationText = document.getElementById('recommendationText');
const qualityBadge = document.getElementById('qualityBadge');
const cropName = document.getElementById('cropName');
const qualityLevel = document.getElementById('qualityLevel');
const confidenceScore = document.getElementById('confidenceScore');
const priceEstimate = document.getElementById('priceEstimate');
const marketTrend = document.getElementById('marketTrend');
const openUpload = document.getElementById('openUpload');
const retryBackend = document.getElementById('retryBackend');
const backendInfo = document.getElementById('backendInfo');

let selectedFile = null;
let backendConnected = false;

openUpload.addEventListener('click', () => {
    imageInput.click();
});

if (retryBackend) {
    retryBackend.addEventListener('click', async () => {
        retryBackend.disabled = true;
        setBackendMessage('Retrying backend connection...');
        const connected = await checkBackendConnection();
        if (!connected) {
            setBackendMessage('Retry failed — backend still unavailable.');
        }
        retryBackend.disabled = false;
    });
}

imageInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) handleFileSelection(file);
});

['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, event => {
        event.preventDefault();
        dropzone.classList.add('active');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, event => {
        event.preventDefault();
        dropzone.classList.remove('active');
    });
});

dropzone.addEventListener('drop', event => {
    const file = event.dataTransfer.files[0];
    if (file) handleFileSelection(file);
});

function handleFileSelection(file) {
    if (!file.type.startsWith('image/')) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = () => {
        previewImage.src = reader.result;
        previewImage.classList.remove('hidden');
        resultCard.classList.add('hidden');
        setAnalyzeButtonState();
    };
    reader.readAsDataURL(file);
}

function setAnalyzeButtonState() {
    analyzeButton.disabled = !selectedFile;
}

analyzeButton.addEventListener('click', async () => {
    if (!selectedFile) return;
    loader.classList.remove('hidden');
    analyzeButton.disabled = true;

    if (backendConnected) {
        await analyzeWithBackend();
    } else {
        await analyzeWithFallback();
    }

    loader.classList.add('hidden');
    analyzeButton.disabled = false;
});

async function analyzeWithBackend() {
    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
        const response = await fetch(getApiEndpoint('/predict'), {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => null);
            throw new Error(errorPayload?.error || 'Server error. Please try again.');
        }

        const data = await response.json();
        renderResult(data);
        setBackendStatus('connected');
    } catch (error) {
        console.warn('Backend analysis failed, using local fallback:', error);
        setBackendStatus('disconnected');
        await analyzeWithFallback();
    }
}

async function analyzeWithFallback() {
    try {
        const data = await localAnalyzeImage(selectedFile);
        renderResult(data);
        backendInfo.textContent = 'Backend unavailable — analysis completed locally.';
    } catch (err) {
        alert('Unable to analyze the image locally. Please start the backend or try a different image.');
    }
}

async function localAnalyzeImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 200;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, size, size);
                const imageData = ctx.getImageData(0, 0, size, size);
                const stats = computeLocalStats(imageData);
                const crop_type = predictLocalCrop(stats);
                const quality_score = computeLocalQuality(stats);
                const quality_level = assignLocalQualityLabel(quality_score);
                const estimated_price = predictLocalPrice(crop_type, quality_level);
                const market_trend = 'stable';
                const recommendation = generateLocalRecommendation(quality_level, market_trend);
                const confidence_score = Math.round(Math.min(0.95, 0.55 + quality_score * 0.4) * 100) / 100;

                resolve({
                    crop_type,
                    quality_level,
                    confidence_score,
                    estimated_price,
                    market_trend,
                    market_trend_text: 'Local fallback estimate',
                    recommendation
                });
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function computeLocalStats(imageData) {
    const { data, width, height } = imageData;
    let r = 0, g = 0, b = 0, count = 0;
    let contrast = 0;
    let edge = 0;
    for (let i = 0; i < data.length; i += 4) {
        const dr = data[i];
        const dg = data[i + 1];
        const db = data[i + 2];
        const lum = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
        r += dr;
        g += dg;
        b += db;
        contrast += Math.abs(lum - 128);
        count += 1;
    }
    const mean_r = r / count;
    const mean_g = g / count;
    const mean_b = b / count;
    const lightness = (mean_r + mean_g + mean_b) / 3 / 255;
    const maxColor = Math.max(mean_r, mean_g, mean_b);
    const minColor = Math.min(mean_r, mean_g, mean_b);
    const saturation = maxColor === 0 ? 0 : (maxColor - minColor) / maxColor;
    const contrastNorm = Math.min(contrast / count / 64, 1);

    for (let y = 1; y < height; y += 4) {
        for (let x = 1; x < width; x += 4) {
            const idx = (y * width + x) * 4;
            const idxA = ((y - 1) * width + x) * 4;
            edge += Math.abs(data[idx] - data[idxA]) + Math.abs(data[idx + 1] - data[idxA + 1]) + Math.abs(data[idx + 2] - data[idxA + 2]);
        }
    }
    const edgeStrength = Math.min(edge / (count * 3 * 4), 1);

    return { lightness, saturation, contrast: contrastNorm, edge_strength: edgeStrength, avg_rgb: [mean_r, mean_g, mean_b] };
}

function predictLocalCrop(stats) {
    const [mean_r, mean_g, mean_b] = stats.avg_rgb;
    const total = mean_r + mean_g + mean_b + 1e-6;
    const normalized = [mean_r / total, mean_g / total, mean_b / total];
    const [h, s, v] = rgbToHsv(normalized[0], normalized[1], normalized[2]);

    if (v > 0.75 && s < 0.2) return 'rice';
    if ((h <= 0.05 || h >= 0.95) && s > 0.35 && v > 0.35) return 'tomato';
    if (0.08 <= h && h <= 0.18 && s > 0.35) return 'wheat';
    if (0.1 <= h && h <= 0.2 && s > 0.45) return 'maize';
    if (s < 0.3 && v < 0.6) return 'barley';
    return 'soybean';
}

function computeLocalQuality(stats) {
    const score = stats.lightness * 0.35 + stats.saturation * 0.25 + stats.contrast * 0.25 + stats.edge_strength * 0.15;
    return Math.min(Math.max(score, 0), 1);
}

function assignLocalQualityLabel(score) {
    if (score >= 0.72) return 'High Quality';
    if (score >= 0.45) return 'Medium Quality';
    return 'Low Quality';
}

function predictLocalPrice(crop_type, quality_label) {
    const prices = { wheat: 2200, rice: 2800, maize: 2000, barley: 1700, soybean: 3200 };
    const base = prices[crop_type] || 2100;
    if (quality_label === 'High Quality') return Math.round(base * 1.2);
    if (quality_label === 'Low Quality') return Math.round(base * 0.8);
    return base;
}

function generateLocalRecommendation(quality_label, trend) {
    if (quality_label === 'Low Quality') return 'Low Quality – Sell immediately';
    if (quality_label === 'High Quality' && trend === 'up') return 'Sell Now – High Profit';
    if (quality_label === 'High Quality' && trend === 'stable') return 'Sell Now – Good profit expected';
    if (quality_label === 'Medium Quality' && trend === 'up') return 'Wait – Price may increase';
    return 'Sell Now – Moderate profit opportunity';
}

function rgbToHsv(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    return [h / 360, s, v];
}

window.addEventListener('load', () => {
    checkBackendConnection();
    setInterval(checkBackendConnection, 5000);
});

async function checkBackendConnection() {
    try {
        const response = await fetch(getApiEndpoint('/ping'), {
            method: 'GET',
            cache: 'no-store'
        });
        const connected = response.ok && (await response.json()).status === 'ok';
        setBackendStatus(connected ? 'connected' : 'disconnected');
        return connected;
    } catch (err) {
        setBackendStatus('disconnected');
        return false;
    }
}

function setBackendStatus(status, message) {
    if (!backendInfo) return;
    backendConnected = status === 'connected';
    backendInfo.textContent = message
        ? message
        : backendConnected
            ? 'Backend connected.'
            : 'Backend disconnected — start the Flask server on 127.0.0.1:5000';
    backendInfo.className = `backend-status ${status}`;
    if (retryBackend) retryBackend.disabled = backendConnected;
    setAnalyzeButtonState();
}

function setBackendMessage(message) {
    if (!backendInfo) return;
    backendInfo.textContent = message;
}

function getApiEndpoint(path) {
    if (window.location.hostname === '127.0.0.1' && window.location.port === '5000') {
        return path;
    }
    return `${BACKEND_URL}${path}`;
}

function renderResult(data) {
    resultCard.classList.remove('hidden');
    cropName.innerText = capitalize(data.crop_type);
    qualityLevel.innerText = data.quality_level;
    confidenceScore.innerText = `${Math.round(data.confidence_score * 100)}%`;
    priceEstimate.innerText = `₹ ${data.estimated_price.toLocaleString()}`;
    marketTrend.innerText = data.market_trend_text;
    recommendationText.innerText = data.recommendation;

    qualityBadge.innerText = data.quality_level;
    qualityBadge.style.background = getBadgeColor(data.quality_level);
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function getBadgeColor(level) {
    if (level === 'High Quality') return 'rgba(97, 216, 119, 0.16)';
    if (level === 'Medium Quality') return 'rgba(255, 207, 93, 0.16)';
    return 'rgba(255, 105, 105, 0.16)';
}
