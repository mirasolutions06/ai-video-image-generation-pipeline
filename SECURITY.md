# Security Policy

## Supported versions

The public `main` branch is the supported version for this repo.

## Reporting a vulnerability

Please email `mira.solutions06@gmail.com` with:

- The affected repo and file or command.
- Steps to reproduce.
- Impact and any suggested fix.

Please do not open a public issue for a vulnerability that exposes API keys,
private brand work, customer data, paid-provider misuse, unsafe file writes, or
private prompt/reference material.

## Data handling expectations

- Do not commit `.env`, live project folders, private brand memory, customer
  assets, paid-provider outputs, or generated run artifacts.
- Keep examples synthetic or explicitly sanitized.
- Keep project paths rooted under the configured project/memory directories.
- Treat prompts, references, and output manifests as potentially client-sensitive.
