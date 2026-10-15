---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Vercel's Web Interface Guidelines.

A pinned copy, not the upstream skill: vercel-labs/agent-skills' `web-design-guidelines` fetches its rules from a URL
on every run, so they could change without anything changing here. The rules are in [guidelines.md](guidelines.md),
copied unchanged from vercel-labs/web-interface-guidelines `command.md` at commit
434b7f91364665f2f733b310ec54809bf8f37937 (2026-10-05, MIT, see LICENSE). Never fetch them. To update, read the new
`command.md` in full, then replace guidelines.md and the commit above.

## How it works

1. Read [guidelines.md](guidelines.md).
2. Read the given files (or ask which files to review).
3. Check them against every rule there, minus the exceptions below.
4. Report findings in the terse `file:line` format guidelines.md describes.

## This project's exceptions

The owner has decided these already. Don't report them:

- Title Case for headings and buttons: the site uses sentence case, and small labels in tracked capitals.
- `overscroll-behavior: none` on `<html>`: tried and rejected.
- `<link rel="preload" as="font">`: measured slower here and removed.
- React, Tailwind, hydration and form rules: the site is vanilla TypeScript with no forms.
- Copy rules (voice, wording): the owner writes all copy in src/content/site.ts. Point out a problem, don't rewrite.
