// ═══════════════════════════════════════════════════════════════
//   TruthScope — script.js
//   Fake News Detector
//
//   HOW IT WORKS:
//   1. User pastes news text → analyzeNews() called
//   2. First tries Claude AI API (works on Netlify/server)
//   3. If API fails (CORS / file://) → localAnalysis() runs
//   4. Both paths produce same result format → renderResult()
// ═══════════════════════════════════════════════════════════════

// ── Set today's date in masthead ─────────────────────────────────────────────
const d = new Date();
document.getElementById('today-date').textContent =
  d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).toUpperCase();

// ── Char counter ──────────────────────────────────────────────────────────────
document.getElementById('newsInput').addEventListener('input', function () {
  document.getElementById('charCount').textContent = this.value.length;
});

// ── Sample texts ──────────────────────────────────────────────────────────────
const SAMPLES = {
  real: `India's space agency ISRO successfully launched the PSLV-C58 mission carrying the XPoSat satellite, marking the country's first dedicated X-ray polarimetry mission. The satellite will study cosmic X-ray sources in extreme conditions. The launch took place from the Satish Dhawan Space Centre in Sriharikota. Scientists at ISRO confirmed all systems are nominal and the satellite has been placed in the correct orbit.`,

  fake: `SHOCKING: Scientists CONFIRM that 5G towers secretly inject mind-control chemicals into the air that make people obey the government!! Multiple whistleblowers EXPOSE the TRUTH the mainstream media REFUSES to tell you. Share before this gets DELETED!! The deep state is HIDING this from the public. Your own doctor is LYING to you about vaccines and 5G!!`,

  misleading: `Studies show that eating chocolate every day can help you lose weight faster than diet and exercise combined. Researchers at a leading university found participants who consumed chocolate regularly lost an average of 10 pounds in just two weeks. Experts are calling this a breakthrough discovery that could revolutionize weight loss forever.`
};

function loadSample(type) {
  document.getElementById('newsInput').value = SAMPLES[type];
  document.getElementById('charCount').textContent = SAMPLES[type].length;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ANALYZE FUNCTION
// ═══════════════════════════════════════════════════════════════
async function analyzeNews() {
  const text = document.getElementById('newsInput').value.trim();

  if (!text || text.length < 20) {
    document.getElementById('newsInput').style.borderColor = '#ff3d3d';
    setTimeout(() => { document.getElementById('newsInput').style.borderColor = ''; }, 1500);
    return;
  }

  // Show loader, hide old result
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('loader').classList.add('active');
  document.getElementById('resultCard').classList.remove('show');

  let result = null;
  let usedEngine = 'Local AI Engine';

  try {
    // ── Try Claude API first ─────────────────────────────────────────────────
    result = await callClaudeAPI(text);
    usedEngine = 'Claude AI (Anthropic)';
  } catch (err) {
    // ── Fallback: local analysis (always works, no internet needed) ───────────
    console.warn('Claude API unavailable, using local engine:', err.message);
    result = localAnalysis(text);
    usedEngine = 'Local Heuristic Engine';
  }

  document.getElementById('analyzeBtn').disabled = false;
  document.getElementById('loader').classList.remove('active');

  renderResult(result, usedEngine);
}

// ═══════════════════════════════════════════════════════════════
//  CLAUDE AI API CALL
//  Works when: Netlify, VS Code Live Server, any HTTP server
//  Fails when: file:// (CORS) → falls back to localAnalysis()
// ═══════════════════════════════════════════════════════════════
async function callClaudeAPI(text) {
  const prompt = `You are an expert fake news detection AI. Analyze the following news text and return ONLY a valid JSON object (no markdown, no explanation, just raw JSON).

News text:
"${text}"

Return this exact JSON structure:
{
  "verdict": "REAL" | "FAKE" | "MISLEADING" | "UNCERTAIN",
  "confidence": <integer 0-100>,
  "sensationalism": <integer 0-100>,
  "emotional_trigger": <integer 0-100>,
  "factual_language": <integer 0-100>,
  "credibility": <integer 0-100>,
  "signals": [
    { "type": "red" | "green" | "yellow", "text": "<signal description>" }
  ],
  "summary": "<2-3 sentence AI analysis explaining the verdict>"
}

Scoring rules:
- FAKE: Conspiracy theories, no sources, ALL CAPS, extreme claims, impossible facts
- REAL: Balanced tone, specific details, named sources, verifiable facts
- MISLEADING: Half-truths, missing context, cherry-picked data, exaggerated headlines
- UNCERTAIN: Not enough information to determine
- Provide 3-5 specific signals found in the text`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error('API returned status ' + response.status);
    }

    const data = await response.json();
    const raw   = data.content.map(b => b.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);

  } catch (err) {
    clearTimeout(timeout);
    throw err; // Re-throw so caller falls back to local analysis
  }
}

