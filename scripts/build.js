/**
 * Build WordPress language packs and the manifest Avada One reads.
 *
 * For every po file with at least one translated string this writes
 *   dist/packages/avada-one-<locale>.zip   (.po + .mo + .l10n.php, translated strings only)
 * and one
 *   dist/manifest.json
 *
 * A locale's `updated` date only moves when its translations actually change
 * (compared by hash against the currently published manifest), so re-syncing
 * the pot file doesn't make every site re-download every language.
 *
 * Usage: node scripts/build.js --base-url https://example.com/path [--out dist]
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import gettextParser from 'gettext-parser';
import { DOMAIN, POT_FILE, entries, isTranslated, localeFromFile, poFiles, readPo, stats } from './lib.js';
import { writeZip } from './zip.js';

const { values: args } = parseArgs( {
	options: {
		'base-url': { type: 'string' },
		out: { type: 'string', default: 'dist' },
	},
} );

if ( ! args[ 'base-url' ] ) {
	console.error( 'Usage: node scripts/build.js --base-url <public url of the published site> [--out dist]' );
	process.exit( 1 );
}

const baseUrl = args[ 'base-url' ].replace( /\/+$/, '' );
const outDir = path.resolve( args.out );
const packagesDir = path.join( outDir, 'packages' );
const now = new Date().toISOString().slice( 0, 19 ).replace( 'T', ' ' );
const potVersion = readPo( POT_FILE ).headers[ 'Project-Id-Version' ] || '';

fs.rmSync( outDir, { recursive: true, force: true } );
fs.mkdirSync( packagesDir, { recursive: true } );

// The live manifest, so unchanged locales keep their date.
let previous = {};
try {
	const res = await fetch( `${ baseUrl }/manifest.json`, { signal: AbortSignal.timeout( 15000 ) } );
	if ( res.ok ) {
		previous = ( await res.json() ).translations || {};
	}
} catch {
	console.warn( 'No published manifest found; every locale gets a fresh date.' );
}

/**
 * Double-quoted PHP string literal.
 */
