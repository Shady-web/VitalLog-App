# VitalLog — Mobile (Expo) port

On-device VitalLog for Android, running all inference locally through `@qvac/sdk` in a
`react-native-bare-kit` worklet. This is the **bring-up stage**: one screen that loads the
LLM and explains a sample lab result on-device. Once it runs on a real phone (the
airplane-mode demo), the full four-screen UI is ported on top.

> **Status:** Phase 1 bring-up only. Android-only (the QVAC Expo plugin configures Android).
> Requires a **custom development build** — it does **not** run in Expo Go (native modules).

## Requirements

- Node.js 18+, and the Android toolchain: **Android Studio + SDK + NDK**, or an **EAS** account.
- An **arm64 Android device** (or arm64 emulator), **Android 10+ (minSdk 29)**.
- Network for the first model download; offline thereafter (the airplane-mode demo).

## Setup

From this `app-expo/` folder:

```bash
npm install

# Align the Expo-managed packages to your Expo SDK version (important):
npx expo install expo-build-properties expo-device expo-file-system react-native-bare-kit
npx expo-doctor
```

The QVAC Expo config plugin is already wired in `app.json`:

```json
"plugins": ["@qvac/sdk/expo-plugin"]
```

It sets the Android build properties (minSdk 29, pinned NDK, arm64-only, OpenCL) and
generates the on-device worker bundle during prebuild.

## Build & run (development build)

**Option A — local build (needs Android Studio + NDK):**
```bash
npx expo prebuild --platform android --clean
npx expo run:android        # builds the dev client and installs on a connected device
```

**Option B — EAS build (cloud, no local Android toolchain):**
```bash
npm install -g eas-cli
eas build --profile development --platform android
# install the resulting .apk on your device, then:
npx expo start --dev-client
```

On first launch, tap **Explain on-device** — it downloads the model once (~773 MB; keep
Wi-Fi on for this step only), then streams a plain-language explanation of the sample lab
result. After that it works in **airplane mode**.

## Notes / known unknowns

- **Versions:** `package.json` targets Expo SDK 53. `npx expo install` will realign the
  `expo-*` package versions to whatever Expo SDK you settle on — run it before building.
- **iOS:** the QVAC Expo plugin only configures Android today, so this targets Android.
- This bring-up reuses the same model and guardrail prompt as the desktop app; the
  `loadModel`/`completion` API is identical (the SDK auto-selects the worklet RPC client).

## Next

Once the bring-up runs on your device, the port continues: Journal (voice → transcript via
`expo-av` + Whisper), Documents (image via `expo-image-picker` → OCR → explanation), Ask
(RAG), and Summary — with on-device storage via `expo-file-system`, styled with the same
Seed design system.
