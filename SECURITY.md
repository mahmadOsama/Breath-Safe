# Security notes

## Current status

This is a sanitized student-project source showcase. It is not an operational application and must not be used for real accounts, safety-critical gas alerts, or production sensor data. Git ignore rules and placeholder configuration reduce accidental exposure in this repository, but do not fix the application's client-side trust model or guarantee that every code path is free of vulnerabilities.

## Source review for GitHub showcase

- Replaced the live Firebase project ID, web API key, app identifiers, and EmailJS client settings in source/document files with placeholders. These browser settings are not server secrets, but keeping the original project identifiers in a public sample would unnecessarily expose the project to targeting.
- `.env` and service-account JSON paths are ignored by Git. The local `serviceAccountKey.json` is absent and ignored. A read-only check of the identified service account's Keys page in the matching Google Cloud project showed no keys; the exact previously identified key ID was absent on 2026-10-21. Gitleaks findings in `.env` correspond by variable name to Firebase web configuration fields, not service-account credentials. Keep `.env` out of Git.
- Removed several sensitive console statements, including login credentials, session details, avatar data, and sensor readings. A current static scan finds 713 console calls across JavaScript and HTML; no calls matched the targeted patterns for credentials or sensor readings. Treat the remaining calls as a review queue, not proof that every message is safe.
- Replaced a user-controlled toast string and an error message with text-only DOM insertion, and removed direct interpolation of a backend error into an HTML template.
- Replaced `Math.random()`-based API token generation and predictable `-ADMIN-MASTER` tokens with 256-bit Web Crypto tokens; token validation now expects 64 hexadecimal characters. Existing stored short-format tokens are not migrated by this showcase cleanup.
- Increased the browser-side lockout durations to 15 minutes for users and 20 minutes for admins. These values are still client-controlled and cannot replace server-side throttling.
- Other UI modules still build HTML templates from application and database values. Those paths need further output-escaping review before anyone restores a backend configuration; this showcase review does not certify every template against XSS.
- Checked 41 JavaScript files with Node's syntax checker; no syntax errors remained after these edits. There are no byte-identical JavaScript files, but Firebase configuration objects are still duplicated across 18 JavaScript files. This is maintenance debt, not a security boundary.
- The code still contains browser-side password/token verification, reusable tokens in browser storage, client-side role checks, and direct database access. These are architectural vulnerabilities and cannot be made safe by hiding configuration or cleaning console output. They require a server-verified authentication/authorization design before any operational reuse.
- Passwords still appear in Firestore-facing browser code. I did not add client-side hashing or encryption: a client-side hash is still available to the client and does not make client-side authorization trustworthy. Migrate credentials to Firebase Authentication and move privileged operations behind verified server authorization.
- A static scan cannot prove a project has no vulnerabilities. Dynamic testing, Firebase rules tests, dependency review, and an independent review are still needed before production use.

### Repository pass on 2026-10-21

- Reviewed 13 HTML pages and 41 JavaScript files. All checked JavaScript files pass `node --check`; no missing local HTML or CSS asset references were found.
- Removed `document.write` from the administration pages and replaced several user-controlled avatar, account-name, error, and password-suggestion HTML insertions with text-only DOM updates. The current scan still finds 240 HTML/DOM insertion sites; these are locations to review, not 240 confirmed vulnerabilities.
- Disabled account recovery in the source showcase: removed the client code that queried and emailed/displayed reusable API tokens, removed the form and Firebase/EmailJS SDKs from that page, and left an explanatory status message. A trusted one-time reset flow is still required before operation.
- Added `npm run check:showcase` to verify deny-all rules, disabled recovery, and Git ignore rules. Added a pinned Gitleaks v3 scan of repository history to GitHub Actions; it has not run yet because this checkout has not been pushed.
- Removed status-only wording such as `OPTIMIZED`, `FIXED`, and `ENHANCED` from source comments while keeping the explanatory text.
- Added a Vite multi-page input so the build emits all 13 HTML pages. After a clean dependency install, the normal `npm run build` succeeded; Vite still warns that classic scripts are not bundled.
- After a clean dependency install, `npm test -- --runInBand` passed 44/44 tests without a filesystem shim. `npm audit --audit-level=moderate` failed with 55 advisories (18 moderate, 37 high, 0 critical); this is a current dependency/CI blocker, unlike the earlier offline audit against a stale local database.
- Five unreferenced legacy files and a separate VS Code extension remain local and ignored by Git. `.env` and a Firebase debug log remain local and ignored. The local service-account JSON is absent and ignored; a read-only check of the matching IAM service account's Keys page reported no active keys. Do not restore server integration using a service-account key.

The repository's Firestore and Realtime Database rules are deny-all and intentionally block the existing browser app. Local emulator tests now verify these denials only. The live Firebase project was not inspected or changed during the latest follow-up; do not infer production rule status from this repository. Do not loosen the rules to make the UI work.

### Historical live-project report — not independently verified in the latest follow-up

The prior report made the following claims about production state. They are retained as history, not as current verified facts. The latest follow-up did not contact Firebase production and made no changes to production rules, data, Auth users, billing, or API-key restrictions:

- The earlier review reported that Firestore and Realtime Database rules were changed to deny client access and anonymous sign-in was disabled.
- It reported deletion of 17 Firestore collections and clearing of the Realtime Database root.
- It reported the project was on the Spark plan and that previous rules were saved under ignored `.tmp/`.
- It reported that client-readable credential records had been exposed under prior public rules.

Before operational use, verify production state with the project owner. Preserving sign-up, dashboards, activity logging, settings, and sensor views requires moving credential verification to Firebase Authentication and/or a trusted backend, issuing server-verified admin authorization, and designing least-privilege rules validated on emulators. Sensor writes need an authenticated device-ingestion path. The current workspace does not contain the ESP32 firmware, so its sensor authentication path cannot be migrated or tested from this checkout.

