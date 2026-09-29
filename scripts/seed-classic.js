/**
 * One-off: seed po/ from the Avada Classic community translations
 * (https://github.com/Theme-Fusion/Localization-l10n).
 *
 * For each locale, the Avada, Fusion Builder, Fusion Core and White Label
 * Branding translations are combined into a compendium and merged against
 * avada-one.pot. Identical strings come across translated; near-identical
 * ones come across fuzzy (not shipped until a translator confirms them).
 * Locales with nothing usable are skipped. Existing po files are left alone.
 *
 * Usage: node scripts/seed-classic.js <path to a Localization-l10n checkout> [locale ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { checkEntry } from './checks.js';
import { DOMAIN, POT_FILE, PO_DIR, ROOT, entries, isFuzzy, readPo, run, stats, writePo } from './lib.js';

const COMPONENTS = [ 'Avada', 'fusion-builder', 'fusion-core', 'fusion-white-label-branding' ];

/**
 * 1 - normalised Levenshtein distance.
 */
function similarity( a, b ) {
	if ( ! a || ! b ) {
		return 0;
	}
	let prev = Array.from( { length: b.length + 1 }, ( _, i ) => i );
	for ( let i = 1; i <= a.length; i++ ) {
		const cur = [ i ];
		for ( let j = 1; j <= b.length; j++ ) {
			cur[ j ] = Math.min( prev[ j ] + 1, cur[ j - 1 ] + 1, prev[ j - 1 ] + ( a[ i - 1 ] === b[ j - 1 ] ? 0 : 1 ) );
		}
		prev = cur;
	}
	return 1 - prev[ b.length ] / Math.max( a.length, b.length );
}

const classic = process.argv[ 2 ];
if ( ! classic || ! fs.existsSync( path.join( classic, 'Avada' ) ) ) {
	console.error( 'Usage: node scripts/seed-classic.js <path to Localization-l10n checkout>' );
	process.exit( 1 );
}

const tmp = path.join( ROOT, '.tmp', 'seed' );
fs.mkdirSync( tmp, { recursive: true } );
fs.mkdirSync( PO_DIR, { recursive: true } );

const locales = new Set();
for ( const component of COMPONENTS ) {
	const dir = path.join( classic, component );
	if ( ! fs.existsSync( dir ) ) {
		continue;
	}
	for ( const f of fs.readdirSync( dir ) ) {
		const m = f.match( new RegExp( `^${ component }-(.+)\\.po$` ) );
		if ( m ) {
			locales.add( m[ 1 ] );
		}
	}
}

const only = process.argv.slice( 3 );

