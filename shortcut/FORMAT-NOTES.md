# Shortcut file format notes

These notes back `scripts/build_shortcut.py`. Each key below comes from a source listed at the end. Where sources disagree or nothing confirms a detail, the notes say so. Read "Open questions" before trusting the file on a phone.

## The file

An unsigned `.shortcut` is a property list (binary or XML). iOS will not import it until it is signed, so run `shortcuts sign --mode anyone --input <in> --output <out>` on a Mac first.

Top-level keys, as they appear in real exports from Shortcuts client 4610 (getWeekRange.plist, get-calendar-events.plist):

| Key | Value we write |
| --- | --- |
| `WFWorkflowActions` | the action list |
| `WFWorkflowClientVersion` | `"4033.0.4.3"`, the iOS 26 value Cherri uses |
| `WFWorkflowMinimumClientVersion` | `900` |
| `WFWorkflowMinimumClientVersionString` | `"900"` |
| `WFWorkflowIcon` | `{WFWorkflowIconGlyphNumber, WFWorkflowIconStartColor}` |
| `WFWorkflowImportQuestions` | see below |
| `WFWorkflowInputContentItemClasses` | `["WFNumberContentItem", "WFStringContentItem"]` |
| `WFWorkflowOutputContentItemClasses` | `[]` |
| `WFWorkflowHasShortcutInputVariables` | `true` |
| `WFWorkflowHasOutputFallback` | `false` |
| `WFWorkflowTypes` | `[]` |
| `WFQuickActionSurfaces` | `[]` |

Every action is `{WFWorkflowActionIdentifier, WFWorkflowActionParameters}`. An action whose output is used later carries a `UUID` parameter. Shortcuts finds the output by that UUID. `OutputName` is only the label shown in the editor.

## Import questions

Seen in two real exports:

```
{ActionIndex: 3, Category: "Parameter", ParameterKey: "WFTextActionText", Text: "Notion API Key"}
{ActionIndex: 0, Category: "Parameter", DefaultValue: "", ParameterKey: "WFTextActionText", Text: "What is your first name?"}
```

`ActionIndex` is the zero-based position in `WFWorkflowActions`. The answer replaces that action's `ParameterKey`. Cherri builds the same shape in `generateImportQuestions` (shortcutgen.go). The target is a Text action (`is.workflow.actions.gettext`), whose text key is `WFTextActionText`.

## Values and variable references

- Output of an earlier action, as a whole parameter: `{Value: {Type: "ActionOutput", OutputUUID, OutputName}, WFSerializationType: "WFTextTokenAttachment"}`.
- Text with variables inside: `{Value: {string, attachmentsByRange}, WFSerializationType: "WFTextTokenString"}`. Each variable is a U+FFFC character in `string`, and `attachmentsByRange` maps `"{position, 1}"` to the reference. The position counts UTF-16 code units (Cherri `mapInlineVariables`).
- Shortcut Input: `{Type: "ExtensionInput"}`.
- Repeat Item: `{Type: "Variable", VariableName: "Repeat Item"}`.
- The result of an If block is the output of the End If action, so the End If action gets a UUID (Cherri `makeConditionalAction`).
- Control flow actions share a `GroupingIdentifier`. `WFControlFlowMode` is 0 to start, 1 for Otherwise, 2 to end (Cherri constants `startStatement`, `statementPart`, `endStatement`).

## Actions used

All identifiers start with `is.workflow.actions.`.

| Action | Identifier | Parameters |
| --- | --- | --- |
| Text | `gettext` | `WFTextActionText` |
| Number | `number` | `WFNumberActionNumber`, a number or a `WFTextTokenAttachment` |
| Get Numbers from Input | `detect.number` | `WFInput` |
| If | `conditional` | `WFInput: {Type: "Variable", Variable: <attachment>}`, `WFCondition`, `WFControlFlowMode`, `GroupingIdentifier`. Condition 100 is "has any value". |
| Current Date | `date` | `WFDateActionMode: "Current Date"` |
| Adjust Date | `adjustdate` | `WFDate` (token string), `WFAdjustOperation` (`"Add"` is the default when absent, `"Subtract"`, `"Get Start of Day"`), `WFDuration: {Value: {Magnitude, Unit}, WFSerializationType: "WFQuantityFieldValue"}`. Units seen: `"days"`, `"hr"`. A variable magnitude is a bare `{OutputName, OutputUUID, Type: "ActionOutput"}` dict with no serialization wrapper. |
| Format Date | `format.date` | `WFDate` (token string), `WFDateFormatStyle` (`"ISO 8601"` or `"Custom"`), `WFISO8601IncludeTime` (switch, shown only for ISO 8601), `WFDateFormat` (ICU pattern, for Custom) |
| Find Health Samples | `filter.health.quantity` | see the next section |
| Get Details of Health Sample | `properties.health.quantity` | `WFInput`, `WFContentItemPropertyName`: one of Type, Value, Unit, Start Date, End Date, Duration, Source, Name |
| Repeat with Each | `repeat.each` | `WFInput` on the start action, `GroupingIdentifier`, `WFControlFlowMode`. The end action's UUID is the "Repeat Results" list. |
| Combine Text | `text.combine` | `text` (attachment), `WFTextSeparator: "New Lines"` (also `"Spaces"`, `"Custom"` with `WFTextCustomSeparator`) |
| Base64 Encode | `base64encode` | `WFInput`, `WFEncodeMode: "Encode"`, `WFBase64LineBreakMode: "None"`. The default is "Every 76 Characters", so it must be set. |
| Dictionary | `dictionary` | `WFItems: {Value: {WFDictionaryFieldValueItems: [...]}, WFSerializationType: "WFDictionaryFieldValue"}`. Each item is `{WFItemType, WFKey, WFValue}`, where `WFItemType` is 0 text, 1 dictionary, 2 array, 3 number, 4 boolean, and key and value are token strings. |
| Get Contents of URL | `downloadurl` | `WFURL` (token string), `WFHTTPMethod: "PUT"`, `WFHTTPBodyType: "JSON"`, `WFJSONValues` (dictionary field value), `ShowHeaders: true`, `WFHTTPHeaders` (dictionary field value) |

