# AgentTown

AgentTown is an Expo-based, AI-ready application that runs on iOS, Android, and Web from one TypeScript codebase.

## Backend (Go + Postgres + Redis)

The repository now includes a production-oriented backend under `backend/` for non-`Agent World` features:

- Chat threads and message persistence
- Task persistence
- Bot config persistence
- Unified AI proxy endpoints

Start backend infra and API:

```bash
docker compose -f docker-compose.backend.yml up --build
```

AWS EC2 deployment notes:

- `backend/DEPLOY_AWS_EC2.md`

Frontend env should point to backend:

```bash
EXPO_PUBLIC_API_ENV=stage
# Optional custom override:
# EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
```

## Migrated Features

- Home dashboard with Town entry + WeChat-style chat list
- Chat detail with AI actions:
  - Reply suggestions
  - Task extraction
  - Brainstorm ideas
  - Custom prompt on selected message
- Bot configuration center:
  - Identity/avatar setup
  - Knowledge upload and keyword extraction
  - Skill builder form
  - Skill marketplace install + inspector
  - Editable system instructions ("MyBot Brain")
- Town map gameplay:
  - Procedural lots/markets/trees
  - Select lot + visit NPC
  - In-map NPC chat modal
- Authentication (Phase 1):
  - Google OAuth
  - Sign in with Apple (iOS)
  - Phone OTP (dev-mode in-memory code)
  - Guest mode
- Living Room gameplay:
  - House/interests/jobs/assets panels
  - House type switching linked to home state

## World Strategy (No-Engine First)

Date: 2026-02-13

### Quick conclusion

- **Phase 1:** keep everything in `Expo + React Native`, no Unity/Unreal.
- Build a real world feeling with:
  - large map dimensions
  - chunk-based streaming/rendering
  - moving vehicles/NPC markers
  - task/chat interactions linked to world points
- **Phase 2 (optional):** only introduce Unity/Unreal if we hit clear limits (performance, 3D fidelity, advanced physics, large multiplayer concurrency).

### Why no engine now

1. Fastest path to iOS + Android + Web parity.
2. Lowest integration/ops complexity while gameplay loop is still changing quickly.
3. We can still ship meaningful world scale and motion in RN with chunk loading + SVG/canvas-style rendering.
4. We avoid premature architecture lock before core retention metrics are validated.

## Hybrid Architecture (Current Plan)

### 1) Client architecture

- `Expo App Shell (React Native + Expo Router)`
  - Login / profile / social chat / task center / bot config / notifications
  - AI agent UX and orchestration entry points
- `World Runtime (No-engine renderer inside RN)`
  - Chunked map generation and lazy render
  - Road network + moving vehicles
  - Lot/NPC interactions and in-map chat
- `State + Bridge layer`
  - Shared state contracts for world events, tasks, rewards, and AI actions

### 2) Web architecture

- `Web Shell`: Expo web app handles product pages and AI workflows.
- `World Route`: same RN world logic runs on web (no separate engine runtime yet).
- `Fallback`: quality presets for low-end browsers/devices.

### 3) Backend architecture

- `API Gateway / BFF`: auth, user profile, permissions, session
- `World Service`: chunk metadata, POI/NPC definitions, spawn rules, map versioning
- `Realtime Service`: presence, events, lightweight multiplayer sync
- `Task/Quest Service`: mission graph, progression, rewards
- `Agent Orchestrator`: LLM tools, memory, planning/execution, moderation/guardrails
- `Economy Service`: inventory/assets/currency
- `Data Stack`: Postgres + Redis + object storage + analytics pipeline

### 4) AI-driven development pipeline (Mac-friendly)

- `Coding Agent`: implements tasks from issue specs
- `Test Agent`: runs unit/integration/e2e + visual snapshots
- `Review Agent`: static analysis, regression checks, API/schema diff checks
- `CI`: GitHub Actions gates merge with required checks
- `Delivery`: EAS (mobile) + web CI deploy

### 5) Monorepo layout (recommended)

```text
AgentTown/
  apps/
    shell-expo/           # current Expo app + world runtime
  packages/
    shared-types/         # DTO/event contracts
    world-runtime/        # chunk gen, route gen, map simulation
    agent-sdk/            # AI agent client + tool contracts
  services/
    api-gateway/
    world-service/
    realtime-service/
    task-service/
    agent-orchestrator/
  infra/
    terraform/
    github-actions/
```

