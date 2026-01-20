use chrono::Datelike;
use serde_json::json;

use crate::types::{Reading, ReadingRequest};

pub(crate) fn generate_stub_reading(request: &ReadingRequest) -> Reading {
    let sign = zodiac_sign(&request.profile.birthdate);
    let seed = seeded_hash(&format!(
        "{}-{}-{}-{}-{}",
        request.profile.name,
        request.date,
        sign,
        request.profile.mood,
        request.profile.personality
    ));
    let mut rng = SeededRng::new(seed);

    let titles = [
        "The hush before a bright idea",
        "Soft focus, clear intention",
        "A horizon you can trust",
        "The spark beneath stillness",
        "A graceful return to center",
    ];
    let openings = vec![
        format!(
            "Today opens with a {} current that invites gentler choices.",
            request.profile.mood.to_lowercase()
        ),
        format!(
            "The day moves at a {} pace, offering room to breathe.",
            request.profile.mood.to_lowercase()
        ),
        format!(
            "You may notice a {} undertone guiding your timing.",
            request.profile.mood.to_lowercase()
        ),
    ];
    let middles = vec![
        format!(
            "As a {}, you naturally notice patterns others miss, so trust what quietly repeats.",
            request.profile.personality
        ),
        format!(
            "Your {} instincts highlight what is worth protecting and what can soften.",
            request.profile.personality.to_lowercase()
        ),
        format!(
            "The {} in you is ready to translate intuition into a simple next step.",
            request.profile.personality.to_lowercase()
        ),
    ];
    let closers = [
        "Let small rituals ground you, and remember that clarity arrives in layers, not lightning bolts.",
        "If you pause before responding, the right phrasing will rise on its own.",
        "Choose one gentle action that honors your energy, and let that be enough.",
    ];

    let message = format!(
        "{} {} {}",
        pick_string(&mut rng, &openings),
        pick_string(&mut rng, &middles),
        pick(&mut rng, &closers)
    );

    let mut themes = vec![
        "Quiet confidence",
        "Meaningful timing",
        "Boundaries with kindness",
        "Creative listening",
        "Soft courage",
        "Steady focus",
    ];
    shuffle(&mut rng, &mut themes);

    Reading {
        date: request.date.clone(),
        sign,
        title: pick(&mut rng, &titles).to_string(),
        message,
        themes: [
            themes[0].to_string(),
            themes[1].to_string(),
            themes[2].to_string(),
        ],
        affirmation: pick(
            &mut rng,
            &[
                "I meet today with grounded curiosity.",
                "I can move gently and still be powerful.",
                "My inner compass grows clearer with every breath.",
                "I honor what I feel and choose what I need.",
            ],
        )
        .to_string(),
        lucky_color: pick(
            &mut rng,
            &[
                "Moonlit Indigo",
                "Starlight Silver",
                "Luminous Lavender",
                "Sea-glass Teal",
                "Amber Mist",
            ],
        )
        .to_string(),
        lucky_number: (rng.next() * 9.0).floor() as u8 + 1,
        created_at: chrono::Utc::now().to_rfc3339(),
        source: "stub".to_string(),
    }
}