The shortcut builds the request body inline in `WFJSONValues` rather than with a separate Dictionary action. Cherri's `jsonRequest` and real exports do the same.

## Find Health Samples

The action class is `WFFindHealthSamplesAction`, a content item filter. Its filter is a predicate table:

```
WFContentItemFilter = {
  WFSerializationType: "WFContentPredicateTableTemplate",
  Value: {
    WFActionParameterFilterPrefix: 1,          // All rows must match
    WFContentPredicateBoundedDate: false,
    WFActionParameterFilterTemplates: [
      {Property: "Type", Operator: 4, Removable: false, Bounded: true,
       Values: {Enumeration: {Value: "Steps", WFSerializationType: "WFStringSubstitutableState"}}},
      {Property: "Start Date", Operator: 1003, Removable: false, Bounded: true,
       Values: {Date: <attachment>, AnotherDate: <attachment>, Number: "1", Unit: 16}},
    ],
  },
}
```

- Operator 4 is "is". Operator 1001 is "is in the last" with `Number` and `Unit` 16 (days). Operator 1002 is "is today". Operator 1003 is "is between", with `Date` and `AnotherDate`.
- Two real iCloud shortcuts use 1003 with `Date` and `AnotherDate` as `WFTextTokenAttachment`. One points both at Ask, the other at the outputs of earlier actions. The leftover `Number: "1"` and `Unit: 16` appear in both, and we copy them.
- `WFHKSampleFilteringGroupBy` takes `"Minute"`, `"Hour"`, `"Day"`, `"Week"`, `"Month"`, `"3 Months"` or `"Year"`. The help string in ActionKit says "grouping by day gives you only the daily totals". `updateParameterVisibility` hides Group By for category types, and the grouping code only reads quantity samples, so Sleep and Mindful cannot be grouped.
- `WFHKSampleFilteringFillMissing` is a boolean, true by default. With it on, empty groups come back as zero samples. We turn it off and let the importer fill zeros.
- `WFHKSampleFilteringUnit` forces a unit. We leave it unset, so values come in the phone's units.
- `WFContentItemSortProperty`, `WFContentItemSortOrder`, `WFContentItemLimitEnabled` and `WFContentItemLimitNumber` work as in other Find actions.
- If a type has no data from any source, or Shortcuts lacks permission, the action shows a "No Samples Found" alert with OK and Open Health. OK continues the shortcut. If the type has sources but nothing in range, it returns an empty list with no alert (`finishRunningWithError` block 2 in the iOS 18.2 decompile).

Type labels are ActionKit's own names, not the Health app's:

| Data | Label used | Evidence |
| --- | --- | --- |
| Steps | `Steps` | real iCloud export, Viticci |
| Exercise minutes | `Exercise Time` | real iCloud export, iOS 27 ActionKit strings (danielhopkins). Viticci says `Exercise Minutes`. Unresolved. |
| Water | `Water` | real iCloud export |
| Mindful minutes | `Mindful Minutes` | no export found. Generators use it. Viticci's guess is `Mindful Session`. Unconfirmed. |
| Sleep | `Sleep` | real iCloud export, Viticci, danielhopkins |

Each HealthKit type has exactly one readable name in ActionKit's table (`WFHealthKitReadableSampleTypeToSampleTypeIdentifierDictionary`, iOS 17.6.1 decompile, 166 entries with one duplicate for vitamin B). A wrong label does not fall back to another name.

Sleep stage values, as Get Details returns them, vary by source: `In Bed`, `Asleep`, `Awake`, `Core`, `Deep`, `REM`, or `Asleep Core`, `Asleep Deep`, `Asleep REM`, `Asleep Unspecified`. The importer matches on words rather than exact labels.

## Workouts