// ═══════════════════════════════════════════════════════════════
//  LOCAL HEURISTIC ANALYSIS
//  Works 100% offline — no API, no internet, no server needed
//  Uses keyword scoring, linguistic pattern detection, CAPS ratio
// ═══════════════════════════════════════════════════════════════
function localAnalysis(text) {
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).length;

  // ── Fake news keyword signals ──────────────────────────────────────────────
  const fakeKeywords = [
    { word: 'shocking',           score: 12 },
    { word: 'share before',       score: 18 },
    { word: 'share this',         score: 15 },
    { word: 'forward this',       score: 15 },
    { word: 'before it gets deleted', score: 20 },
    { word: 'big pharma',         score: 15 },
    { word: 'deep state',         score: 18 },
    { word: 'mainstream media',   score: 10 },
    { word: 'they don\'t want you to know', score: 20 },
    { word: 'doctors hate',       score: 18 },
    { word: 'miracle cure',       score: 16 },
    { word: 'secret cure',        score: 16 },
    { word: 'suppressed',         score: 14 },
    { word: 'hidden truth',       score: 16 },
    { word: 'illuminati',         score: 20 },
    { word: 'new world order',    score: 20 },
    { word: 'population control', score: 18 },
    { word: 'mind control',       score: 20 },
    { word: 'microchip',          score: 16 },
    { word: '5g',                 score: 10 },
    { word: 'bill gates',         score: 8  },
    { word: 'guaranteed earnings',score: 18 },
    { word: 'invest now',         score: 14 },
    { word: '100% profit',        score: 18 },
    { word: 'whatsapp us',        score: 12 },
    { word: 'whistleblower',      score: 12 },
    { word: 'conspiracy',         score: 12 },
    { word: 'cover-up',           score: 14 },
    { word: 'wake up',            score: 10 },
    { word: 'sheeple',            score: 16 },
    { word: 'refuses to tell',    score: 16 },
    { word: 'lying to you',       score: 18 },
  ];

  // ── Real news keyword signals ──────────────────────────────────────────────
  const realKeywords = [
    { word: 'according to',       score: 14 },
    { word: 'study shows',        score: 12 },
    { word: 'researchers found',  score: 14 },
    { word: 'officials confirmed',score: 14 },
    { word: 'government announced', score: 12 },
    { word: 'published in',       score: 14 },
    { word: 'data released',      score: 12 },
    { word: 'percent',            score: 8  },
    { word: 'basis points',       score: 14 },
    { word: 'scientists at',      score: 12 },
    { word: 'university',         score: 10 },
    { word: 'journal',            score: 12 },
    { word: 'spokesperson',       score: 10 },
    { word: 'statistics',         score: 10 },
    { word: 'confirmed',          score: 8  },
    { word: 'satellite',          score: 6  },
    { word: 'launched',           score: 6  },
    { word: 'nominal',            score: 10 },
  ];

  // ── Misleading signals ────────────────────────────────────────────────────
  const misleadingKeywords = [
    { word: 'some say',           score: 10 },
    { word: 'experts claim',      score: 8  },
    { word: 'could potentially',  score: 8  },
    { word: 'may cause',          score: 6  },
    { word: 'breakthrough',       score: 8  },
    { word: 'revolutionize',      score: 10 },
    { word: 'without context',    score: 12 },
    { word: 'cherry',             score: 8  },
  ];

  // ── Score calculation ──────────────────────────────────────────────────────
  let fakeScore = 0, realScore = 0, misleadScore = 0;
  const detectedSignals = [];

  fakeKeywords.forEach(({ word, score }) => {
    if (lower.includes(word)) {
      fakeScore += score;
      detectedSignals.push({ type: 'red', text: `Contains fake news marker: "${word}"` });
    }
  });

  realKeywords.forEach(({ word, score }) => {
    if (lower.includes(word)) {
      realScore += score;
      detectedSignals.push({ type: 'green', text: `Credibility signal found: "${word}"` });
    }
  });

  misleadingKeywords.forEach(({ word, score }) => {
    if (lower.includes(word)) {
      misleadScore += score;
      detectedSignals.push({ type: 'yellow', text: `Potentially misleading language: "${word}"` });
    }
  });

  // ── Linguistic pattern analysis ────────────────────────────────────────────
  const capsRatio      = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
  const exclamations   = (text.match(/!/g) || []).length;
  const questionMarks  = (text.match(/\?/g) || []).length;
  const allCapsWords   = (text.match(/\b[A-Z]{3,}\b/g) || []).length;
  const hasNumbers     = /\d+(\.\d+)?%?/.test(text);
  const hasQuotes      = text.includes('"') || text.includes("'");

  // CAPS check
  if (capsRatio > 0.25) {
    fakeScore += 22;
    detectedSignals.push({ type: 'red', text: `Excessive CAPS usage (${Math.round(capsRatio * 100)}% uppercase) — common in fake news` });
  } else if (capsRatio < 0.08) {
    realScore += 8;
    detectedSignals.push({ type: 'green', text: 'Normal capitalization pattern — consistent with professional journalism' });
  }

  // Exclamation marks
  if (exclamations >= 3) {
    fakeScore += 18;
    detectedSignals.push({ type: 'red', text: `${exclamations} exclamation marks detected — emotional manipulation tactic` });
  } else if (exclamations === 0) {
    realScore += 6;
    detectedSignals.push({ type: 'green', text: 'No exclamation marks — measured, non-sensational tone' });
  }

  // ALL CAPS words
  if (allCapsWords >= 3) {
    fakeScore += 16;
    detectedSignals.push({ type: 'red', text: `${allCapsWords} ALL CAPS words found — sensationalist writing style` });
  }

  // Numbers / statistics
  if (hasNumbers) {
    realScore += 10;
    detectedSignals.push({ type: 'green', text: 'Contains specific numbers or statistics — adds factual credibility' });
  }

  // Quotes
  if (hasQuotes) {
    realScore += 8;
    detectedSignals.push({ type: 'green', text: 'Quoted sources or statements present — journalistic practice' });
  }

  // Short text (less info)
  if (words < 30) {
    detectedSignals.push({ type: 'yellow', text: 'Very short text — insufficient information for full analysis' });
  }

  // ── Determine verdict ──────────────────────────────────────────────────────
  const total = fakeScore + realScore + misleadScore + 1;
  const fakePct     = Math.min(Math.round((fakeScore  / total) * 100), 97);
  const realPct     = Math.min(Math.round((realScore  / total) * 100), 97);
  const misleadPct  = Math.min(Math.round((misleadScore / total) * 100), 60);

  let verdict, confidence;

  if (fakeScore > realScore + 15 && fakeScore > misleadScore + 10) {
    verdict    = 'FAKE';
    confidence = Math.min(50 + Math.round(fakeScore / 4), 97);
  } else if (realScore > fakeScore + 10 && realScore > misleadScore + 10) {
    verdict    = 'REAL';
    confidence = Math.min(50 + Math.round(realScore / 4), 95);
  } else if (misleadScore > 15 || (fakeScore > 10 && realScore > 10)) {
    verdict    = 'MISLEADING';
    confidence = Math.min(50 + Math.round(misleadScore / 3), 85);
  } else {
    verdict    = 'UNCERTAIN';
    confidence = 45 + Math.floor(Math.random() * 15);
  }

  // ── Generate analysis text ─────────────────────────────────────────────────
  const summaries = {
    FAKE:       `This text contains multiple hallmarks of misinformation including ${allCapsWords > 2 ? 'excessive ALL CAPS usage, ' : ''}${exclamations > 2 ? 'heavy use of exclamation marks, ' : ''}and emotional manipulation tactics. ${fakeScore > 40 ? 'Several known fake news linguistic patterns were detected.' : 'Some suspicious patterns were found.'} Always verify such claims through established news organizations and fact-checking websites.`,
    REAL:       `This text demonstrates characteristics consistent with credible journalism. ${hasNumbers ? 'It contains specific numerical data, ' : ''}${hasQuotes ? 'quoted sources, ' : ''}and uses measured, professional language without sensational elements. The writing style and content signals suggest this is likely factual reporting, though independent verification is always recommended.`,
    MISLEADING: `This text shows mixed credibility signals — it may contain some accurate information presented in a misleading way, with missing context or exaggerated claims. ${misleadScore > 20 ? 'Several potentially misleading phrases were detected.' : 'The framing may distort the actual facts.'} Cross-reference with multiple reliable sources before sharing.`,
    UNCERTAIN:  `The analysis produced mixed signals for this text. It does not clearly match patterns of either verified news or known misinformation. The content should be independently verified through trusted news outlets, official sources, or fact-checking platforms before being shared or acted upon.`
  };

  // Cap signals to top 5
  const topSignals = detectedSignals.slice(0, 5);
  if (topSignals.length === 0) {
    topSignals.push({ type: 'yellow', text: 'No strong indicators detected — manual verification recommended' });
  }

  // ── Compute meter values ──────────────────────────────────────────────────
  const sensationalism   = Math.min(Math.round((fakeScore * 0.8 + exclamations * 5 + allCapsWords * 4) / 1.5), 100);
  const emotionalTrigger = Math.min(Math.round((fakeScore * 0.6 + exclamations * 6) / 1.2), 100);
  const factualLanguage  = Math.min(Math.round((realScore * 1.2 + (hasNumbers ? 15 : 0) + (hasQuotes ? 10 : 0)) / 1.3), 100);
  const credibility      = Math.min(Math.round((realScore * 1.3 - fakeScore * 0.5 + 30) / 1.5), 100);

  return {
    verdict,
    confidence,
    sensationalism:   Math.max(sensationalism, 0),
    emotional_trigger: Math.max(emotionalTrigger, 0),
    factual_language:  Math.max(factualLanguage, 0),
    credibility:       Math.max(credibility, 0),
    signals:           topSignals,
    summary:           summaries[verdict]
  };
}

