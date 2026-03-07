// ═══════════════════════════════════════════════
// WRITING APP — Cloudflare Worker
// ═══════════════════════════════════════════════
// 
// הוראות פריסה:
// 1. צרי חשבון ב- cloudflare.com (חינם)
// 2. כנסי ל- workers.cloudflare.com ← Create Worker
// 3. הדביקי את הקוד הזה
// 4. לחצי על Settings ← Variables ← Add variable:
//    שם: ANTHROPIC_API_KEY
//    ערך: המפתח שלך מ- console.anthropic.com
//    סמני: Encrypt
// 5. לחצי Deploy
// 6. תקבלי URL כמו: https://writing-api.your-name.workers.dev
//    שמרי אותו — תכניסי אותו לאפליקציה
// ═══════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname;
    try {
      const body = await request.json();
      if (path.endsWith('/sos')) return handleSOS(body, env, cors);
      if (path.endsWith('/social')) return handleSocial(body, env, cors);
      if (path.endsWith('/feedback')) return handleFeedback(body, env, cors);
      if (path.endsWith('/poem')) return handlePoem(body, env, cors);
      return handlePrompts(body, env, cors);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }
};

async function handleSOS(body, env, cors) {
  const { problem, uploadedText, currentText, profile } = body;
  const system = `You are a compassionate creative writing coach helping a writer who is stuck.
Your job is to ask 2-3 warm, specific questions that will help them find their way forward.
Write in the same language the writer uses.
Be concise — 3-5 lines total. No preamble. Just the questions.`;

  const userMsg = [
    problem ? `הכותבת אומרת: "${problem}"` : '',
    currentText ? `מה שכתבה עד עכשיו:\n"${currentText}"` : '',
    uploadedText ? `טקסט שהעלתה:\n"${uploadedText.substring(0,600)}"` : '',
    profile?.writingType ? `סוג הכתיבה: ${profile.writingType}` : '',
  ].filter(Boolean).join('\n\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, system, messages: [{ role: 'user', content: userMsg }] }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  return new Response(JSON.stringify({ response: text }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handlePrompts(body, env, cors) {
  const { profile, recentPrompts = [], language = 'he' } = body;

  if (!profile) {
    return new Response(JSON.stringify({ error: 'Missing profile', prompts: getFallback(language) }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const systemPrompt = buildSystemPrompt(profile, recentPrompts, language);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'צרי 4 משפטי פתיחה.' }],
    }),
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ prompts: getFallback(language) }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const prompts = parsePrompts(text);

  return new Response(JSON.stringify({ prompts }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}



async function handleSocial(body, env, cors) {
  const { topic, tone, platform, limit, profile } = body;
  const system = `You are a social media writing assistant. Generate 2 post suggestions based on the topic and tone.
Platform: ${platform} (limit: ${limit} chars)
Tone: ${tone}
Write in the same language as the topic. Return JSON only: {"suggestions": ["post1", "post2"]}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:600, system, messages:[{role:'user',content:`נושא: ${topic}`}] })
  });
  const data = await resp.json();
  const text = data.content?.[0]?.text || '{}';
  try { return new Response(text, {headers:{...cors,'Content-Type':'application/json'}}); }
  catch(e) { return new Response(JSON.stringify({suggestions:[]}),{headers:{...cors,'Content-Type':'application/json'}}); }
}

async function handleFeedback(body, env, cors) {
  const { text, profile } = body;
  const system = `You are a warm, attentive reader responding to a writer's work. 
Write 1-2 sentences in response to what you just read — not critique, just a genuine reader reaction.
Write in the same language as the text. Be specific, warm, and brief.`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:150, system, messages:[{role:'user',content:text}] })
  });
  const data = await resp.json();
  const feedback = data.content?.[0]?.text || '';
  return new Response(JSON.stringify({feedback}),{headers:{...cors,'Content-Type':'application/json'}});
}


async function handlePoem(body, env, cors) {
  const { topic, profile } = body;
  const system = `You are a poetic writing assistant helping writers find the first line of a poem.
Generate 3 possible opening lines based on the theme/emotion provided.
Lines should be evocative, imagistic, and leave space for the writer to continue.
Write in the same language as the topic. Return JSON only: {"lines": ["line1", "line2", "line3"]}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:300, system, messages:[{role:'user',content:`נושא / רגש: ${topic}`}] })
  });
  const data = await resp.json();
  const text = data.content?.[0]?.text || '{"lines":[]}';
  try {
    const clean = text.replace(/```json|```/g,'').trim();
    return new Response(clean, {headers:{...cors,'Content-Type':'application/json'}});
  } catch(e) {
    return new Response('{"lines":[]}', {headers:{...cors,'Content-Type':'application/json'}});
  }
}

// ═══ PROMPT BUILDER ═══
function buildSystemPrompt(profile, recentPrompts, language) {
  const parts = [];

  parts.push(`You are a creative writing prompt generator. Your job is to generate exactly 4 opening sentences for a writer based on their personal profile.`);

  parts.push(`\nWRITER PROFILE:`);

  if (profile.writingType) parts.push(`- Writing type: ${profile.writingType}`);
  if (profile.answers?.length) {
    parts.push(`- About their life/themes:`);
    profile.answers.forEach(a => { if (a.q && a.a) parts.push(`  Q: ${a.q}\n  A: ${a.a}`); });
  }
  if (profile.freeWrite) parts.push(`- Sample of their writing:\n"${profile.freeWrite.substring(0, 600)}"`);
  if (profile.uploadedText) parts.push(`- Additional text they shared:\n"${profile.uploadedText.substring(0, 600)}"`);

  if (recentPrompts.length > 0) {
    parts.push(`\nAVOID these recently used prompts:\n${recentPrompts.slice(-20).map(p => `- "${p}"`).join('\n')}`);
  }

  parts.push(`\nINSTRUCTIONS:
- Write EXACTLY 4 opening sentences, numbered 1. 2. 3. 4.
- Write in the SAME LANGUAGE the writer uses (detected from their writing sample)
- Each sentence should feel personal, specific, and evocative — not generic
- Draw from their themes, their voice, their emotional world
- Each sentence should be a door into a story or feeling, not a full story
- Keep each sentence under 25 words
- Do not add explanations, just the 4 sentences`);

  return parts.join('\n');
}

// ═══ PARSE RESPONSE ═══
function parsePrompts(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const prompts = [];
  for (const line of lines) {
    // remove numbering like "1." "1)" "•" "-"
    const clean = line.replace(/^[\d]+[.)]\s*/, '').replace(/^[-•]\s*/, '').trim();
    if (clean.length > 10 && clean.length < 200) prompts.push(clean);
    if (prompts.length === 4) break;
  }
  return prompts;
}

// ═══ FALLBACK (if API fails) ═══
function getFallback(language) {
  const fallbacks = {
    he: [
      "הייתה תקופה שבה הגוף שלי ידע דברים שאני לא ידעתי.",
      "היא זכרה את הריח לפני שזכרה את הפנים.",
      "הגוף מחזיק דברים שהראש שכח.",
      "פתאום הבנתי שאני מחקה מישהו שכבר מת.",
    ],
    en: [
      "There was a time when my body knew things I didn't.",
      "She remembered the smell before she remembered the face.",
      "The body holds what the mind forgets.",
      "I realized I'd been imitating someone who no longer existed.",
    ]
  };
  return fallbacks[language] || fallbacks.he;
}
