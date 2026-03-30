require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = 'gemini-2.5-flash';

// Robustly extract JSON from Gemini output (handles markdown fences + thinking text)
function extractJSON(raw) {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error('Raw AI response failed to parse:', raw);
    throw new Error('No JSON object found in AI response.');
  }
  return JSON.parse(match[0]);
}

app.post('/api/analyze', async (req, res) => {
  const { profileText, expLevel, prefRole, domains } = req.body;
  if (!profileText || profileText.trim().length < 20)
    return res.status(400).json({ error: 'Profile text too short.' });

  const prompt = `You are a senior tech career intelligence AI. Analyze this profile and return ONLY valid JSON — no markdown fences, no extra text.

Profile:
Resume/Skills: ${profileText.substring(0, 3500)}
Experience Level: ${expLevel || 'mid'}
Role Preference: ${prefRole || 'open'}
Domains of Interest: ${domains || 'any'}

Return exactly this JSON structure:
{
  "profile_summary": "2-sentence summary",
  "roles": [
    {"title":"Role Name","match_score":85,"reason":"Why this fits"},
    {"title":"Role Name","match_score":72,"reason":"Why this fits"},
    {"title":"Role Name","match_score":60,"reason":"Why this fits"}
  ],
  "recruiter_pov": {
    "strengths": ["Strength 1","Strength 2","Strength 3"],
    "red_flags": ["Red flag 1","Red flag 2"],
    "improvements": ["Fix 1","Fix 2","Fix 3"],
    "shortlist_probability": 65,
    "recruiter_quote": "Brutally honest 1-2 sentence quote."
  },
  "skill_gaps": [
    {"role":"Top Role","missing":[{"skill":"Skill","severity":"Critical"},{"skill":"Skill","severity":"Moderate"}]},
    {"role":"2nd Role","missing":[{"skill":"Skill","severity":"Critical"}]}
  ],
  "roadmap": [
    {"week":"Week 1-2","focus":"Focus area","resources":["Resource 1","Resource 2"],"task":"Action"},
    {"week":"Week 3-4","focus":"Focus area","resources":["Resource 1"],"task":"Action"},
    {"week":"Week 5-6","focus":"Focus area","resources":["Resource 1"],"task":"Action"},
    {"week":"Week 7-8","focus":"Focus area","resources":["Resource 1"],"task":"Action"},
    {"week":"Month 3","focus":"Focus area","resources":["Resource 1"],"task":"Action"}
  ],
  "projects": [
    {"title":"Project","description":"What and why","skills_covered":["skill1","skill2"],"difficulty":"Easy","time_estimate":"1 week"},
    {"title":"Project","description":"What and why","skills_covered":["skill1","skill2"],"difficulty":"Medium","time_estimate":"2 weeks"},
    {"title":"Project","description":"What and why","skills_covered":["skill1","skill2"],"difficulty":"Hard","time_estimate":"3-4 weeks"}
  ]
}`;

  try {
    const result = await genAI.getGenerativeModel({ model: MODEL }).generateContent(prompt);
    const raw = result.response.text();
    res.json(extractJSON(raw));
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message || 'AI analysis failed.' });
  }
});

app.post('/api/progress', async (req, res) => {
  const { profileText, improvements, originalRoles, originalGaps, originalRoadmap, expLevel, prefRole } = req.body;
  if (!improvements || improvements.trim().length < 5)
    return res.status(400).json({ error: 'Please describe what you have improved.' });

  const rolesStr = (originalRoles || []).map(r => `${r.title}: ${r.match_score}%`).join(', ');
  const gapsStr  = (originalGaps  || []).map(g => `${g.role}: ${(g.missing||[]).map(m => m.skill).join(', ')}`).join(' | ');
  const rmStr    = (originalRoadmap || []).map(r => r.focus).join(', ');

  const prompt = `You are a senior tech career AI. A user improved their skills. Return ONLY valid JSON — no markdown fences, no extra text.

ORIGINAL PROFILE: ${(profileText||'').substring(0, 1500)}
EXPERIENCE: ${expLevel||'mid'} | ROLE PREF: ${prefRole||'open'}
ORIGINAL SCORES: ${rolesStr}
ORIGINAL GAPS: ${gapsStr}
ORIGINAL ROADMAP PHASES: ${rmStr}

WHAT THEY IMPROVED:
${improvements.substring(0, 1500)}

Return ONLY this JSON (updated scores/gaps/roadmap based on improvements):
{
  "progress_summary": "2-sentence growth summary",
  "roles": [
    {"title":"Exact same title as original","match_score":90,"prev_score":85,"reason":"Updated reason"},
    {"title":"Exact same title as original","match_score":75,"prev_score":72,"reason":"Updated reason"},
    {"title":"Exact same title as original","match_score":63,"prev_score":60,"reason":"Updated reason"}
  ],
  "skill_gaps": [
    {"role":"Role name","missing":[{"skill":"skill name","severity":"Critical","resolved":false},{"skill":"learned skill","severity":"Moderate","resolved":true}]},
    {"role":"Role name","missing":[{"skill":"skill name","severity":"Critical","resolved":false}]}
  ],
  "roadmap": [
    {"week":"Week 1-2","focus":"same focus as original","completed":true,"change":"Completed - user learned X"},
    {"week":"Week 3-4","focus":"same focus as original","completed":false,"change":"Not started yet"},
    {"week":"Week 5-6","focus":"same focus as original","completed":false,"change":"Not started yet"},
    {"week":"Week 7-8","focus":"same focus as original","completed":false,"change":"Not started yet"},
    {"week":"Month 3","focus":"same focus as original","completed":false,"change":"Not started yet"}
  ],
  "key_changes": ["Specific change 1","Specific change 2","Specific change 3"]
}`;

  try {
    const result = await genAI.getGenerativeModel({ model: MODEL }).generateContent(prompt);
    const raw = result.response.text();
    res.json(extractJSON(raw));
  } catch (err) {
    console.error('Progress error:', err.message);
    res.status(500).json({ error: err.message || 'Progress analysis failed.' });
  }
});

app.get('/{*splat}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Career GPS running at http://localhost:${PORT}`));
