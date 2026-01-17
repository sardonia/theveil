# Dashboard UI Field Mapping

This document maps dashboard UI panels/fields to the schema keys the pipeline validates and the renderer uses.

## UI panels → schema keys

- **Hero/date/signature**
  - Date label: `meta.localeDateLabel`
  - Headline: `today.headline`
  - Subhead: `today.subhead`
  - Signature: profile name + zodiac sign (derived from `profile.name` + `profile.birthdate`), with fallback to `meta.name` + `meta.sign`.
- **Theme / energy / best hours**
  - Theme: `today.theme`
  - Energy score: `today.energyScore`
  - Best hours: `today.bestHours[].start` + `today.bestHours[].end` (exactly two entries)
- **Ratings & lucky**
  - Ratings: `today.ratings.{love,work,money,health}`
  - Lucky: `today.lucky.{color,number,symbol}`
- **Do / Don’t & sections**
  - Do/Don’t: `today.doDont.{do,dont}`
  - Sections: `today.sections[].{title,body}` (titles are `Focus`, `Relationships`, `Action`, `Reflection`)
- **Cosmic weather**
  - Moon: `cosmicWeather.moon.{phase,sign}`
  - Transits: `cosmicWeather.transits[].{title,tone,meaning}`
  - Affects today: `cosmicWeather.affectsToday`
- **Compatibility**
  - Best flow with: `compatibility.bestFlowWith[]`
  - Handle gently with: `compatibility.handleGentlyWith[]`
  - Tips: `compatibility.tips.{conflict,affection}`
- **Journal ritual**
  - Prompt: `journalRitual.prompt`
  - Starters: `journalRitual.starters[]`
  - Mantra: `journalRitual.mantra`
  - Ritual: `journalRitual.ritual`
  - Best day for decisions: `journalRitual.bestDayForDecisions.{dayLabel,reason}`
- **Week**
  - Arc: `week.arc.{start,midweek,weekend}`
  - Key opportunity: `week.keyOpportunity`
  - Key caution: `week.keyCaution`
  - Best day for: `week.bestDayFor.{decisions,conversations,rest}`
- **Month**
  - Theme: `month.theme`
  - Key dates: `month.keyDates[].{dateLabel,title,note}` (exactly three entries)
  - New moon: `month.newMoon.{dateLabel,intention}`
  - Full moon: `month.fullMoon.{dateLabel,release}`
  - One thing: `month.oneThing`
- **Year**
  - Headline: `year.headline`
  - Quarters: `year.quarters[].{label,focus}` (labels `Q1`-`Q4`)
  - Power months: `year.powerMonths[]`
  - Challenge month: `year.challengeMonth.{month,guidance}`

## Required schema keys

The validator treats these root keys and sub-fields as required (they must be present and type-correct for the payload to be accepted):

- `meta` (dateISO, localeDateLabel, generatedAtISO, sign, name)
- `tabs` (activeDefault: "today")
- `today` (headline, subhead, theme, energyScore, bestHours, ratings, lucky, doDont, sections)
- `cosmicWeather` (moon, transits, affectsToday)
- `compatibility` (bestFlowWith, handleGentlyWith, tips)
- `journalRitual` (prompt, starters, mantra, ritual, bestDayForDecisions)
- `week` (arc, keyOpportunity, keyCaution, bestDayFor)
- `month` (theme, keyDates, newMoon, fullMoon, oneThing)
- `year` (headline, quarters, powerMonths, challengeMonth)
