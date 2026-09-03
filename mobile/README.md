# LifeHack Mobile

Flutter iOS/Android shell for the production LifeHack web app.

## Included

- Loads [lifehack-secret.vercel.app](https://lifehack-secret.vercel.app/) inside a native Flutter WebView
- Uses the exact same UI, authentication flow, data, and behavior as the web app
- Displays loading and network-error states around the web experience

## Run locally

```bash
cd mobile
flutter pub get
flutter run
```

No Supabase keys are bundled into the mobile app; the website handles its own connection and login.

## Verify

```bash
flutter analyze
flutter test
```

## Android APK automation

GitHub Actions builds a release APK after every push to `main` that changes `mobile/`, and can also be run manually from the **Actions** tab. Each APK is retained as a GitHub Actions artifact and uploaded to Google Drive.

Before the first run, create these GitHub repository secrets:

- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`: the full JSON key for a Google Cloud service account with the Google Drive API enabled.

Share the destination Google Drive folder with the service account's `client_email` as an **Editor**. The workflow creates a file named `lifehack-<run-number>.apk` in that folder.

## iOS release

The iOS project is set up with the bundle ID `com.afifi.lifehackMobile`, iOS 13.0 minimum deployment target, and version `1.0.0 (1)`.

1. Open `ios/Runner.xcworkspace` in Xcode.
2. In **Signing & Capabilities**, choose your Apple Developer team and ensure the bundle ID is unique in your account.
3. Update `version:` in `pubspec.yaml` for each App Store upload, for example `1.0.1+2`.
4. Build an archive using `flutter build ipa --release`.
5. Upload the generated IPA in `build/ios/ipa/` to App Store Connect, complete the App Privacy form, then submit it for review.

Use `flutter build ios --release --no-codesign` to verify an unsigned release build locally.
