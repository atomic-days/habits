#!/usr/bin/env python3
"""Writes shortcut/Habits sync.shortcut, an unsigned binary plist.

The shortcut reads the last N days of Health samples (N is the shortcut input, or 7),
turns each sample into one text line, and PUTs the lines to the data repo as
data/inbox/<yyyyMMdd-HHmmss>.txt. The inbox workflow in the data repo imports them.

Every key here is documented, with sources, in shortcut/FORMAT-NOTES.md.
Sign the output on a Mac before hosting it:
    shortcuts sign --mode anyone --input "shortcut/Habits sync.shortcut" --output public/habits-sync.shortcut

Uses only the standard library. UUIDs are derived from names, so rebuilding gives the same file.
"""
import os
import plistlib
import uuid

NAME = 'Habits sync'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'shortcut', f'{NAME}.shortcut')

KEY_QUESTION = 'Paste your habits key (starts with github_pat_)'
REPO_QUESTION = 'Your data repo'
DEFAULT_REPO = 'dhruvmetha/habits-data'
DEFAULT_DAYS = '7'

# (kind written on each line, Find Health Samples type label, group by day).
# The labels are ActionKit's own names. Exercise and Mindful are the least certain;
# see "Open questions" in shortcut/FORMAT-NOTES.md.
KINDS = [
    ('steps', 'Steps', True),
    ('exercise', 'Exercise Time', True),
    ('water', 'Water', True),
    ('mindful', 'Mindful Minutes', False),
    ('sleep', 'Sleep', False),
]

OBJ = '￼'  # Shortcuts marks each inline variable with this character
NS = uuid.UUID('6f1d7c52-3a5e-4f0b-9c1e-8a2b4d6e0f13')


def uid(name):
    return str(uuid.uuid5(NS, name)).upper()


actions = []


def act(identifier, params=None, name=None):
    """Appends an action. With a name, the action gets a UUID so later actions can use its output."""
    params = dict(params or {})
    if name is not None:
        params['UUID'] = uid(name)
    actions.append({'WFWorkflowActionIdentifier': f'is.workflow.actions.{identifier}',
                    'WFWorkflowActionParameters': params})
    return len(actions) - 1


# Variable references.

def output(name, label):
    return {'Type': 'ActionOutput', 'OutputUUID': uid(name), 'OutputName': label}


SHORTCUT_INPUT = {'Type': 'ExtensionInput'}
REPEAT_ITEM = {'Type': 'Variable', 'VariableName': 'Repeat Item'}


def attachment(ref):
    return {'Value': ref, 'WFSerializationType': 'WFTextTokenAttachment'}


def tokens(*parts):
    """Text with inline variables. Plain strings are text; dicts are variable references."""
    text, ranges = '', {}
    for part in parts:
        if isinstance(part, str):
            text += part
        else:
            # Positions count UTF-16 code units. Everything here is ASCII apart from OBJ, which is one unit.
            ranges[f'{{{len(text.encode("utf-16-le")) // 2}, 1}}'] = part
            text += OBJ
    return {'Value': {'string': text, 'attachmentsByRange': ranges}, 'WFSerializationType': 'WFTextTokenString'}


def dict_field(pairs):
    items = [{'WFItemType': 0, 'WFKey': tokens(k), 'WFValue': tokens(*v) if isinstance(v, tuple) else tokens(v)}
             for k, v in pairs]
    return {'Value': {'WFDictionaryFieldValueItems': items}, 'WFSerializationType': 'WFDictionaryFieldValue'}


def quantity(magnitude, unit):
    return {'Value': {'Magnitude': magnitude, 'Unit': unit}, 'WFSerializationType': 'WFQuantityFieldValue'}


# Actions.

def text(name, *parts):
    return act('gettext', {'WFTextActionText': tokens(*parts)}, name)


def adjust(name, date_ref, operation, magnitude=None, unit=None):
    params = {'WFDate': tokens(date_ref), 'WFAdjustOperation': operation}
    if magnitude is not None:
        params['WFDuration'] = quantity(magnitude, unit)
    act('adjustdate', params, name)


