# Codex Research Pack for Pixelizer

Copy the contents of this directory into the root of your pixelization project.

## Recommended sequence

1. Keep `AGENTS.md` at the project root (merge it with an existing AGENTS.md if you already have one).
2. Keep the eight research URLs in `references/urls.md`.
3. In Codex, run the instructions from `prompts/01-research-only.md` first.
4. Review the generated research notes.
5. Run `prompts/02-turn-research-into-spec.md`.
6. Review the engineering spec.
7. Only then run `prompts/03-implement-after-research.md`.

## If Codex cannot access one of the URLs

Save that webpage locally into `references/raw/` and rerun the research prompt.
The AGENTS.md instructions explicitly tell Codex to use the local snapshot as a fallback.

## Important

The research prompt intentionally does not modify production code. This keeps source interpretation separate from implementation decisions.
