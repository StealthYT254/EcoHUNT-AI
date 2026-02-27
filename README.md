# 🌿 EcoHunt AI | Hack For Green Bharat

> **Smart deals for a greener Bharat, just a voice command away.**

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.0-009688.svg)](https://fastapi.tiangolo.com)
[![Pathway](https://img.shields.io/badge/Pathway-Real--Time-000000.svg)](https://pathway.com/)
[![Gemini](https://img.shields.io/badge/Gemini-2.0_Flash-blueviolet.svg)](https://deepmind.google/technologies/gemini/)

## 📖 Project Overview

Finding affordable, eco-friendly products in India is often a time-consuming challenge, leading many consumers to abandon sustainable choices for cheaper, less environmentally friendly alternatives. **EcoHunt AI** bridges this gap by making green shopping as easy as speaking a sentence. 

Built specifically for the **Hack For Green Bharat** hackathon, this smart, voice-activated deal-hunting assistant empowers users to effortlessly track down the best live discounts on sustainable Indian groceries, energy-efficient electronics, and personal care items. It proves that saving the planet and saving money can go hand-in-hand.

---

## ✨ Key Features

* 🎙️ **100% Voice-Controlled UI:** Frictionless, hands-free deal hunting using natural speech. Just tap the "Voice Orb" and ask for what you need (e.g., *"Find the best deal on organic rice"*).
* ⚡ **Zero-Latency Voice Processing:** Utilizes browser-native `SpeechRecognition` and `speechSynthesis` (Web Speech API) for instant STT (Speech-to-Text) and TTS (Text-to-Speech) without requiring heavy downloads or paid API keys.
* 🌊 **Real-Time Data Engine:** Simulates a live data streaming pipeline using the Pathway framework to instantly merge pricing and discount streams.
* 🧠 **RAG-Powered AI Responses:** Uses **Google Gemini 2.0 Flash** to instantly parse the live deal dataset and generate conversational, money-saving advice, including exact discount codes.
* 🎨 **Developer-Friendly Design:** A sleek Dark Mode interface with vibrant eco-green accents, a live terminal log simulation, and interactive "Flash Sale" cards perfectly aligned with the "Green Bharat" branding.

---

## 🛠️ The Architecture (Under the Hood)

EcoHunt AI was built with a clever dual-backend strategy to ensure both a flawless hackathon demo and true production readiness:

1. **The Production Engine (`pathway_server.py`):** Built using the **Pathway** framework, this script monitors live data streams. It performs real-time, in-memory joins between `live_prices.csv` and `live_discounts.csv` to calculate active savings, filter flash sales, and expose the live data via a REST API. 

2. **The Hackathon Bridge (`api_server.py`):** A lightweight **FastAPI** backend that acts as the bridge for the demo. It mirrors the Pathway data operations using Pandas (ensuring it runs natively on any OS without WSL/Docker friction during the pitch), handles CORS, serves the frontend, and acts as the RAG orchestrator for **Google Gemini 2.0 Flash**.

3. **The Data Layer:** Live CSV streams containing highly relevant, Indian-context eco-products across four categories: **Grocery**, **Energy**, **Personal Care**, and **Lifestyle**.

---

## 🚀 Getting Started (Run Locally)

### Prerequisites
* Python 3.9+
* Google Gemini API Key *(Note: Set as an environment variable `GEMINI_API_KEY`. If not set, the app gracefully falls back to local keyword-matching AI!)*

### Installation

1. **Clone the repository:**
    ```bash
    git clone [https://github.com/yourusername/ecohunt-ai.git](https://github.com/yourusername/ecohunt-ai.git)
    cd ecohunt-ai
    ```

2. **Install the required dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3. **Set your Gemini API Key:**
    ```bash
    # On Windows
    set GEMINI_API_KEY=your_api_key_here
    
    # On macOS/Linux
    export GEMINI_API_KEY="your_api_key_here"
    ```

### Running the Application

1. **Run the FastAPI Demo Bridge (Recommended for Windows/Hackathon Pitch):**
    ```bash
    python api_server.py
    ```
    * Open your browser and navigate to: **`http://localhost:8000/app`**
    * *(Microphone permissions are required for the voice assistant to function).*

2. **Run the Pathway Engine (Requires Linux/macOS/WSL):**
    ```bash
    python pathway_server.py
    ```
    * The Pathway REST API will be available at: `http://localhost:8080/query`

---

## 📂 Project Structure

```text
ecohunt-ai/
├── api_server.py          # FastAPI demo bridge and RAG orchestrator
├── pathway_server.py      # Real-time Pathway production streaming engine
├── requirements.txt       # Python dependencies
├── data/                  # Live CSV data streams
│   ├── live_prices.csv
│   └── live_discounts.csv
└── frontend/              # UI Assets
    ├── index.html
    ├── style.css
    └── app.js