for ( const locale of [ ...locales ].sort().filter( ( l ) => ! only.length || only.includes( l ) ) ) {
	// en_US "translations" are string overrides, not a language.
	if ( 'en_US' === locale ) {
		continue;
	}

	const target = path.join( PO_DIR, `${ DOMAIN }-${ locale }.po` );
	if ( fs.existsSync( target ) ) {
		continue;
	}

	// Translated, non-fuzzy entries of each component; Avada first so its wording wins on conflicts.
	const parts = [];
	let header = null;
	for ( const component of COMPONENTS ) {
		const file = path.join( classic, component, `${ component }-${ locale }.po` );
		if ( ! fs.existsSync( file ) ) {
			continue;
		}
		const out = path.join( tmp, `${ component }-${ locale }.po` );
		try {
			run( 'msgattrib', [ '--translated', '--no-fuzzy', '--no-obsolete', '--no-location', '-o', out, file ], { quiet: true, stdio: 'ignore' } );
		} catch {
			// Some community files are malformed (e.g. duplicate msgids); gettext-parser is more forgiving.
			const loose = readPo( file );
			for ( const ctx of Object.keys( loose.translations ) ) {
				for ( const [ id, entry ] of Object.entries( loose.translations[ ctx ] ) ) {
					if ( '' !== id && ( isFuzzy( entry ) || ! entry.msgstr.every( Boolean ) ) ) {
						delete loose.translations[ ctx ][ id ];
					}
					delete entry.comments;
				}
			}
			writePo( out, loose );
			console.warn( `  ${ path.basename( file ) } has syntax errors; imported what could be parsed.` );
		}
		if ( fs.existsSync( out ) && readPo( out ).translations && stats( readPo( out ) ).translated ) {
			parts.push( out );
			header ??= readPo( file ).headers;
		}
	}

	if ( ! parts.length ) {
		continue;
	}

	const compendium = path.join( tmp, `compendium-${ locale }.po` );
	run( 'msgcat', [ '--use-first', '--no-location', '-o', compendium, ...parts ], { quiet: true } );

	// An empty definitions file, so every string is looked up in the compendium (exact, then fuzzy).
	const empty = path.join( tmp, 'empty.po' );
	fs.writeFileSync( empty, 'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n' );
	run( 'msgmerge', [ '--quiet', '--no-location', '--no-wrap', '--sort-output', '--previous', '--compendium', compendium, '-o', target, empty, POT_FILE ], { quiet: true } );

	const data = readPo( target );

	// msgmerge's fuzzy matches are often unrelated strings ("Description Typography"
	// -> "Responsive Typography"). Keep only close ones, so translators review
	// real near-misses rather than noise.
	for ( const entry of entries( data ) ) {
		entry.comments ??= {};
		// Classic's "# @ Avada" style notes mean nothing here.
		delete entry.comments.translator;

		// Don't import translations that would fail review (broken placeholders fatal under PHP 8).
		if ( entry.msgstr.some( Boolean ) && checkEntry( entry ).length ) {
			entry.msgstr = entry.msgstr.map( () => '' );
			entry.comments.flag = ( entry.comments.flag || '' ).replace( /,?\s*fuzzy/, '' ).replace( /^,\s*/, '' );
			delete entry.comments.previous;
			continue;
		}

		if ( ! isFuzzy( entry ) ) {
			continue;
		}
		const before = ( entry.comments?.previous || '' ).match( /msgid "(.*)"/s )?.[ 1 ]?.replace( /"\s*\n\s*#\|\s*"/g, '' ) || '';
		if ( similarity( before, entry.msgid ) < 0.85 ) {
			entry.msgstr = entry.msgstr.map( () => '' );
			entry.comments.flag = entry.comments.flag.replace( /,?\s*fuzzy/, '' ).replace( /^,\s*/, '' );
		}
		delete entry.comments.previous;
	}

	// Give the new file a proper header for its locale.
	data.headers = {
		'Project-Id-Version': data.headers[ 'Project-Id-Version' ],
		'PO-Revision-Date': new Date().toISOString().slice( 0, 16 ).replace( 'T', ' ' ) + '+0000',
		'Last-Translator': 'Imported from Avada Classic translations',
		'Language-Team': '',
		Language: locale,
		'MIME-Version': '1.0',
		'Content-Type': 'text/plain; charset=UTF-8',
		'Content-Transfer-Encoding': '8bit',
		'Plural-Forms': header[ 'Plural-Forms' ] || 'nplurals=2; plural=(n != 1);',
		'X-Domain': DOMAIN,
	};
	writePo( target, data );
	// Same layout sync.js produces, so the first sync is a no-op.
	run( 'msgattrib', [ '--no-obsolete', '--no-location', '--no-wrap', '--sort-output', '-o', target, target ], { quiet: true } );

	// A handful of strings isn't a translation worth publishing.
	const s = stats( data );
	if ( s.translated < 25 ) {
		fs.rmSync( target );
		continue;
	}
	console.log( `${ locale.padEnd( 14 ) } ${ String( s.percent ).padStart( 3 ) }%  ${ s.translated } translated, ${ s.fuzzy } fuzzy` );
}

fs.rmSync( path.join( ROOT, '.tmp' ), { recursive: true, force: true } );
