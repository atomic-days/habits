# Setup

The app lives at https://atomic-days.github.io/habits/. Your data lives in the private repo `dhruvmetha/habits-data`. Do these steps once.

1. Create two fine-grained tokens at https://github.com/settings/personal-access-tokens/new. Name one "habits-app" and the other "habits-shortcut". For each one, set:
   - Resource owner: `dhruvmetha`
   - Repository access: only select repositories, then `habits-data`
   - Repository permissions > Contents: Read and write
   - Expiration: the longest one offered

   GitHub shows each token once. Save both somewhere safe, such as a password manager.
2. On the iPhone, open https://atomic-days.github.io/habits/ in Safari. Tap Share, then Add to Home Screen.
3. Open the app from the new home-screen icon and paste the habits-app token there. Do not paste it in Safari. iOS gives the home-screen app its own storage, so a token pasted in Safari does not carry over.
4. Check that the six seed habits appear.
5. Build the Health shortcut by following `docs/shortcut.md`. It uses the habits-shortcut token.