def iso(name, date_ref):
    act('format.date', {'WFDate': tokens(date_ref), 'WFDateFormatStyle': 'ISO 8601',
                        'WFISO8601IncludeTime': True}, name)


def find_samples(name, label, start_ref, end_ref, by_day):
    rows = [
        {'Property': 'Type', 'Operator': 4, 'Removable': False, 'Bounded': True,
         'Values': {'Enumeration': {'Value': label, 'WFSerializationType': 'WFStringSubstitutableState'}}},
        # Operator 1003 is "is between". Number and Unit are what the editor leaves in place.
        {'Property': 'Start Date', 'Operator': 1003, 'Removable': False, 'Bounded': True,
         'Values': {'Date': attachment(start_ref), 'AnotherDate': attachment(end_ref), 'Number': '1', 'Unit': 16}},
    ]
    params = {
        'WFContentItemFilter': {
            'Value': {'WFActionParameterFilterPrefix': 1, 'WFContentPredicateBoundedDate': False,
                      'WFActionParameterFilterTemplates': rows},
            'WFSerializationType': 'WFContentPredicateTableTemplate',
        },
        'WFContentItemSortProperty': 'Start Date',
        'WFContentItemSortOrder': 'Oldest First',
        'WFContentItemLimitEnabled': False,
        # The importer fills empty days with zeros, so Health sends only days that have data.
        'WFHKSampleFilteringFillMissing': False,
    }
    if by_day:
        params['WFHKSampleFilteringGroupBy'] = 'Day'
    act('filter.health.quantity', params, name)


def details(name, prop):
    act('properties.health.quantity', {'WFInput': attachment(REPEAT_ITEM), 'WFContentItemPropertyName': prop}, name)