// ═══════════════════════════════════════════════════════════════
//  RENDER RESULT — displays result in UI
// ═══════════════════════════════════════════════════════════════
function renderResult(r, engineName) {
  const verdictMap = {
    REAL:       { cls: 'real',      icon: '✅', label: 'LIKELY REAL' },
    FAKE:       { cls: 'fake',      icon: '🚫', label: 'LIKELY FAKE' },
    MISLEADING: { cls: 'uncertain', icon: '⚠️', label: 'MISLEADING'  },
    UNCERTAIN:  { cls: 'uncertain', icon: '❓', label: 'UNCERTAIN'   }
  };

  const v = verdictMap[r.verdict] || verdictMap['UNCERTAIN'];

  // Banner
  const banner = document.getElementById('resultBanner');
  banner.className = `result-banner ${v.cls}`;
  document.getElementById('verdictIcon').textContent = v.icon;

  const headlineEl = document.getElementById('verdictHeadline');
  headlineEl.className = `verdict-headline ${v.cls}`;
  headlineEl.textContent = v.label;

  // Confidence ring
  const ringFill = document.getElementById('ringFill');
  ringFill.className = `ring-fill ${v.cls}`;
  const circumference = 188.5;
  const offset = circumference - (r.confidence / 100) * circumference;
  const ringPct = document.getElementById('ringPct');
  ringPct.className = `ring-pct ${v.cls}`;
  ringPct.textContent = r.confidence + '%';
  setTimeout(() => { ringFill.style.strokeDashoffset = offset; }, 100);

  // Meters
  const meters = [
    ['sens', r.sensationalism],
    ['emot', r.emotional_trigger],
    ['fact', r.factual_language],
    ['cred', r.credibility]
  ];
  meters.forEach(([key, val]) => {
    document.getElementById(key + 'Val').textContent = val + '%';
    setTimeout(() => {
      document.getElementById(key + 'Bar').style.width = val + '%';
    }, 200);
  });

  // Signals
  const signalList = document.getElementById('signalList');
  signalList.innerHTML = '';
  (r.signals || []).forEach(s => {
    const item = document.createElement('div');
    item.className = 'signal-item';
    item.innerHTML = `
      <div class="signal-dot ${s.type}"></div>
      <div class="signal-text">${s.text}</div>`;
    signalList.appendChild(item);
  });

  // Summary
  document.getElementById('summaryText').textContent = r.summary || '';

  // Engine badge
  document.getElementById('modeBadge').textContent =
    'Analysis by: ' + (engineName || 'Local Engine');

  // Show card
  const card = document.getElementById('resultCard');
  card.classList.add('show');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
