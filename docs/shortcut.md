# Habits sync shortcut

This builds a shortcut called "Habits sync" in the iOS Shortcuts app. It reads your Health data day by day and sends it to the data repo. You need the habits token from `docs/setup.md`, the same one the app uses.

The shortcut takes a number of days as input. With no input, it uses 7.

## Build it

Open Shortcuts, tap +, and name the shortcut "Habits sync". Then add the actions below in order.

### 1. Work out the number of days

1. Add **If**. Set the input to Shortcut Input and the condition to "has any value".
2. Inside the If, add **Get Numbers from Input** (input: Shortcut Input), then **Set Variable** named `Days`.
3. Under Otherwise, add **Number** with the value 7, then **Set Variable** named `Days`.
4. Close with **End If**.

### 2. Make the list of days

1. Add **List** with no items, then **Set Variable** named `DayList`. Add a **Dictionary** with no keys, then **Set Variable** named `AllDays`.
2. Add **Current Date**, then **Set Variable** named `Today`.
3. Add **Repeat** with the count set to `Days`. Inside it, add **Calculate** (Repeat Index minus 1), then **Adjust Date** (Subtract that many Days from `Today`), then **Add to Variable** `DayList`. Close with **End Repeat**.

### 3. Collect each day

Add **Repeat with Each** over `DayList`. Inside it, using `Repeat Item` as the day:

1. **Adjust Date**: Get Start of Day from Repeat Item. **Set Variable** `DayStart`.
2. **Adjust Date**: Add 1 Day to `DayStart`. **Set Variable** `DayEnd`.
3. **Format Date** on `DayStart`, Date Format Custom, `yyyy-MM-dd`. **Set Variable** `DayKey`.
4. **Adjust Date**: Subtract 6 Hours from `DayStart`. **Set Variable** `SleepStart` (6 PM the day before).
5. **Adjust Date**: Add 18 Hours to `DayStart`. **Set Variable** `SleepEnd` (6 PM that day).

Steps:
1. **Find Health Samples** where Type is Steps, Start Date is in the range `DayStart` to `DayEnd`. Then **Calculate Statistics** with Sum. Set Variable `Steps`.

Sleep:
1. **Find Health Samples** where Type is Sleep Analysis, Value is Asleep (not In Bed or Awake), and End Date is between `SleepStart` and `SleepEnd`. Then **Calculate Statistics** on Duration with Sum, in minutes. Set Variable `SleepMinutes`.

Exercise minutes:
1. **Find Health Samples** where Type is Apple Exercise Time, Start Date is between `DayStart` and `DayEnd`. **Calculate Statistics** with Sum. Set Variable `ExerciseMinutes`.

Water:
1. **Find Health Samples** where Type is Water, Start Date is between `DayStart` and `DayEnd`. **Calculate Statistics** with Sum, unit mL. Add **Calculate** (divide by 1000). Set Variable `WaterLiters`.

Mindful minutes:
1. **Find Health Samples** where Type is Mindful Minutes, Start Date is between `DayStart` and `DayEnd`. **Calculate Statistics** with Sum, in minutes. Set Variable `MindfulMinutes`.

Workouts:
1. Add **Find Workouts** where Start Date is between `DayStart` and `DayEnd`. Set Variable `Workouts`.
2. Add **List** (empty), **Set Variable** `WorkoutList`.
3. **Repeat with Each** over `Workouts`. Inside, add one **Dictionary** with these keys:

| Key | Type | Value |
| --- | --- | --- |
| type | Text | Workout Type of Repeat Item |
| start | Text | Start Date of Repeat Item, formatted ISO 8601 |
| end | Text | End Date of Repeat Item, formatted ISO 8601 |
| distanceKm | Number | Distance of Repeat Item, in km |
| durationMin | Number | Duration of Repeat Item, in minutes |
| avgHeartRate | Number | Average Heart Rate of Repeat Item |

   Use **Format Date** with Date Format set to ISO 8601 for start and end. The offset (for example -05:00) must be present. Then **Add to Variable** `WorkoutList`. End the inner Repeat.

Build the day's dictionary:
1. Add **Dictionary** with these keys. Number values are plain numbers, never text.

