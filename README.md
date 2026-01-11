# Veil — Offline Horoscope Reader

Veil is a Tauri + vanilla TypeScript desktop app that delivers a daily horoscope
reading entirely offline. The Rust backend simulates an embedded model while
loading in the background and always provides a graceful stub fallback.

## Run the app

```bash
npm install
npm run tauri dev
```

## Model loading & fallback

- On launch, the frontend calls `init_model` which starts a background load and
  emits `model:status` events with progress.
- If a local model is not available, Veil automatically falls back to a
  deterministic stub generator that still feels mystical.

## Mistral.rs inference engine

Veil is wired to support a Mistral.rs backend behind a Rust feature flag. When
you are ready to integrate the engine, build with `--features mistral` and
replace the placeholder backend in `src-tauri/src/lib.rs` with real Mistral.rs
model loading and generation logic.

## Architecture highlights

- **Observer / selector subscriptions**: `src/state/store.ts`
- **Command + events**: `src/state/commands.ts`, `src/state/events.ts`
- **Event-sourced reducer**: `src/state/reducer.ts`
- **Snapshot + migrations**: `src/state/snapshot.ts`
- **Adapter + repository**: `src/adapters/*`, `src/repository/horoscopeRepository.ts`
- **Specification validation**: `src/domain/specs.ts`
- **Pipeline**: `src/pipeline/readingPipeline.ts`
- **Task queue**: `src/state/queue.ts`

## Notes

- All readings are generated locally. No network calls or external APIs.
- The stub generator is deterministic per-day and profile, so the reading is
  stable for a given date.
