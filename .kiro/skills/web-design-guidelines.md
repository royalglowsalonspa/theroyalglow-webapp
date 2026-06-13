---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to review UI, check accessibility, audit design, review UX, or check against best practices.
---

# Web Interface Guidelines (Vercel)

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files
3. Check against all rules in the fetched guidelines
4. Output findings in terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:
```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

## Usage

When reviewing UI code:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

## Key Principles (Summary)

- Interfaces should be fast, responsive, and accessible by default
- Keyboard navigation must work everywhere
- Focus states must be visible
- Color contrast must meet WCAG AA minimum
- Touch targets minimum 44x44px
- Animations must respect prefers-reduced-motion
- Loading states must be meaningful (not just spinners)
- Error messages must be helpful and actionable
- Forms must validate inline and provide clear feedback
- Responsive design is non-negotiable
- Semantic HTML over ARIA when possible
- Interactive elements must have visible hover/active/focus states