No built-in action returns workouts. `WFHKSampleContentItem` wraps an `HKQuantitySample` or an `HKCategorySample` and nothing else. `WFFindHealthSamplesAction` in iOS 18.2 only resolves quantity and category types, and danielhopkins read the full iOS 27 picker list and found no Workouts row. `WFHKWorkoutContentItem` exists only as the output of Log Workout. The workout readers people use are third-party actions, for example Toolbox Pro's "Get Workouts". So the shortcut leaves workouts out.

## Number and date text

- Format Date with ISO 8601 and time gives local time with offset, for example `2016-06-01T14:41:36-08:00` (Apple's Shortcuts User Guide). The first 10 characters are the local date.
- A number placed in text uses the phone's locale, for example `8,412` on an en_US phone (danielhopkins). The importer strips grouping commas and spaces. A locale with a decimal comma would break water values.
- Units follow the phone's settings, so water can be `mL`, `L` or fluid ounces.

## Open questions

1. The Exercise label: `Exercise Time` or `Exercise Minutes`.
2. The Mindful label: `Mindful Minutes` or `Mindful Session`.
3. Whether a filter row accepts `Date` and `AnotherDate` that point at Adjust Date outputs with no aggrandizement. The real example adds a `WFDateFormatVariableAggrandizement`, which the editor adds when you pick a date variable.
4. Whether "is between" compares exact instants or whole days. Either works here, since the window starts at midnight and ends now.
5. The exact unit string for fluid ounces.
6. Whether an automation that hits the "No Samples Found" alert waits for a tap or fails.

## Sources

- Cherri compiler, commit 426e6cf: https://github.com/electrikmilk/cherri/tree/426e6cfab471aba4c458aeff173a50b616dd7ebb (`shortcut.go`, `shortcutgen.go`, `action.go`, `actions_std.go`, `actions/calendar.cherri`, `actions/crypto.cherri`, `actions/web.cherri`, `actions/basic.cherri`)
- ScPL action data, Apple's WFActions from Shortcuts 2.2: https://github.com/pfgithub/scpl/blob/f3ee66584f71020cf074c1b154f80519b2fabe31/src/Data/Shortcuts%202.2.json and https://github.com/pfgithub/scpl/blob/f3ee66584f71020cf074c1b154f80519b2fabe31/docs/actions/formatdate.md
- Decompiled ActionKit, iOS 18.2: https://github.com/EthanArbuckle/iPhone17-1_18.2_22C152_Restore/blob/e26ed4563f78871c59d2d96856756a65d62517e5/System/Library/PrivateFrameworks/ActionKit.framework/WFFindHealthSamplesAction.m and `WFHealthKitHelper.m` in the same folder
- Decompiled ActionKit, iOS 17.6.1, readable type table: https://github.com/SuperChaoM/iPhone15-3_17.6.1_21G101_Restore/blob/95df6b804bee0e01538eb2ddad0413609938d063/System/Library/PrivateFrameworks/ActionKit.framework/WFHealthKitReadableSampleTypeToSampleTypeIdentifierDictionary.m
- Federico Viticci, HealthKit reference from iOS 26.2 exports, commit 2de03bf: https://github.com/viticci/shortcuts-playground-plugin/blob/2de03bffe4ce8802e06d184931d9e4ec366a2ef2/claude/skills/shortcuts-playground/HEALTHKIT.md and `data/healthkit-ios26.2-reference.json`
- danielhopkins/apple-tools, notes from the iOS 27 ActionKit binary: https://github.com/danielhopkins/apple-tools/blob/e946c9e98330cd438418154145ef8b312a0f8e80/docs/apple-health.md and `plugins/health/build-shortcut.py`
- Real iOS export, Heart Rate Data: https://github.com/suliveevil/My-Siri-Shortcuts/blob/352a5007e518835fb285acd18a70198dc1cff4f3/assets/backup/Heart%20Rate%20Data.txt (also `App Stats.txt` for Base64 and ISO 8601, and `我的日子.txt` for a variable Adjust Date)
- Real exports, client 4610: https://github.com/huaminghuangtw/Shortcutomation/blob/a20b443874fde2f3ca503994dab1fd826b190b7d/All%20Shortcuts/Date%20%26%20Time/getWeekRange/getWeekRange.plist and `All Shortcuts/Apple Calendar/_Get Calendar Events/get-calendar-events.plist`
- Real iCloud shortcuts saved as JSON: https://github.com/VictorAgahi/VaultedMind/tree/53da90cfcf6660f8a614417f79ac798cb4c3e1d3/vault-back/scripts/shortcuts/reference (`0baed25…json` with 32 Find Health Samples actions, `22bb56e…json` with "is between", `7dde730…json`)
- ShortcutForge key statistics from real shortcuts: https://github.com/rohanvinaik/ShortcutForge/blob/957615ad191da2e41c89908b84a98ea02698b07d/references/param_schemas.json
- Apple, Shortcuts User Guide, date formats: https://support.apple.com/guide/shortcuts/apdfd459e13d/ios
- Matthew Cassinelli, Find Health Samples: https://matthewcassinelli.com/actions/find-health-samples/
- Toolbox Pro used to read workouts: https://talk.automators.fm/t/get-workouts-from-health-not-working-when-iphone-locked/13100
