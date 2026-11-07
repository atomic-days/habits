# Habits sync shortcut

The "Habits sync" shortcut reads your Health data and sends it to the data repo. You don't build it. The app hands it to you.

You need the habits key from `docs/setup.md`, the same one the app uses. It starts with `github_pat_`.

## Set it up

Do this on the iPhone, in the home-screen app.

1. On Today, find the Connect Apple Health card. It shows until the first Health data arrives.
2. Tap "Add the Health shortcut". Shortcuts opens and asks two questions. Paste your habits key into the first. Leave the second as `dhruvmetha/habits-data` unless your data repo has another name. Then tap Add Shortcut.
3. Tap "Run it once and allow Health". iOS asks which Health data the shortcut may read. Turn on all of them, then allow it to connect to api.github.com.
4. Tap "Bring in the past year". This sends 365 days and takes a few minutes. Keep the phone unlocked until it finishes.
5. Add the three automations below.

About a minute after a run, the data reaches the repo. The app reloads it the next time you switch back to it.

## Automations

iOS doesn't let a shortcut set up its own automations, so add these by hand. Open Shortcuts, tap Automation, then tap + for each one:

1. Apple Watch Workout, When Ends.
2. Time of Day, 7:30 AM, Daily.
3. Time of Day, 9:30 PM, Daily.

For each one, choose Run Shortcut, pick Habits sync, and turn on Run Immediately. Automations send the last 7 days.

## What it sends

Each run writes one text file to `data/inbox/` in the data repo. The Health inbox workflow there turns it into `data/health/YYYY-MM.json` and deletes the file. A run replaces every day in its window, so a day with no samples becomes zero.

It sends steps, exercise minutes, sleep and Running Speed samples. It can't read workouts, because no built-in Shortcuts action does that.

Runs are worked out from Running Speed, which the Apple Watch records during running workouts. The importer joins the samples into one run when they are less than 10 minutes apart, then keeps runs of at least 5 minutes and 0.5 km. The distance is an estimate, speed times time, so expect it to differ a little from what the Workout app shows. It covers runs recorded with the Apple Watch Workout app. A run tracked by another app, or an iPhone-only run, leaves no Running Speed samples and does not show up. If Health has no Running Speed data at all, the shortcut stops with a Running Speed error.

Every run of the shortcut replaces the runs for its whole window, so a run that disappears from Health disappears from the app too.

## Troubleshooting

- **Nothing new in the app.** Open https://github.com/dhruvmetha/habits-data/actions and look at the latest "Health inbox" run. Red means the import failed, and the run log names the step. No run at all means the upload didn't reach GitHub.
- **The upload fails with 401, 403 or 404.** The key is wrong, expired, or can't write to the repo. Make a new key as in `docs/setup.md`. Delete Habits sync in Shortcuts, then add it again from https://atomic-days.github.io/habits/habits-sync.shortcut and paste the new key.
- **"Add the Health shortcut" does nothing.** Open https://atomic-days.github.io/habits/ in Safari and tap the link there. If Safari downloads the file instead, open it from Downloads.
- **Run links say the shortcut can't be found.** The links look for a shortcut named exactly "Habits sync". Rename it in Shortcuts if iOS named it after the file.
- **"No Samples Found".** Health has no data of one type, for example sleep if you never log it. Tap OK and the run carries on. An automation may stop there instead. Logging one sample of that type in Health stops the alert.
- **A type is always zero.** Open the shortcut and look at the Find Health Samples action for that type. If its Type field is empty, iOS doesn't know the name the shortcut uses. Pick the type again from the list.
- **Some lines were skipped.** The Health inbox run log lists bad lines per file. A file the importer can't read at all moves to `data/inbox/failed/`.
- **A run failed while the phone was locked.** iOS blocks Health reads on a locked phone. The next run sends the same days again and fixes it.

## Updating the shortcut file

The app serves a signed copy at `public/habits-sync.shortcut`. To change the shortcut, edit `scripts/build_shortcut.py`, then run:

```
python3 scripts/build_shortcut.py
python3 scripts/check_shortcut.py
```

On a Mac, sign it so the signed file keeps the name "Habits sync":

```
cd ~/Downloads && mkdir -p signed && shortcuts sign --mode anyone --input "Habits sync.shortcut" --output "signed/Habits sync.shortcut"
```

AirDrop `signed/Habits sync.shortcut` to the iPhone. If an installed shortcut has another name, rename it to exactly "Habits sync", because the app runs it by that name.

`shortcut/FORMAT-NOTES.md` explains every key the script writes and lists what is still unconfirmed.
