#!/usr/bin/env python3
"""Checks a generated shortcut plist.

Prints every action identifier in order, then checks that:
- every OutputUUID reference points at an action UUID that appears earlier,
- each import question targets an existing action that has its parameter key,
- control flow blocks open and close in order.
Exits 1 on any problem.

    python3 scripts/check_shortcut.py ["shortcut/Habits sync.shortcut"]
"""
import os
import plistlib
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT = os.path.join(ROOT, 'shortcut', 'Habits sync.shortcut')
BLOCKS = {'is.workflow.actions.conditional', 'is.workflow.actions.repeat.each',
          'is.workflow.actions.repeat.count', 'is.workflow.actions.choosefrommenu'}


def references(value):
    """Yields every OutputUUID found anywhere inside a parameter value."""
    if isinstance(value, dict):
        if 'OutputUUID' in value:
            yield value['OutputUUID']
        for v in value.values():
            yield from references(v)
    elif isinstance(value, list):
        for v in value:
            yield from references(v)


def check(path):
    with open(path, 'rb') as f:
        shortcut = plistlib.load(f)
    actions = shortcut['WFWorkflowActions']
    problems = []
    seen = set()
    open_blocks = []

    for i, action in enumerate(actions):
        ident = action['WFWorkflowActionIdentifier']
        params = action.get('WFWorkflowActionParameters', {})
        print(f'{i:3d}  {ident}')

        for ref in references(params):
            if ref not in seen:
                problems.append(f'action {i} ({ident}) uses {ref}, which no earlier action produces')

        if ident in BLOCKS:
            group, mode = params.get('GroupingIdentifier'), params.get('WFControlFlowMode')
            if mode == 0:
                open_blocks.append(group)
            elif not open_blocks or open_blocks[-1] != group:
                problems.append(f'action {i} ({ident}) closes or continues block {group}, which is not the innermost open block')
            elif mode == 2:
                open_blocks.pop()

        if 'UUID' in params:
            if params['UUID'] in seen:
                problems.append(f'action {i} ({ident}) repeats UUID {params["UUID"]}')
            seen.add(params['UUID'])

    if open_blocks:
        problems.append(f'{len(open_blocks)} block(s) never closed: {open_blocks}')

    for q in shortcut.get('WFWorkflowImportQuestions', []):
        idx, key = q.get('ActionIndex'), q.get('ParameterKey')
        if not isinstance(idx, int) or not 0 <= idx < len(actions):
            problems.append(f'import question "{q.get("Text")}" points at missing action {idx}')
        elif key not in actions[idx].get('WFWorkflowActionParameters', {}):
            problems.append(f'import question "{q.get("Text")}" sets {key}, which action {idx} does not have')

    print(f'\n{len(actions)} actions, {len(seen)} with a UUID, '
          f'{len(shortcut.get("WFWorkflowImportQuestions", []))} import questions')
    return problems


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    problems = check(path)
    if problems:
        print('\nProblems:')
        for p in problems:
            print(f'  {p}')
        sys.exit(1)
    print('OK: every reference points at an earlier action')


if __name__ == '__main__':
    main()
