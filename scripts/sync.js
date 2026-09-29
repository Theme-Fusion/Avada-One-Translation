/**
 * Merge avada-one.pot into every po file.
 *
 * New strings are added untranslated, changed strings keep their old translation
 * marked fuzzy (with the previous msgid alongside, so translators can see what
 * changed), and strings removed from the theme are dropped. Fuzzy translations
 * are never shipped, so an out-of-date one can't reach sites.
 *
 * Usage: node scripts/sync.js [po/avada-one-xx.po ...]
 */

import { POT_FILE, poFiles, run } from './lib.js';

const files = poFiles( process.argv.slice( 2 ) );

for ( const file of files ) {
	run( 'msgmerge', [ '--quiet', '--update', '--backup=none', '--no-location', '--no-wrap', '--previous', '--sort-output', file, POT_FILE ] );
	run( 'msgattrib', [ '--no-obsolete', '--no-location', '--no-wrap', '--sort-output', '-o', file, file ] );
}

console.log( `Synced ${ files.length } po file(s) with avada-one.pot.` );
