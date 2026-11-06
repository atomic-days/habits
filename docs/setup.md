# Setup

The app lives at https://atomic-days.github.io/habits/. Your data lives in the private repo `dhruvmetha/habits-data`. You only do these steps once.

1. Create one fine-grained token at https://github.com/settings/personal-access-tokens/new. Name it "habits" and set:
   - Resource owner: `dhruvmetha`
   - Repository access: only select repositories, then `habits-data`
   - Repository permissions > Contents: Read and write
   - Expiration: the longest one offered

   GitHub shows the token once. Save it somewhere safe, such as a password manager. The app and the shortcut both use it.
2. On the iPhone, open https://atomic-days.github.io/habits/ in Safari. Tap Share, then Add to Home Screen.
3. Open the app from the new home-screen icon and paste the token there. Do not paste it in Safari, because iOS keeps the home-screen app's storage separate from Safari's.
4. Check that the six starting habits appear.
5. On Today, follow the Connect Apple Health card. It adds the Health shortcut, which asks for the same token.
6. On the card, run the shortcut once to allow Health, then bring in the past year.
7. Add the three automations the card describes. `docs/shortcut.md` has the same steps in more detail.

If the token ever leaks, delete it on GitHub, make a new one, and paste the new one into the app. Then delete the shortcut and add it again from https://atomic-days.github.io/habits/habits-sync.shortcut with the new token.