pub(crate) fn generate_stub_dashboard(request: &ReadingRequest) -> serde_json::Value {
    let sign = zodiac_sign(&request.profile.birthdate);
    let seed = seeded_hash(&format!(
        "{}-{}-{}-{}-{}",
        request.profile.name,
        request.date,
        sign,
        request.profile.mood,
        request.profile.personality
    ));
    let mut rng = SeededRng::new(seed);

    let title = pick(
        &mut rng,
        &[
            "Soft focus, clear intention",
            "The hush before a bright idea",
            "A horizon you can trust",
            "The spark beneath stillness",
            "A graceful return to center",
        ],
    );
    let openings = vec![
        format!(
            "The day opens with a {} current that invites gentler choices.",
            request.profile.mood.to_lowercase()
        ),
        format!(
            "A {} undertone guides your timing and attention.",
            request.profile.mood.to_lowercase()
        ),
        format!(
            "You move through a {} rhythm that rewards patience.",
            request.profile.mood.to_lowercase()
        ),
    ];
    let middles = vec![
        format!(
            "As {}, your {} nature notices subtle shifts first.",
            sign,
            request.profile.personality.to_lowercase()
        ),
        format!(
            "Your {} instincts highlight what wants to soften.",
            request.profile.personality.to_lowercase()
        ),
        format!(
            "The {} in you translates intuition into one clear step.",
            request.profile.personality.to_lowercase()
        ),
    ];
    let closers = vec![
        "Let small rituals ground you, and let clarity arrive in layers.".to_string(),
        "Pause before replying and your best phrasing will surface.".to_string(),
        "Choose one gentle action that honors your energy, and let that be enough.".to_string(),
    ];
    let message = format!(
        "{} {} {}",
        pick_string(&mut rng, &openings),
        pick_string(&mut rng, &middles),
        pick_string(&mut rng, &closers)
    );

    let date_label = chrono::NaiveDate::parse_from_str(&request.date, "%Y-%m-%d")
        .map(|date| date.format("%A, %B %-d").to_string())
        .unwrap_or_else(|_| request.date.clone());

    json!({
        "meta": {
            "dateISO": request.date.clone(),
            "localeDateLabel": date_label,
            "generatedAtISO": chrono::Utc::now().to_rfc3339(),
            "sign": sign,
            "name": request.profile.name.clone()
        },
        "tabs": {
            "activeDefault": "today"
        },
        "today": {
            "headline": title,
            "subhead": message,
            "theme": pick(&mut rng, &["Clarity", "Patience", "Warmth", "Alignment", "Ease"]),
            "energyScore": (rng.next() * 45.0).floor() as u8 + 55,
            "bestHours": [
                { "label": "Morning", "start": "9:00 AM", "end": "11:00 AM" },
                { "label": "Evening", "start": "5:00 PM", "end": "7:00 PM" }
            ],
            "ratings": {
                "love": (rng.next() * 3.0).floor() as u8 + 3,
                "work": (rng.next() * 3.0).floor() as u8 + 3,
                "money": (rng.next() * 3.0).floor() as u8 + 2,
                "health": (rng.next() * 3.0).floor() as u8 + 3
            },
            "lucky": {
                "color": pick(&mut rng, &["Gold", "Moonlit Indigo", "Soft Lavender", "Sea-glass Teal"]),
                "number": (rng.next() * 9.0).floor() as u8 + 1,
                "symbol": pick(&mut rng, &["★", "☾", "✦"])
            },
            "doDont": {
                "do": "Trust your instincts and keep plans simple.",
                "dont": "Overshare or rush to fill quiet moments."
            },
            "sections": [
                { "title": "Focus", "body": "Pick one clear priority and let the rest soften." },
                { "title": "Relationships", "body": "Lead with warmth and give others space to respond." },
                { "title": "Action", "body": "Take one grounded step that supports your long view." },
                { "title": "Reflection", "body": "Notice what feels steady and keep returning to it." }
            ]
        },
        "cosmicWeather": {
            "moon": {
                "phase": pick(&mut rng, &["First Quarter", "Waxing Crescent", "Full Moon", "New Moon"]),
                "sign": pick(&mut rng, &["Cancer", "Libra", "Scorpio", "Taurus"])
            },
            "transits": [
                {
                    "title": "Mercury review cycle",
                    "tone": "neutral",
                    "meaning": "Double-check details before committing."
                },
                {
                    "title": "Venus harmony",
                    "tone": "soft",
                    "meaning": "Gentle conversations land with ease."
                }
            ],
            "affectsToday": "Emotional tides rise and fall; choose calm responses."
        },
        "compatibility": {
            "bestFlowWith": ["Aries", "Gemini"],
            "handleGentlyWith": ["Taurus"],
            "tips": {
                "conflict": "Pause before replying to keep things kind.",
                "affection": "Playful honesty keeps the mood light."
            }
        },
        "journalRitual": {
            "prompt": "What feels most important to protect today?",
            "starters": ["I feel…", "I need…", "I'm avoiding…"],
            "mantra": "I move with grace and clear intention.",
            "ritual": "Light a candle and name one priority out loud.",
            "bestDayForDecisions": {
                "dayLabel": "Thursday",
                "reason": "Clarity peaks in the afternoon."
            }
        },
        "week": {
            "arc": {
                "start": "Settle into a calm, focused rhythm.",
                "midweek": "Tune inward before making changes.",
                "weekend": "Conversations flow and ease returns."
            },
            "keyOpportunity": "Strengthen a bond through simple honesty.",
            "keyCaution": "Avoid overcommitting before you feel ready.",
            "bestDayFor": {
                "decisions": "Thursday",
                "conversations": "Wednesday",
                "rest": "Sunday"
            }
        },
        "month": {
            "theme": "Clarity through gentle structure.",
            "keyDates": [
                { "dateLabel": "Jan 9–10", "title": "New Moon", "note": "Set intentions around focus." },
                { "dateLabel": "Jan 17", "title": "Personal reset", "note": "Simplify a lingering task." },
                { "dateLabel": "Jan 25", "title": "Full Moon", "note": "Release what feels heavy." }
            ],
            "newMoon": { "dateLabel": "Jan 9–10", "intention": "Commit to one steady practice." },
            "fullMoon": { "dateLabel": "Jan 25", "release": "Let go of scattered priorities." },
            "oneThing": "If you do one thing, choose the gentlest next step."
        },
        "year": {
            "headline": "A year to trust your timing and refine your craft.",
            "quarters": [
                { "label": "Q1", "focus": "Grounded beginnings and clearing space." },
                { "label": "Q2", "focus": "Momentum builds through collaboration." },
                { "label": "Q3", "focus": "Visibility grows with steady effort." },
                { "label": "Q4", "focus": "Integration and graceful completion." }
            ],
            "powerMonths": ["March", "July"],
            "challengeMonth": { "month": "October", "guidance": "Slow down and streamline." }
        }
    })
}

