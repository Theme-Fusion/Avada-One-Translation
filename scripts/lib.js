/**
 * Shared helpers for the translation scripts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import gettextParser from 'gettext-parser';

export const DOMAIN = 'avada-one';
export const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
export const POT_FILE = path.join( ROOT, `${ DOMAIN }.pot` );
export const PO_DIR = path.join( ROOT, 'po' );

const PO_NAME = new RegExp( `^${ DOMAIN }-([A-Za-z]{2,3}(?:_[A-Za-z0-9]+)*)\\.po$` );

/**
 * Run a command, echoing it, and return stdout.
 */
export function run( cmd, args, opts = {} ) {
	if ( ! opts.quiet ) {
		console.error( `> ${ cmd } ${ args.join( ' ' ) }` );
	}
	return execFileSync( cmd, args, { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'inherit' ], maxBuffer: 256 * 1024 * 1024, ...opts } );
}

/**
 * Locale from a po file name, or null if the name doesn't follow the convention.
 */
export function localeFromFile( file ) {
	const match = path.basename( file ).match( PO_NAME );
	return match ? match[ 1 ] : null;
}

/**
 * All po files in po/, or the given subset (paths relative to the repo root are fine).
 */
export function poFiles( only = [] ) {
	if ( only.length ) {
		return only.map( ( f ) => path.resolve( ROOT, f ) ).filter( ( f ) => f.endsWith( '.po' ) && fs.existsSync( f ) );
	}
	if ( ! fs.existsSync( PO_DIR ) ) {
		return [];
	}
	return fs.readdirSync( PO_DIR ).filter( ( f ) => f.endsWith( '.po' ) ).sort().map( ( f ) => path.join( PO_DIR, f ) );
}

export function readPo( file ) {
	return gettextParser.po.parse( fs.readFileSync( file ) );
}

export function writePo( file, data ) {
	fs.writeFileSync( file, gettextParser.po.compile( data, { foldLength: 0 } ) );
}

/**
 * Iterate every real entry (skips the header entry).
 */
export function* entries( data ) {
	for ( const ctx of Object.keys( data.translations ) ) {
		for ( const id of Object.keys( data.translations[ ctx ] ) ) {
			if ( '' === id ) {
				continue;
			}
			yield data.translations[ ctx ][ id ];
		}
	}
}

export function isFuzzy( entry ) {
	return /\bfuzzy\b/.test( entry.comments?.flag || '' );
}

export function isTranslated( entry ) {
	return ! isFuzzy( entry ) && Array.isArray( entry.msgstr ) && entry.msgstr.length > 0 && entry.msgstr.every( ( s ) => '' !== s );
}

export function wordCount( str ) {
	return str.replace( /<[^>]+>|%(\d+\$)?[sd]/g, ' ' ).split( /\s+/ ).filter( Boolean ).length;
}

/**
 * Translation stats for a parsed po file.
 */
export function stats( data ) {
	const s = { total: 0, translated: 0, fuzzy: 0, words: 0, translatedWords: 0 };
	for ( const entry of entries( data ) ) {
		const words = wordCount( entry.msgid );
		s.total++;
		s.words += words;
		if ( isTranslated( entry ) ) {
			s.translated++;
			s.translatedWords += words;
		} else if ( isFuzzy( entry ) ) {
			s.fuzzy++;
		}
	}
	s.percent = s.total ? Math.floor( ( 100 * s.translated ) / s.total ) : 0;
	return s;
}
