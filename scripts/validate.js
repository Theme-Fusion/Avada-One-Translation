/**
 * Check po files before they are merged.
 *
 * Errors (fail the check):
 *  - the file doesn't parse, or its name/Language header don't match
 *  - a translation drops, adds or renumbers a printf placeholder (%s, %1$s, %d...)
 *  - a translation adds a link, script or event handler the English string doesn't have
 *  - a translation adds an HTML tag the English string doesn't have
 *
 * Prints a Markdown report (written to the job summary in CI).
 *
 * Usage: node scripts/validate.js [po/avada-one-xx.po ...]   (default: all)
 */

import path from 'node:path';
import { checkEntry } from './checks.js';
import { entries, isTranslated, localeFromFile, poFiles, readPo, run, stats } from './lib.js';

const files = poFiles( process.argv.slice( 2 ) );
const report = [ '## Translation check', '' ];
let failed = false;

const rows = [];

for ( const file of files ) {
	const name = path.basename( file );
	const locale = localeFromFile( file );
	const errors = [];

	if ( ! locale ) {
		errors.push( 'File name must be `po/avada-one-<locale>.po`.' );
	}

	let data;
	try {
		// msgfmt catches syntax problems (duplicate msgids, bad escapes, broken plural headers).
		run( 'msgfmt', [ '--check-header', '--check-domain', '-o', '-', file ], { quiet: true } );
		data = readPo( file );
	} catch ( e ) {
		errors.push( `Could not be parsed: ${ e.message.split( '\n' )[ 0 ] }` );
	}

	if ( data ) {
		const language = data.headers.Language || data.headers.language || '';
		if ( locale && language !== locale ) {
			errors.push( `\`Language\` header is \`${ language || '(empty)' }\`, expected \`${ locale }\`.` );
		}

		for ( const entry of entries( data ) ) {
			if ( ! isTranslated( entry ) ) {
				continue;
			}
			for ( const problem of checkEntry( entry ) ) {
				errors.push( `\`${ entry.msgid.slice( 0, 80 ).replace( /`/g, "'" ) }\`: ${ problem }` );
			}
		}

		const s = stats( data );
		rows.push( `| ${ locale || name } | ${ s.percent }% | ${ s.translated } / ${ s.total } | ${ s.fuzzy } | ${ errors.length ? `❌ ${ errors.length }` : '✅' } |` );
	} else {
		rows.push( `| ${ locale || name } | – | – | – | ❌ |` );
	}

	if ( errors.length ) {
		failed = true;
		report.push( `### ❌ ${ name }`, '', ...errors.slice( 0, 200 ).map( ( e ) => `- ${ e }` ) );
		if ( errors.length > 200 ) {
			report.push( `- …and ${ errors.length - 200 } more` );
		}
		report.push( '' );
	}
}

report.splice( 2, 0, '| Locale | Done | Strings | Fuzzy | Check |', '|---|---|---|---|---|', ...rows, '' );

if ( ! files.length ) {
	report.push( 'No po files to check.' );
}

console.log( report.join( '\n' ) );
process.exit( failed ? 1 : 0 );
