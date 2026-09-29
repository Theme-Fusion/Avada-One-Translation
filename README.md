# Avada One Translations

Community translations for [Avada One](https://avada.com/). Sites running Avada One get new and improved translations for their language automatically (Global Options → Advanced → **Enable Language Updates**).

Language status: **https://theme-fusion.github.io/Avada-One-Translation/**

## Improve a translation

Each language is one file in [`po/`](po/), named `avada-one-<locale>.po` (for example `avada-one-de_DE.po`).

1. Fork this repository and download your language's `.po` file.
2. Open it in [Poedit](https://poedit.net/) (free), or any gettext editor, and translate or correct strings.
   - Strings marked **fuzzy / "needs work"** were carried over from an older, slightly different English string. Check them, fix them if needed, and clear the fuzzy flag. Fuzzy strings are not shipped until you do.
   - Keep placeholders like `%s`, `%1$s` and `%d` exactly as they are. You can reorder numbered ones (`%1$s`, `%2$s`) to suit your grammar.
   - Keep HTML tags from the English string, and don't add links or new tags.
3. Commit the `.po` file only (no `.mo`, `.zip` or `.l10n.php` files, they are built automatically) and open a pull request.

An automatic check runs on every pull request and fails, with a report in the check's summary, on anything that would break (placeholders, links, markup). Once a maintainer merges it, the updated language is published within a few minutes and sites pick it up on their next update check.

Not comfortable with GitHub? Email your `.po` file to support@avada.com and we'll submit it for you.

### A new language

Open an issue asking for it, or if you have Node.js and gettext installed:

```
npm install
npm run add-locale -- de_AT
```

Use the WordPress locale code (Settings → General → Site Language shows it, e.g. `pt_BR`, `de_DE_formal`, `ja`).

## How it works

```
avada-one.pot        English source strings, updated on every Avada One release
po/*.po              one file per language (the only thing contributors edit)
scripts/             sync, validate and build scripts
.github/workflows/   validate.yml (pull requests), publish.yml (main)
```

- **Release**: Avada One's `deploy.js` pushes the new `avada-one.pot` here.
- **Publish** (every push to `main`): `sync.js` merges the pot file into every language (new strings are added, changed strings go fuzzy, removed ones are dropped) and commits the result, `validate.js` checks every file, and `build.js` builds a WordPress language pack per language (`.po` + `.mo` + `.l10n.php`, translated strings only) plus `manifest.json`, which are deployed to GitHub Pages.
- **Sites**: Avada One reads `manifest.json` and offers any newer pack to WordPress as a theme translation update, so WordPress downloads and installs it like any wordpress.org language pack. A language's `updated` date only changes when its translations do, so a pot update doesn't make sites re-download anything.

Build output never lives in git, so the repository stays small.

The initial files were seeded from the Avada Classic community translations ([Localization-l10n](https://github.com/Theme-Fusion/Localization-l10n)) with `scripts/seed-classic.js`: identical strings came across translated, close matches came across fuzzy, and any translation that failed the checks was left out.

### Running the scripts locally

Requires Node.js 20+ and GNU gettext (`msgmerge`, `msgattrib`, `msgfmt`, included with Git for Windows).

```
npm install
npm run sync                            # merge avada-one.pot into po/
npm run validate                        # check all files (or pass specific ones)
npm run build -- --base-url http://localhost/packs --out dist
```