fn zodiac_sign(date: &str) -> String {
    let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d");
    if let Ok(date) = parsed {
        let month = date.month();
        let day = date.day();
        let sign = if (month == 3 && day >= 21) || (month == 4 && day <= 19) {
            "Aries"
        } else if (month == 4 && day >= 20) || (month == 5 && day <= 20) {
            "Taurus"
        } else if (month == 5 && day >= 21) || (month == 6 && day <= 20) {
            "Gemini"
        } else if (month == 6 && day >= 21) || (month == 7 && day <= 22) {
            "Cancer"
        } else if (month == 7 && day >= 23) || (month == 8 && day <= 22) {
            "Leo"
        } else if (month == 8 && day >= 23) || (month == 9 && day <= 22) {
            "Virgo"
        } else if (month == 9 && day >= 23) || (month == 10 && day <= 22) {
            "Libra"
        } else if (month == 10 && day >= 23) || (month == 11 && day <= 21) {
            "Scorpio"
        } else if (month == 11 && day >= 22) || (month == 12 && day <= 21) {
            "Sagittarius"
        } else if (month == 12 && day >= 22) || (month == 1 && day <= 19) {
            "Capricorn"
        } else if (month == 1 && day >= 20) || (month == 2 && day <= 18) {
            "Aquarius"
        } else {
            "Pisces"
        };
        return sign.to_string();
    }
    "Unknown".to_string()
}

fn seeded_hash(value: &str) -> u32 {
    let mut hash: u32 = 2166136261;
    for byte in value.bytes() {
        hash ^= byte as u32;
        hash = hash
            .wrapping_add(hash << 1)
            .wrapping_add(hash << 4)
            .wrapping_add(hash << 7)
            .wrapping_add(hash << 8)
            .wrapping_add(hash << 24);
    }
    hash
}

struct SeededRng {
    state: u32,
}

impl SeededRng {
    fn new(seed: u32) -> Self {
        Self { state: seed ^ 0x9e3779b9 }
    }

    fn next(&mut self) -> f32 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 17;
        self.state ^= self.state << 5;
        (self.state % 10_000) as f32 / 10_000.0
    }
}

fn pick<'a>(rng: &mut SeededRng, values: &'a [&str]) -> &'a str {
    let index = (rng.next() * values.len() as f32).floor() as usize;
    values[index % values.len()]
}

fn pick_string(rng: &mut SeededRng, values: &[String]) -> String {
    let index = (rng.next() * values.len() as f32).floor() as usize;
    values[index % values.len()].clone()
}

fn shuffle(rng: &mut SeededRng, values: &mut Vec<&str>) {
    let len = values.len();
    for i in (1..len).rev() {
        let j = (rng.next() * (i as f32 + 1.0)).floor() as usize;
        values.swap(i, j.min(i));
    }
}
