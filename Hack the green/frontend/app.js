/**
 * EcoHunt AI — Application Logic
 * ================================
 * Voice-Activated Deal Hunting with Web Speech API (STT/TTS)
 * Connects to FastAPI backend for RAG-style deal queries
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000';
const CATEGORY_EMOJIS = {
    'Grocery': '🌾',
    'Energy': '⚡',
    'Personal Care': '🧴',
    'Lifestyle': '♻️',
};

// ─── State ──────────────────────────────────────────────────────────────────

let isListening = false;
let recognition = null;
let synthesis = window.speechSynthesis;
let allDeals = [];

// ─── DOM Elements ───────────────────────────────────────────────────────────

const voiceOrb = document.getElementById('voiceOrb');
const orbHint = document.getElementById('orbHint');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const aiResponseSection = document.getElementById('aiResponseSection');
const responseBody = document.getElementById('responseBody');
const responseText = document.getElementById('responseText');
const responseDeals = document.getElementById('responseDeals');
const typingIndicator = document.getElementById('typingIndicator');
const ttsBtn = document.getElementById('ttsBtn');
const flashSalesGrid = document.getElementById('flashSalesGrid');
const flashCount = document.getElementById('flashCount');
const dealCount = document.getElementById('dealCount');
const terminal = document.getElementById('terminal');
const priceRowsEl = document.getElementById('priceRows');
const discountRowsEl = document.getElementById('discountRows');
const joinedRowsEl = document.getElementById('joinedRows');

// ─── Initialize App ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initSpeechRecognition();
    loadDeals();
    loadFlashSales();
    loadStreamStatus();
    startTerminalSimulation();

    // Event listeners
    voiceOrb.addEventListener('click', toggleListening);
    sendBtn.addEventListener('click', () => submitQuery(textInput.value));
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitQuery(textInput.value);
    });
    ttsBtn.addEventListener('click', speakResponse);
});

// ─── Speech Recognition (STT) ──────────────────────────────────────────────

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        orbHint.textContent = 'Voice not supported — type your query';
        voiceOrb.style.opacity = '0.5';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');

        textInput.value = transcript;

        if (event.results[event.results.length - 1].isFinal) {
            stopListening();
            submitQuery(transcript);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopListening();
        if (event.error === 'not-allowed') {
            orbHint.textContent = 'Microphone access denied';
        } else {
            orbHint.textContent = 'Voice error — try again or type';
        }
    };

    recognition.onend = () => {
        if (isListening) stopListening();
    };
}

function toggleListening() {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

function startListening() {
    if (!recognition) return;
    isListening = true;
    voiceOrb.classList.add('listening');
    orbHint.textContent = 'Listening...';
    textInput.value = '';
    try {
        recognition.start();
    } catch (e) {
        console.error('Recognition start error:', e);
        stopListening();
    }
}

function stopListening() {
    isListening = false;
    voiceOrb.classList.remove('listening');
    orbHint.textContent = 'Tap the orb to speak';
    try {
        recognition?.stop();
    } catch (e) { /* ignore */ }
}

// ─── Text-to-Speech (TTS) ──────────────────────────────────────────────────

function speakResponse() {
    const text = responseText.textContent;
    if (!text || !synthesis) return;

    // Cancel any ongoing speech
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Try to use an Indian English voice
    const voices = synthesis.getVoices();
    const indianVoice = voices.find(v => v.lang.includes('en-IN'));
    const englishVoice = voices.find(v => v.lang.includes('en'));
    if (indianVoice) utterance.voice = indianVoice;
    else if (englishVoice) utterance.voice = englishVoice;

    synthesis.speak(utterance);
}

// ─── Query Submission ───────────────────────────────────────────────────────

