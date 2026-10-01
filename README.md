# Guardian - Real Android Parental Control Application

GUARDIAN is a production-grade, two-mode Android parental control application engineered with Kotlin, Jetpack Compose, Material 3, and Firebase Cloud Services.

## Features & Supported Android APIs
- **Mode 1: Guardian / Parent Device**
  - Live Child status dashboard (Presence, Battery, Charging, Network, Last Seen)
  - Ephemeral 6-digit cryptographic pairing code generator
  - Real PING/PONG end-to-end command testing
  - Remote Camera viewing & streaming
  - Remote One-Way Audio monitoring
  - Remote Screen Mirroring (MediaProjection API)
  - Remote Flashlight control (CameraManager / Torch)
  - Live GPS tracking (FusedLocationProviderClient)
  - Usage Stats & App Management (UsageStatsManager & DevicePolicyManager)
  - Bottom Navigation: NOTICE, DEVICE, ME

- **Mode 2: Child Device**
  - Real-time transparent enrollment status (No hidden surveillance)
  - Continuous Foreground Service (`ChildForegroundService`) with persistent status notification
  - Automatic 10-second heartbeat to Firebase Firestore
  - Instant command processor for remote hardware actions
  - Native Camera2 Streaming Service (`CameraStreamService`)
  - Native AudioRecord 16-bit PCM Service (`AudioRecordService`)
  - Screen Capture MediaProjection Service (`ScreenCaptureService`)
  - Permission Center verifying Camera, Microphone, Location, Screen Capture, Notifications

## Android Requirements
- Android SDK 26 (Android 8.0 Oreo) up to Android SDK 34 (Android 14)
- Android Studio Hedgehog, Iguana, Jellyfish, or Ladybug
- JDK 17