### 6) Delivery roadmap

1. **Phase A (done/in-progress):** large world map, chunk loading, moving cars, zoom/pan.
2. **Phase B:** pathfinding + dynamic NPC states + event triggers by location.
3. **Phase C:** realtime presence + shared world events.
4. **Phase D:** if needed, migrate world runtime to Unity/Unreal behind the same backend contracts.

## Decision References

- Expo universal app workflow and platforms: https://docs.expo.dev/
- Expo custom native code + dev builds + CNG: https://docs.expo.dev/workflow/customizing/
- React Native performance overview: https://reactnative.dev/docs/performance
- React Native SVG: https://github.com/software-mansion/react-native-svg
- Unity as a Library (future option): https://docs.unity3d.com/Manual/UnityasaLibrary.html
- Unreal World Partition (future option): https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine

## Environment

- Node.js `22.22.0` (see `.nvmrc`)
- npm `10+`
- Xcode (for local iOS simulator builds on macOS)
- Android Studio + SDK (for local Android emulator builds)

## Quick Start

```bash
nvm use
npm install
npm run start
# or connect to local backend directly
# npm run start:local
```

Optional env for AI:

```bash
cp .env.example .env.local
```

Then set:

```bash
EXPO_PUBLIC_API_ENV=local
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8080
AGENTTOWN_OPENAI_API_KEY=your_openai_key
AGENTTOWN_OPENAI_MODEL=gpt-4.1-mini
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

Quick switches:

```bash
npm run start:stage
npm run start:dev
npm run start:local
```

## Authentication Notes

- OAuth screen route: `/sign-in`
- All app pages are auth-gated by `app/_layout.tsx`.
- Phone OTP is currently a local dev-mode implementation for fast iteration:
  - code is generated in app memory
  - in dev build it is shown as `DEV CODE`
  - replace with real SMS provider in backend for production

Run by platform:

```bash
npm run ios
npm run android
npm run web
```

## Native Run Scripts

When you need to run with native build pipelines (instead of Expo Go), use:

```bash
npm run ios_native
npm run android_native
```

- `ios_native`: runs `expo run:ios` and builds/installs the app to iOS Simulator (or selected iOS device).
- `android_native`: runs `expo run:android` and builds/installs the app to Android emulator (or connected Android device).

Prerequisites:

- iOS: Xcode + CocoaPods available in your shell.
- Android: Android SDK + `adb` + an emulator/device ready.

## Quality Gates

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build:web
```

## E2E Quick Commands

Team quick guide (command explanation + testing goals):

- `docs/E2E_COMMANDS_QUICK_GUIDE.md`

Recommended path:

```bash
npm run e2e:env:check:ios
npm run e2e:test:smoke
npm run e2e:test:core
npm run e2e:test:release
```

## AI-Driven Workflow

1. Create an issue for each feature/fix.
2. Let AI Agent implement changes on a branch.
3. Open PR.
4. CI runs checks (`typecheck`, `lint`, `test`, `web build`).
5. Merge only when checks pass.

## iOS Deployment (Fastlane, No EAS Submit)

This project now supports iOS deployment with Fastlane so you can build and upload TestFlight builds without EAS Submit.

### 1) One-time setup

```bash
cp .env.fastlane.example .env.fastlane
```

Fill required values in `.env.fastlane`:

```bash
ASC_KEY_ID=...
ASC_ISSUER_ID=...
ASC_KEY_BASE64=... # base64 of your .p8 key content
IOS_BUNDLE_ID=com.biceek.agenttown
APPLE_TEAM_ID=V3DJD6YM5U
```

Also ensure full Xcode is selected:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### 2) Prepare native iOS project

```bash
npm run fastlane:prepare:ios
```

### 3) Build IPA locally

```bash
npm run fastlane:build:ios
```

Output IPA path:

```text
artifacts/ios/AgentTown-<build_number>.ipa
```

### 4) Upload to TestFlight

```bash
npm run fastlane:deploy:ios
```

Optional lane parameters:

```bash
fastlane ios deploy_testflight --env fastlane changelog:"Internal QA build" groups:"Team (Expo)"
```
