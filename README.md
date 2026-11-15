# Line Buddy: Romeo and Juliet

A small web app that helps a cast learn their lines with short games. It is a
static site: no accounts, no database. Each kid's progress is stored only in
their own browser.

## Everyday commands

    npm install        # once
    npm run dev        # run the app locally
    npm run script     # rebuild the script data and print the check report
    npm test           # parser, cue and progress tests
    npm run build      # full production build into dist/

## Changing the script

The script lives in two plain files:

- `script/romeo-and-juliet.txt` is the play. Scene headings look like
  `=== ACT 1, SCENE 1 ===`, a speaker is a capitalised name ending in a colon
  (`ROMEO:` or `NURSE [offstage]:`), stage directions are in `[square brackets]`,
  a line starting with `=` under a speech is its plain-English meaning, and a
  line starting with `>` is its thought cue (what has just happened that makes
  the character speak).
  Verse keeps one line per line. Edit it in any text editor.
- `script/roles.yml` says which speaker labels belong to which cast role,
  which house each role is in, and the friendly scene names. Lines marked
  `REVIEW` are casting decisions worth a second look.

- `script/scenes.yml` holds a short summary of each scene and one line per
  speaking character saying what they want in it.

After any edit run `npm run script`. It prints speeches, lines and words per
role and stops with a list of problems if a speaker is not in `roles.yml`.
Kids keep their progress on every line whose words did not change.

## Starting a new play

    node scripts/import-pdf.mjs "path/to/script.pdf" script/new-play.txt

The importer expects `SPEAKER:` on its own line, directions in brackets and
`ACT I` / `[SCENE 1.]` headings. Then write a `roles.yml` for the new cast and
point `scripts/build-script.mjs` at the new file.

## Where things are

- `scripts/` import and build the script data
- `src/lib/script.ts` cues, bite-sized parts, word helpers
- `src/lib/progress.ts` mastery levels, review dates, streaks (browser storage)
- `src/lib/games.ts` the eight games and "Today's practice"
- `src/cards.tsx`, `src/runs.tsx` the games themselves
- `src/App.tsx` screens: role picker, scene path, scene, read-through, progress

Script text adapted from the Folger Shakespeare edition, edited by Barbara A.
Mowat and Paul Werstine.