| Key | Type | Value |
| --- | --- | --- |
| steps | Number | `Steps` |
| sleepMinutes | Number | `SleepMinutes` |
| exerciseMinutes | Number | `ExerciseMinutes` |
| waterLiters | Number | `WaterLiters` |
| mindfulMinutes | Number | `MindfulMinutes` |
| workouts | Array | `WorkoutList` |

2. Add **Set Dictionary Value** on `AllDays`: key `DayKey`, value the dictionary above.

The field names must match exactly: `steps`, `sleepMinutes`, `exerciseMinutes`, `waterLiters`, `mindfulMinutes`, `workouts`, and inside a workout `type`, `start`, `end`, `distanceKm`, `durationMin`, `avgHeartRate`. The importer rejects negative numbers and non-numbers. A missing field is fine. A day with only steps is valid.

End the Repeat with Each.

### 4. Send one POST per month

1. Add **List** with no items, then **Set Variable** `Months`. Add **Get Dictionary Keys** from `AllDays`, then **Repeat with Each** over the keys. Inside, add **Match Text** on Repeat Item with pattern `^\d{4}-\d{2}`, then **If** `Months` does not contain that match, **Add to Variable** `Months`. Close the If and the Repeat.
2. Add **Repeat with Each** over `Months`. Inside, for each `Repeat Item` (a month such as 2026-11):
   1. Add **Dictionary** with no keys, then **Set Variable** `MonthDays`.
   2. Add **Get Dictionary Keys** from `AllDays`, then **Repeat with Each** over them. Inside, add **If** Repeat Item (inner) "begins with" the outer month. In the If, add **Get Dictionary Value** (key: inner Repeat Item, from `AllDays`), then **Set Dictionary Value** on `MonthDays` with that key and value. Close the If and the inner Repeat.
   3. Add **Current Date**, then **Format Date** with Date Format ISO 8601. **Set Variable** `SentAt`.
   4. Add **Get Contents of URL** and set it as described below.
   5. Add **Wait** with 5 seconds.
3. Close with **End Repeat**.

Get Contents of URL settings:

- URL: `https://api.github.com/repos/dhruvmetha/habits-data/dispatches`
- Method: POST
- Headers:
  - `Authorization`: `Bearer ` followed by your habits token, the same one the app uses
  - `Accept`: `application/vnd.github+json`
  - `X-GitHub-Api-Version`: `2022-11-28`
- Request Body: JSON, with these fields:
  - `event_type` (Text): `health`
  - `client_payload` (Dictionary), containing:
    - `sentAt` (Text): `SentAt`
    - `days` (Dictionary): `MonthDays`

The result is a body like `{"event_type":"health","client_payload":{"sentAt":"2026-11-06T07:30:00-05:00","days":{"2026-11-05":{...}}}}`. GitHub answers 204 with no content when it accepts the event.

## Permissions

The first run asks for access to each Health type, Workouts, and to open api.github.com. Allow all of them.

## Automations

In the Shortcuts app, open the Automation tab and tap + three times. For each one, choose "Run Shortcut" with "Habits sync", set "Run Immediately", and turn Notify When Run off.

1. **Apple Watch workout ends.** Trigger: Workout, When I end a workout.
2. **7:30 AM.** Trigger: Time of Day, 7:30 AM, Daily.
3. **9:30 PM.** Trigger: Time of Day, 9:30 PM, Daily.

Automations give no input, so each run covers the last 7 days.

## One-time backfill

Open the shortcut and run it by hand. Enter 365 as the input when asked, or use a Text action with 365 that feeds into it. It sends about 12 POSTs with 5 seconds between them, so allow a couple of minutes. Run it once with 7 first to check that it works.

## Troubleshooting

- The app shows no new data. Open https://github.com/dhruvmetha/habits-data/actions and look at the latest "Health sync" run. Green means it merged. Red means open the run and read the failing step.
- No run appears at all. The POST did not reach GitHub. Run `HABITS_TOKEN=<habits token> scripts/send-test-health.sh` from the repo. It prints the HTTP status, and 204 is success. A 401 or 403 means the token is wrong, expired, or lacks Contents read and write. A 404 means the token cannot see `habits-data`. A 422 means the body was malformed.
- A run failed while the phone was locked. Health data is unreadable while the phone is locked, so some automations fail or send empty days. This is expected. The next run sends the same days again and fixes it.
- Older data overwrites nothing. The importer keeps the newer copy of each day.
