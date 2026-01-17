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
  // Keep the first pass short for responsiveness.
  // If a model truncates (EOF), the pipeline will bump maxTokens on the retry.
  maxTokens: 1400,
  seed: null,
  stop: [],
};