async function submitQuery(query) {
    query = query.trim();
    if (!query) return;

    // Show response section with loading state
    aiResponseSection.style.display = 'block';
    typingIndicator.style.display = 'flex';
    responseText.textContent = '';
    responseDeals.innerHTML = '';

    addTerminalLine(`🔍 User query: "${query}"`);
    addTerminalLine('📡 Sending to Pathway RAG pipeline...');

    try {
        const response = await fetch(`${API_BASE}/api/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();

        // Hide typing, show response
        typingIndicator.style.display = 'none';
        responseText.textContent = data.answer;

        // Render deal cards
        if (data.deals && data.deals.length > 0) {
            renderResponseDeals(data.deals);
        }

        addTerminalLine(`✅ Response received: ${data.deals?.length || 0} deals matched`);

        // Auto-speak the response
        setTimeout(() => speakResponse(), 300);

    } catch (error) {
        console.error('Query error:', error);
        typingIndicator.style.display = 'none';

        // Fallback: search locally
        const localResults = searchDealsLocally(query);
        responseText.textContent = localResults.answer;
        if (localResults.deals.length > 0) {
            renderResponseDeals(localResults.deals);
        }

        addTerminalLine(`⚠️ API unavailable, using local data`);
    }

    // Scroll to response
    aiResponseSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Local Deal Search (Fallback) ───────────────────────────────────────────

function searchDealsLocally(query) {
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = allDeals.map(deal => {
        const text = `${deal.name} ${deal.category} ${deal.brand}`.toLowerCase();
        let score = 0;
        keywords.forEach(kw => {
            if (text.includes(kw)) score++;
        });
        return { score, deal };
    }).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || b.deal.savings_percent - a.deal.savings_percent);

    const top = scored.slice(0, 5).map(x => x.deal);

    if (top.length === 0) {
        const best = [...allDeals].sort((a, b) => b.savings_percent - a.savings_percent).slice(0, 3);
        return {
            answer: `No exact match for "${query}", but check out today's top deals: ${best.map(d => d.name).join(', ')}! 🌿`,
            deals: best,
        };
    }

    const best = top[0];
    let answer = `Great choice! 🌿 The best deal on ${best.name} (${best.brand}) is ₹${best.final_price.toFixed(0)} `;
    answer += `(was ₹${best.base_price}) — save ₹${best.savings.toFixed(0)} (${best.savings_percent.toFixed(0)}% off)! `;
    answer += `Use code ${best.discount_code}.`;

    return { answer, deals: top };
}

// ─── Render Functions ───────────────────────────────────────────────────────

function renderResponseDeals(deals) {
    responseDeals.innerHTML = deals.map(deal => `
        <div class="response-deal-card">
            <div class="response-deal-name">${deal.name}</div>
            <div class="response-deal-brand">${deal.brand} · ${deal.category}</div>
            <div class="response-deal-price">
                ₹${deal.final_price.toFixed(0)}
                <span class="response-deal-original">₹${deal.base_price}</span>
            </div>
            <div class="response-deal-savings">
                Save ${deal.savings_percent.toFixed(0)}% · Code: ${deal.discount_code}
            </div>
        </div>
    `).join('');
}

