# GitHub Actions Secrets

Secrets required for CI/CD pipelines. Add these in **Settings → Secrets and variables → Actions**.

---

## CI (ci.yml)

### CODECOV_TOKEN

Codecov upload token for coverage reports. Used by both backend-test and flutter-test jobs.

**Setup:** Sign up at [codecov.io](https://codecov.io), add your repo, copy the token from the repo settings.

---

## Deploy Staging (deploy-staging.yml)

### AWS_ACCESS_KEY_ID

AWS IAM user access key for Serverless deployment.

### AWS_SECRET_ACCESS_KEY

AWS IAM user secret key.

### AWS_REGION

AWS region (e.g. `ap-southeast-2`).

### STAGING_DATABASE_URL

PostgreSQL connection string for the staging database. Used by `prisma migrate deploy`.

Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

### SERVERLESS_ACCESS_KEY

Serverless Framework or Serverless Dashboard API key (if used). May be optional if using only AWS credentials.

### SLACK_WEBHOOK_URL (Optional)

Slack incoming webhook URL for deploy success notifications. If not set, the Slack notification step will fail — remove the step or add the secret.

**Setup:** Create an incoming webhook in Slack: App → Incoming Webhooks → Add to Slack.

---

## Deploy Production (deploy-production.yml)

### AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

Same as staging (or use environment-specific secrets if configured per GitHub Environment).

### PRODUCTION_DATABASE_URL

PostgreSQL connection string for the production database.

### SERVERLESS_ACCESS_KEY

Same as staging or production-specific.

### SLACK_WEBHOOK_URL (Optional)

Slack webhook for production deploy notifications.

### iOS Signing

| Secret | Description |
|-------|-------------|
| IOS_P12_BASE64 | Base64-encoded .p12 signing certificate |
| IOS_P12_PASSWORD | Password for the .p12 file |
| IOS_BUNDLE_ID | App bundle ID (e.g. `com.tapr.app`) |
| APPSTORE_ISSUER_ID | App Store Connect API issuer ID |
| APPSTORE_KEY_ID | App Store Connect API key ID |
| APPSTORE_PRIVATE_KEY | App Store Connect API private key (PEM) |

### Android Signing

| Secret | Description |
|-------|-------------|
| ANDROID_KEYSTORE_BASE64 | Base64-encoded release keystore file |
| ANDROID_KEY_ALIAS | Keystore key alias |
| ANDROID_STORE_PASSWORD | Keystore password |
| ANDROID_KEY_PASSWORD | Key password |

---

## Store Submission (Fastlane)

### APPLE_ID

Apple Developer account email. Used by Fastlane for App Store Connect and TestFlight.

### SUPPLY_JSON_KEY_DATA

Play Store service account JSON key. Used by Fastlane `supply` for Play Store uploads.

**Setup:**
1. Go to [Play Console](https://play.google.com/console) → Setup → API access
2. Create a service account (or use existing)
3. Download the JSON key file
4. Paste the **entire file contents** as the secret value (as a single string)