### Local emulator rules tests and browser API keys — 2026-10-21

- Added `@firebase/rules-unit-testing`, a demo-only Jest configuration, and `npm run test:rules`. Six test cases (12 denied reads/writes) passed against Firestore and Realtime Database emulators at `127.0.0.1` using only `demo-breathsafe`. Unauthenticated, regular-user, and mocked admin-claim requests were all denied. These tests verify repository rules only, not production or application authorization.
- After a clean `npm ci`, the rules suite passed twice with Firebase CLI 15.34.0, the hub explicitly bound to `127.0.0.1:4400`, and only `demo-breathsafe`. The earlier port-4400 / “No emulators to start” failure was not reproduced; its precise cause was not established.
- The current Emulator Suite documentation requires Java JDK 11 or later. A Temurin 21 JDK was installed in the user-local programs directory without changing system PATH or the system Java configuration. The pinned local Firebase CLI avoids relying on a global installation.
- The ignored `.env` variable names classify the two Gitleaks matches as Firebase web configuration keys. Firebase documentation states such keys identify the project and do not grant database access; Security Rules and App Check enforce access. No evidence in this checkout identifies deployed hosting domains or the live keys' app/API mapping.
- Proposed, not applied: use **Websites** application restrictions with exact HTTPS referrers for each owner-verified production origin (Google's pattern examples include `example.com/*` and `*.example.com/*`); use a separate development key for localhost only if needed. Limit API restrictions to Firebase APIs required by the verified web app's products; remove unrelated API access only after checking Firebase's required-API list. Do not guess domains or change production key settings without owner approval.
- Official references: [Emulator Suite prerequisites](https://firebase.google.com/docs/emulator-suite/install_and_configure), [rules unit testing API](https://firebase.google.com/docs/rules/unit-tests), [Firebase API-key guidance](https://firebase.google.com/docs/projects/api-keys), and [Google Cloud API-key restrictions](https://cloud.google.com/api-keys/docs/add-restrictions-api-keys).
- CI now installs Temurin 21 and runs the emulator tests alongside the source checks. The emulator hub is explicitly bound to `127.0.0.1:4400`; tests target `demo-breathsafe` and verify the emulator endpoints are loopback addresses. The CI workflow YAML parsed locally; its final `npm audit --audit-level=moderate` step currently fails with 55 advisories.
- The latest fully redacted Gitleaks directory scan found two matches in the full local project, at `.env:2` and `.env:12`; the exact 98 non-ignored first-commit candidates had no findings. No matched values are recorded here.

## Deployment blockers found in the code

- Login, registration, password recovery, and role checks are implemented in browser code and interact with Firestore directly. A user can inspect or alter browser code and browser storage. Client-side role checks are not authorization.
- Admin dashboard code performs privileged reads and writes from the browser. Firestore security rules must deny unauthorized access even when requests are made outside this UI.
- Account records and API tokens are handled by client code. The admin CSV export no longer includes API tokens and now neutralizes formula-leading cells; other client paths still handle account credentials. Do not store plaintext passwords, reusable admin credentials, or authorization tokens in Firestore documents readable by clients.
- The unsafe password-recovery implementation that queried Firestore and emailed/displayed the existing API token has been removed from the showcase. Recovery is visibly disabled until a trusted Firebase Authentication reset flow is implemented. Do not restore token recovery.
- Admin pages and the executive log use `sessionStorage` fields such as `role` as their access gate. A user can edit these fields. Only server-verified claims and database rules can grant access.
- A source scan found many HTML insertion sinks. The `assignedSensorTypes` sensor card in `user-dashboard/dashboard.js` now filters values through a fixed allowlist and escapes the display label; audit the remaining sinks for untrusted database values.
- Lockout and device checks stored in browser storage can be cleared or changed by the user and cannot prevent online guessing or impersonation.
- The local service-account key file is absent and ignored. A read-only IAM check on the exact service account's Keys page in the identified project showed no keys, independently confirming the previously identified key is no longer active. The `.env` file remains ignored by Git; anyone who previously received a copy of it may have its configuration values.
- Browser Firebase configuration values are identifiers/configuration, not a way to keep a service credential secret. Restrict API keys where possible and enforce access with Firebase Authentication and database rules.
- This project monitors gas sensors. Treat displayed readings and warnings as informational until device communication, calibration, alert delivery, and failure behavior have been independently validated. Do not rely on it as a certified life-safety alarm.

## Required actions before a public or production release

1. The identified service-account key was independently confirmed absent from the matching service account's IAM Keys page on 2026-10-21, and the local JSON is absent. Recheck IAM before restoring server integration; do not create a replacement key unless a trusted server actually needs one.
2. Review Firebase Authentication providers and enable a supported authentication flow. Move privileged operations to a trusted server or Cloud Functions and derive admin access from server-verified claims.
3. Write and test deny-by-default Firestore and Realtime Database rules. Enforce user ownership, admin claims, field validation, and least privilege in the rules/backend, not only in UI code.
4. Replace the custom token/password login and recovery flows with secure, server-verified authentication. Revoke and rotate existing user/admin API tokens if they were used as credentials.
5. Remove sensitive account data and secrets from client-readable documents; use a server-side secret manager for server credentials.
6. Add integration tests for database rules and authorization denial cases before connecting real users or devices.
7. Perform an independent security review and safety validation before deployment.

## Reporting a vulnerability

Do not open a public issue containing credentials, personal data, or exploitable details. Contact the project maintainers privately. No private reporting contact is configured yet.