function phpString( str ) {
	return '"' + str.replace( /[\\"$]/g, '\\$&' ).replace( /[\x00-\x1f\x7f]/g, ( c ) => '\\x' + c.charCodeAt( 0 ).toString( 16 ).padStart( 2, '0' ) ) + '"';
}

/**
 * WordPress 6.5+ PHP translation file (same shape as `wp i18n make-php`).
 */
function l10nPhp( headers, messages ) {
	const lines = [ '<?php', 'return [' ];
	for ( const [ key, value ] of Object.entries( headers ) ) {
		lines.push( `\t${ phpString( key.toLowerCase() ) } => ${ phpString( value ) },` );
	}
	lines.push( "\t'messages' => [" );
	for ( const [ key, value ] of messages ) {
		lines.push( `\t\t${ phpString( key ) } => ${ phpString( value ) },` );
	}
	lines.push( '\t],', '];', '' );
	return lines.join( '\n' );
}

const manifest = {
	domain: DOMAIN,
	generated: now,
	pot_version: potVersion,
	translations: {},
};

for ( const file of poFiles() ) {
	const locale = localeFromFile( file );
	if ( ! locale ) {
		console.warn( `Skipping ${ path.basename( file ) }: unexpected file name.` );
		continue;
	}

	const data = readPo( file );
	const s = stats( data );
	if ( ! s.translated ) {
		continue;
	}

	// Only translated, non-fuzzy strings are shipped.
	const clean = { charset: 'utf-8', headers: {}, translations: { '': { '': { msgid: '', msgstr: [ '' ] } } } };
	const messages = [];
	const hash = crypto.createHash( 'sha256' );
	hash.update( data.headers[ 'Plural-Forms' ] || '' );

	for ( const entry of entries( data ) ) {
		if ( ! isTranslated( entry ) ) {
			continue;
		}
		const ctx = entry.msgctxt || '';
		clean.translations[ ctx ] ??= {};
		clean.translations[ ctx ][ entry.msgid ] = {
			msgctxt: entry.msgctxt,
			msgid: entry.msgid,
			msgid_plural: entry.msgid_plural,
			msgstr: entry.msgstr,
		};
		const key = ( ctx ? ctx + '\x04' : '' ) + entry.msgid;
		messages.push( [ key, entry.msgstr.join( '\x00' ) ] );
		hash.update( JSON.stringify( [ key, entry.msgid_plural || '', entry.msgstr ] ) );
	}

	messages.sort( ( a, b ) => ( a[ 0 ] < b[ 0 ] ? -1 : a[ 0 ] > b[ 0 ] ? 1 : 0 ) );
	const digest = hash.digest( 'hex' ).slice( 0, 16 );
	const updated = previous[ locale ]?.hash === digest && previous[ locale ]?.updated ? previous[ locale ].updated : now;

	// WordPress compares PO-Revision-Date of the installed file against `updated`.
	clean.headers = {
		'Project-Id-Version': potVersion,
		'PO-Revision-Date': `${ updated }+0000`,
		Language: locale,
		'Plural-Forms': data.headers[ 'Plural-Forms' ] || 'nplurals=2; plural=(n != 1);',
		'MIME-Version': '1.0',
		'Content-Type': 'text/plain; charset=UTF-8',
		'Content-Transfer-Encoding': '8bit',
		'X-Domain': DOMAIN,
		'X-Generator': 'Avada-One-Translation',
	};

	const base = `${ DOMAIN }-${ locale }`;
	const zipName = `${ base }.zip`;
	writeZip( path.join( packagesDir, zipName ), [
		{ name: `${ base }.po`, data: gettextParser.po.compile( clean ) },
		{ name: `${ base }.mo`, data: gettextParser.mo.compile( clean ) },
		{ name: `${ base }.l10n.php`, data: Buffer.from( l10nPhp( clean.headers, messages ) ) },
	] );

	manifest.translations[ locale ] = {
		updated,
		hash: digest,
		// The query string makes CDN caches fetch the new zip as soon as the manifest changes.
		package: `${ baseUrl }/packages/${ zipName }?v=${ digest.slice( 0, 8 ) }`,
		percent: s.percent,
		translated: s.translated,
		total: s.total,
	};

	console.log( `${ locale.padEnd( 14 ) } ${ String( s.percent ).padStart( 3 ) }%  ${ s.translated }/${ s.total }${ updated === now ? '  (updated)' : '' }` );
}

fs.writeFileSync( path.join( outDir, 'manifest.json' ), JSON.stringify( manifest, null, '\t' ) + '\n' );
fs.writeFileSync( path.join( outDir, '.nojekyll' ), '' );

// Human-readable status page.
const rows = Object.entries( manifest.translations )
	.sort( ( a, b ) => b[ 1 ].percent - a[ 1 ].percent )
	.map( ( [ locale, t ] ) => `<tr><td>${ locale }</td><td><meter min="0" max="100" value="${ t.percent }"></meter> ${ t.percent }%</td><td>${ t.translated } / ${ t.total }</td><td>${ t.updated }</td><td><a href="${ t.package }">zip</a></td></tr>` )
	.join( '\n' );
fs.writeFileSync( path.join( outDir, 'index.html' ), `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avada One translations</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{padding:.35rem .5rem;border-bottom:1px solid #ddd;text-align:left}meter{width:90px}</style>
<h1>Avada One translations</h1>
<p>Language packs for ${ potVersion }. Built ${ now } UTC. <a href="manifest.json">manifest.json</a></p>
<table><thead><tr><th>Locale</th><th>Done</th><th>Strings</th><th>Updated (UTC)</th><th></th></tr></thead><tbody>
${ rows }
</tbody></table>
` );

console.log( `Built ${ Object.keys( manifest.translations ).length } language pack(s) into ${ path.relative( process.cwd(), outDir ) || '.' }` );