def build():
    actions.clear()

    # 1. The two values the user fills in when adding the shortcut.
    key_index = text('key')
    repo_index = text('repo', DEFAULT_REPO)

    # 2. Days: the shortcut input if it holds a number, else 7. The If block's result is its End If output.
    act('detect.number', {'WFInput': attachment(SHORTCUT_INPUT)}, 'input numbers')
    act('conditional', {'GroupingIdentifier': uid('days if'), 'WFControlFlowMode': 0, 'WFCondition': 100,
                        'WFInput': {'Type': 'Variable', 'Variable': attachment(output('input numbers', 'Numbers'))}})
    act('number', {'WFNumberActionNumber': attachment(output('input numbers', 'Numbers'))})
    act('conditional', {'GroupingIdentifier': uid('days if'), 'WFControlFlowMode': 1})
    act('number', {'WFNumberActionNumber': DEFAULT_DAYS})
    act('conditional', {'GroupingIdentifier': uid('days if'), 'WFControlFlowMode': 2}, 'days')
    days = output('days', 'If Result')

    # 3. The window: midnight N-1 days ago through now. Sleep looks back 6 more hours,
    # so a night that starts at 23:00 before the first day still counts for that day.
    act('date', {'WFDateActionMode': 'Current Date'}, 'now')
    now = output('now', 'Date')
    adjust('days back', now, 'Subtract', days, 'days')
    adjust('days back start', output('days back', 'Adjusted Date'), 'Get Start of Day')
    adjust('window start', output('days back start', 'Adjusted Date'), 'Add', '1', 'days')
    start = output('window start', 'Adjusted Date')
    adjust('sleep window start', start, 'Subtract', '6', 'hr')
    iso('start iso', start)
    iso('now iso', now)
    act('format.date', {'WFDate': tokens(now), 'WFDateFormatStyle': 'Custom', 'WFDateFormat': 'yyyyMMdd-HHmmss'},
        'file stamp')

    # 4. The header line.
    text('header', 'window|', output('start iso', 'Formatted Date'), '|', output('now iso', 'Formatted Date'),
         '|', output('now iso', 'Formatted Date'))

    # 5. One line per sample: kind|start|end|value|unit. Grouped kinds give one sample per day.
    for kind, label, by_day in KINDS:
        from_ref = output('sleep window start', 'Adjusted Date') if kind == 'sleep' else start
        find_samples(f'{kind} samples', label, from_ref, now, by_day)
        act('repeat.each', {'GroupingIdentifier': uid(f'{kind} repeat'), 'WFControlFlowMode': 0,
                            'WFInput': attachment(output(f'{kind} samples', 'Health Samples'))})
        details(f'{kind} start', 'Start Date')
        details(f'{kind} end', 'End Date')
        details(f'{kind} value', 'Value')
        details(f'{kind} unit', 'Unit')
        iso(f'{kind} start iso', output(f'{kind} start', 'Start Date'))
        iso(f'{kind} end iso', output(f'{kind} end', 'End Date'))
        text(f'{kind} line', f'{kind}|', output(f'{kind} start iso', 'Formatted Date'), '|',
             output(f'{kind} end iso', 'Formatted Date'), '|', output(f'{kind} value', 'Value'), '|',
             output(f'{kind} unit', 'Unit'))
        act('repeat.each', {'GroupingIdentifier': uid(f'{kind} repeat'), 'WFControlFlowMode': 2},
            f'{kind} results')
        act('text.combine', {'text': attachment(output(f'{kind} results', 'Repeat Results')),
                             'WFTextSeparator': 'New Lines', 'Show-text': True}, f'{kind} lines')

    # 6. Join, encode and upload. An empty kind leaves a blank line, which the importer skips.
    parts = [output('header', 'Text')]
    for kind, _, _ in KINDS:
        parts += ['\n', output(f'{kind} lines', 'Combined Text')]
    text('body', *parts)
    act('base64encode', {'WFInput': attachment(output('body', 'Text')), 'WFEncodeMode': 'Encode',
                         'WFBase64LineBreakMode': 'None'}, 'body base64')
    act('downloadurl', {
        'WFURL': tokens('https://api.github.com/repos/', output('repo', 'Text'), '/contents/data/inbox/',
                        output('file stamp', 'Formatted Date'), '.txt'),
        'WFHTTPMethod': 'PUT',
        'WFHTTPBodyType': 'JSON',
        'WFJSONValues': dict_field([
            ('message', 'health inbox'),
            ('content', (output('body base64', 'Base64 Encoded'),)),
        ]),
        'ShowHeaders': True,
        'WFHTTPHeaders': dict_field([
            ('Authorization', ('Bearer ', output('key', 'Text'))),
            ('Accept', 'application/vnd.github+json'),
            ('X-GitHub-Api-Version', '2022-11-28'),
        ]),
    }, 'upload')

    return {
        'WFWorkflowName': NAME,
        'WFWorkflowActions': list(actions),
        'WFWorkflowClientVersion': '4033.0.4.3',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconGlyphNumber': 59754, 'WFWorkflowIconStartColor': 4282601983},
        'WFWorkflowImportQuestions': [
            {'ActionIndex': key_index, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText',
             'Text': KEY_QUESTION, 'DefaultValue': ''},
            {'ActionIndex': repo_index, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText',
             'Text': REPO_QUESTION, 'DefaultValue': DEFAULT_REPO},
        ],
        'WFWorkflowInputContentItemClasses': ['WFNumberContentItem', 'WFStringContentItem'],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowHasShortcutInputVariables': True,
        'WFWorkflowHasOutputFallback': False,
        'WFWorkflowTypes': [],
        'WFQuickActionSurfaces': [],
    }


def main():
    shortcut = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'wb') as f:
        plistlib.dump(shortcut, f, fmt=plistlib.FMT_BINARY, sort_keys=True)
    print(f'Wrote {os.path.relpath(OUT, ROOT)} with {len(shortcut["WFWorkflowActions"])} actions')


if __name__ == '__main__':
    main()
