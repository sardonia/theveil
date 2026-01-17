export const MOODS = [
  "Serene",
  "Hopeful",
  "Restless",
  "Curious",
  "Romantic",
  "Determined",
  "Overwhelmed",
  "Playful",
  "Reflective",
  "Energized",
  "Anxious",
  "Grateful",
  "Nostalgic",
  "Bold",
  "Tender",
  "Focused",
  "Adventurous",
  "Grounded",
  "Inspired",
  "Quiet",
  "Radiant",
  "Centered",
  "Open-hearted",
  "Creative",
];

export const PERSONALITIES = [
  "The Dreamer",
  "The Sage",
  "The Seeker",
  "The Guardian",
  "The Artist",
  "The Strategist",
  "The Healer",
  "The Warrior",
  "The Mystic",
  "The Jester",
  "The Builder",
  "The Explorer",
  "The Empath",
  "The Visionary",
  "The Rebel",
  "The Harmonizer",
  "The Storyteller",
  "The Scholar",
  "The Alchemist",
  "The Wayfinder",
];

export const DEFAULT_PROFILE = {
  name: "",
  birthdate: "",
  mood: MOODS[0],
  personality: PERSONALITIES[0],
};

export const DEFAULT_SAMPLING_PARAMS = {
  temperature: 0.45,
  topP: 0.9,
  topK: 50,
  repeatPenalty: 1.1,
  // Dashboard payloads are fairly large; 1200 tokens regularly truncates JSON.
  // Keep this high enough that year/month sections don't get cut off.
  // Token budget for model output. The dashboard schema is large, and many
  // models will truncate around ~1200 tokens. We keep this generous and rely
  // on strict prompting + JSON extraction to ignore any trailing text.
  maxTokens: 3600,
  seed: null,
  stop: [],
};
