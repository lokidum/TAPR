# CI and Store Submission Secrets

Secrets required for GitHub Actions and app store submission.

## APPLE_ID

Apple Developer account email. Used by Fastlane for App Store Connect and TestFlight.

## SUPPLY_JSON_KEY_DATA

Play Store service account JSON key. Used by Fastlane `supply` for Play Store uploads.

**Setup:**
1. Go to [Play Console](https://play.google.com/console) → Setup → API access
2. Create a service account (or use existing)
3. Download the JSON key file
4. Paste the **entire file contents** as the secret value (as a single string)