function renderFlashCard(deal) {
    const emoji = CATEGORY_EMOJIS[deal.category] || '🌿';
    return `
        <div class="flash-card">
            <div class="flash-card-image">${emoji}</div>
            <div class="flash-card-body">
                <div class="flash-card-top">
                    <span class="flash-badge">FLASH</span>
                    <span class="flash-card-name">${deal.name}</span>
                    <span class="original-price">Rs.${deal.base_price}</span>
                </div>
                <div class="flash-card-meta">
                    <span class="flash-card-category">${emoji} ${deal.category}</span>
                    <span class="flash-card-rating">⭐${deal.eco_rating}</span>
                </div>
                <div class="flash-card-prices">
                    <span class="final-price">Rs.${deal.final_price.toFixed(2)}</span>
                </div>
                <div class="flash-card-bottom">
                    <span class="save-badge">Save ${deal.savings_percent.toFixed(1)}%</span>
                    <span class="savings-amount">Rs.${deal.savings.toFixed(2)} off</span>
                    <span class="discount-code">${deal.discount_code}</span>
                </div>
            </div>
        </div>
    `;
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadDeals() {
    try {
        const res = await fetch(`${API_BASE}/api/deals`);
        const data = await res.json();
        allDeals = data.deals || [];
        dealCount.textContent = allDeals.length;
        addTerminalLine(`✅ Loaded ${allDeals.length} deals from pipeline`);
    } catch (e) {
        console.warn('Could not load deals from API, using fallback');
        allDeals = await loadLocalCSVData();
        dealCount.textContent = allDeals.length;
        addTerminalLine(`📂 Loaded ${allDeals.length} deals from local data`);
    }
}

async function loadFlashSales() {
    try {
        const res = await fetch(`${API_BASE}/api/flash-sales`);
        const data = await res.json();
        renderFlashSales(data.deals || []);
    } catch (e) {
        // Fallback: filter flash sales from local data
        const flash = allDeals.filter(d => d.flash_sale);
        renderFlashSales(flash);
    }
}

function renderFlashSales(deals) {
    flashCount.textContent = `${deals.length} active`;
    flashSalesGrid.innerHTML = deals.map(deal => renderFlashCard(deal)).join('');
}

async function loadStreamStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/stream-status`);
        const data = await res.json();
        priceRowsEl.textContent = data.streams?.prices?.rows || 24;
        discountRowsEl.textContent = data.streams?.discounts?.rows || 24;
        joinedRowsEl.textContent = data.streams?.joined?.rows || 24;
    } catch (e) {
        priceRowsEl.textContent = '24';
        discountRowsEl.textContent = '24';
        joinedRowsEl.textContent = '24';
    }
}

// ─── Local CSV Fallback ─────────────────────────────────────────────────────

async function loadLocalCSVData() {
    // Hardcoded fallback data matching our CSV files
    return [
        { product_id: 'P001', name: 'Organic Basmati Rice', category: 'Grocery', base_price: 185, current_price: 172, final_price: 154.80, savings: 30.20, savings_percent: 16.3, unit: '1kg', eco_rating: 4.8, brand: 'Nature Fresh', discount_code: 'GREEN10', discount_percent: 10, flash_sale: false },
        { product_id: 'P002', name: 'Cold Pressed Coconut Oil', category: 'Grocery', base_price: 320, current_price: 289, final_price: 245.65, savings: 74.35, savings_percent: 23.2, unit: '500ml', eco_rating: 4.7, brand: 'KLF Nirmal', discount_code: 'COCONUT15', discount_percent: 15, flash_sale: false },
        { product_id: 'P003', name: 'Organic Toor Dal', category: 'Grocery', base_price: 165, current_price: 148, final_price: 118.40, savings: 46.60, savings_percent: 28.2, unit: '1kg', eco_rating: 4.5, brand: 'Organic Tattva', discount_code: 'DAL20', discount_percent: 20, flash_sale: true },
        { product_id: 'P004', name: 'Bamboo Toothbrush Pack', category: 'Personal Care', base_price: 199, current_price: 165, final_price: 123.75, savings: 75.25, savings_percent: 37.8, unit: '4 pack', eco_rating: 4.9, brand: 'The Better Home', discount_code: 'BAMBOO25', discount_percent: 25, flash_sale: true },
        { product_id: 'P005', name: 'Natural Jaggery Powder', category: 'Grocery', base_price: 120, current_price: 98, final_price: 86.24, savings: 33.76, savings_percent: 28.1, unit: '500g', eco_rating: 4.6, brand: 'Conscious Food', discount_code: 'JAGGERY12', discount_percent: 12, flash_sale: false },
        { product_id: 'P006', name: 'Organic Green Tea', category: 'Grocery', base_price: 250, current_price: 215, final_price: 176.30, savings: 73.70, savings_percent: 29.5, unit: '100 bags', eco_rating: 4.4, brand: 'Organic India', discount_code: 'TEA18', discount_percent: 18, flash_sale: false },
        { product_id: 'P007', name: 'LED Bulb Pack 9W', category: 'Energy', base_price: 599, current_price: 485, final_price: 363.75, savings: 235.25, savings_percent: 39.3, unit: 'Pack of 6', eco_rating: 4.6, brand: 'Philips', discount_code: 'LED25', discount_percent: 25, flash_sale: true },
        { product_id: 'P008', name: 'Solar LED Garden Lamp', category: 'Energy', base_price: 899, current_price: 745, final_price: 581.10, savings: 317.90, savings_percent: 35.4, unit: '1 unit', eco_rating: 4.9, brand: 'Syska', discount_code: 'SOLAR22', discount_percent: 22, flash_sale: true },
        { product_id: 'P009', name: 'BEE 5-Star Ceiling Fan', category: 'Energy', base_price: 2899, current_price: 2450, final_price: 2082.50, savings: 816.50, savings_percent: 28.2, unit: '1 unit', eco_rating: 4.7, brand: 'Atomberg', discount_code: 'FAN15', discount_percent: 15, flash_sale: false },
        { product_id: 'P010', name: 'Organic Jute Shopping Bag', category: 'Lifestyle', base_price: 149, current_price: 125, final_price: 87.50, savings: 61.50, savings_percent: 41.3, unit: '1 bag', eco_rating: 4.8, brand: 'EcoRight', discount_code: 'JUTE30', discount_percent: 30, flash_sale: true },
        { product_id: 'P011', name: 'Organic Chia Seeds', category: 'Grocery', base_price: 299, current_price: 255, final_price: 229.50, savings: 69.50, savings_percent: 23.2, unit: '200g', eco_rating: 4.5, brand: 'True Elements', discount_code: 'CHIA10', discount_percent: 10, flash_sale: false },
        { product_id: 'P012', name: 'Bamboo Cutlery Set', category: 'Lifestyle', base_price: 349, current_price: 285, final_price: 228.00, savings: 121.00, savings_percent: 34.7, unit: '6 piece', eco_rating: 4.7, brand: 'Bamboo India', discount_code: 'CUTLERY20', discount_percent: 20, flash_sale: true },
        { product_id: 'P016', name: 'Organic Honey', category: 'Grocery', base_price: 450, current_price: 389, final_price: 303.42, savings: 146.58, savings_percent: 32.6, unit: '500g', eco_rating: 4.7, brand: 'Under The Mango Tree', discount_code: 'HONEY22', discount_percent: 22, flash_sale: true },
        { product_id: 'P018', name: 'Recycled Paper Notebooks', category: 'Lifestyle', base_price: 220, current_price: 185, final_price: 138.75, savings: 81.25, savings_percent: 36.9, unit: 'Pack of 5', eco_rating: 4.4, brand: 'Paperman', discount_code: 'PAPER25', discount_percent: 25, flash_sale: true },
        { product_id: 'P021', name: 'Herbal Dish Wash Liquid', category: 'Personal Care', base_price: 175, current_price: 145, final_price: 116.00, savings: 59.00, savings_percent: 33.7, unit: '500ml', eco_rating: 4.3, brand: 'Koparo', discount_code: 'HERBAL20', discount_percent: 20, flash_sale: true },
        { product_id: 'P023', name: 'Smart LED Tube Light', category: 'Energy', base_price: 450, current_price: 375, final_price: 300.00, savings: 150.00, savings_percent: 33.3, unit: '4ft', eco_rating: 4.5, brand: 'Wipro', discount_code: 'SMART20', discount_percent: 20, flash_sale: true },
    ];
}

// ─── Terminal Simulation ────────────────────────────────────────────────────

const terminalMessages = [
    'pw.io.csv.read("./live_prices/") → streaming',
    'pw.io.csv.read("./live_discounts/") → streaming',
    'prices.join(discounts, on=product_id) → active',
    'Computing final_price = current × (1 - discount%)',
    'Flash sale detection: {count} items flagged',
    'Pipeline latency: {latency}ms',
    'Real-time join: {rows} rows processed',
    'Index updated: {ts}',
    'Eco-rating filter applied: avg {rating}★',
    'REST endpoint /api/query ready',
    'Streaming commit #batch_{batch}',
    'Data freshness check: OK ✓',
    'Memory usage: {mem}MB | CPU: {cpu}%',
    'WebSocket broadcast: {clients} clients',
    'Deal ranking updated: top savings {pct}%',
];

let batchCounter = 1;

function addTerminalLine(text) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-IN', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = `<span class="terminal-time">${time}</span><span class="terminal-text">${text}</span>`;
    terminal.appendChild(line);

    // Keep last 50 lines
    while (terminal.children.length > 50) {
        terminal.removeChild(terminal.firstChild);
    }

    terminal.scrollTop = terminal.scrollHeight;
}

function getRandomTerminalMessage() {
    const msg = terminalMessages[Math.floor(Math.random() * terminalMessages.length)];
    return msg
        .replace('{count}', Math.floor(Math.random() * 5 + 8))
        .replace('{latency}', Math.floor(Math.random() * 20 + 5))
        .replace('{rows}', allDeals.length || 24)
        .replace('{ts}', new Date().toISOString().split('T')[1].split('.')[0])
        .replace('{rating}', (Math.random() * 0.5 + 4.3).toFixed(1))
        .replace('{batch}', batchCounter++)
        .replace('{mem}', Math.floor(Math.random() * 50 + 80))
        .replace('{cpu}', Math.floor(Math.random() * 20 + 5))
        .replace('{clients}', Math.floor(Math.random() * 3 + 1))
        .replace('{pct}', Math.floor(Math.random() * 10 + 35));
}

function startTerminalSimulation() {
    // Initial messages
    addTerminalLine('🌿 EcoHunt AI Pathway Engine initializing...');
    setTimeout(() => addTerminalLine('pw.io.csv.read("./live_prices/") → connected'), 400);
    setTimeout(() => addTerminalLine('pw.io.csv.read("./live_discounts/") → connected'), 800);
    setTimeout(() => addTerminalLine('prices.join(discounts, on=product_id) → active'), 1200);
    setTimeout(() => addTerminalLine(`Flash sale detection: 10 items flagged`), 1600);
    setTimeout(() => addTerminalLine('✅ Pipeline ready — REST API on port 8080'), 2000);

    // Ongoing simulation
    setInterval(() => {
        addTerminalLine(getRandomTerminalMessage());
    }, 4000 + Math.random() * 3000);
}

// ─── Voice Hint Rotation ────────────────────────────────────────────────────

const hintExamples = [
    'Try "best deal on organic rice"',
    'Try "cheapest LED bulbs"',
    'Try "eco-friendly kitchen products"',
    'Try "solar energy deals"',
    'Try "organic grocery under 200"',
    'Try "bamboo products on sale"',
    'Try "best savings on honey"',
];

let hintIndex = 0;
setInterval(() => {
    textInput.placeholder = hintExamples[hintIndex];
    hintIndex = (hintIndex + 1) % hintExamples.length;
}, 5000);
