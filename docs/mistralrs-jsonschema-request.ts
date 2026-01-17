const schema = `{
  "type": "object",
  "properties": {
    "meta": {
      "type": "object",
      "properties": {
        "dateISO": { "type": "string", "format": "date" },
        "localeDateLabel": { "type": "string" },
        "sign": { "type": "string" },
        "name": { "type": "string" }
      },
      "required": ["dateISO", "sign", "name"],
      "additionalProperties": false
    },
    "today": {
      "type": "object",
      "properties": {
        "headline": { "type": "string", "minLength": 5, "maxLength": 80 },
        "subhead": { "type": "string", "minLength": 10, "maxLength": 120 },
        "theme": { "type": "string" },
        "energyScore": { "type": "integer", "minimum": 0, "maximum": 100 },
        "bestHours": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "label": { "type": "string" },
              "start": { "type": "string" },
              "end": { "type": "string" }
            },
            "required": ["label", "start", "end"],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 3
        },
        "ratings": {
          "type": "object",
          "properties": {
            "love": { "type": "integer", "minimum": 1, "maximum": 5 },
            "work": { "type": "integer", "minimum": 1, "maximum": 5 },
            "money": { "type": "integer", "minimum": 1, "maximum": 5 },
            "health": { "type": "integer", "minimum": 1, "maximum": 5 }
          },
          "required": ["love", "work", "money", "health"],
          "additionalProperties": false
        },
        "lucky": {
          "type": "object",
          "properties": {
            "color": { "type": "string" },
            "number": { "type": "integer", "minimum": 1, "maximum": 99 },
            "symbol": { "type": "string" }
          },
          "required": ["color", "number", "symbol"],
          "additionalProperties": false
        },
        "doDont": {
          "type": "object",
          "properties": {
            "do": { "type": "string", "minLength": 10 },
            "dont": { "type": "string", "minLength": 10 }
          },
          "required": ["do", "dont"],
          "additionalProperties": false
        },
        "sections": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "body": { "type": "string", "minLength": 15 }
            },
            "required": ["title", "body"],
            "additionalProperties": false
          },
          "minItems": 4,
          "maxItems": 4
        }
      },
      "required": ["headline", "subhead", "theme", "energyScore", "bestHours", "ratings", "lucky", "doDont", "sections"],
      "additionalProperties": false
    }
  },
  "required": ["meta", "today"],
  "additionalProperties": false
}`;

const systemPrompt = [
  "You are Veil — a warm, feminine, premium modern astrologer. Loving aura. No doom, no medical/legal claims.",
  "Output ONLY valid JSON — nothing else. Start directly with { on the first line. End with a single } on the last line. No explanations, no markdown, no code fences, no trailing commas, no extra text.",
  "Fill the JSON structure with a calm, creative, serene daily horoscope for the user.",
].join("\n");

const userMessage = [
  "Profile:",
  "Name: Sean",
  "Birthdate: 1974-07-23",
  "Sign: Leo",
  "Mood: Serene",
  "Personality: The Dreamer",
  "Date: 2026-01-16",
].join("\n");

async function generateHoroscope() {
  const response = await fetch("http://localhost:8080/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "local-model",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      grammar: {
        type: "json_schema",
        value: schema,
      },
      temperature: 0.4,
      max_tokens: 1400,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

void generateHoroscope();
