/**
 * Start a new language from avada-one.pot.
 *
 * Usage: node scripts/add-locale.js de_AT
 */

import fs from 'node:fs';
import path from 'node:path';
import { DOMAIN, POT_FILE, PO_DIR, run } from './lib.js';

const locale = process.argv[ 2 ];

if ( ! locale || ! /^[a-z]{2,3}(_[A-Za-z0-9]+)*$/.test( locale ) ) {
	console.error( 'Usage: node scripts/add-locale.js <wp_locale>   e.g. de_AT, pt_BR, ja' );
	process.exit( 1 );
}

const file = path.join( PO_DIR, `${ DOMAIN }-${ locale }.po` );

if ( fs.existsSync( file ) ) {
	console.error( `${ path.relative( process.cwd(), file ) } already exists.` );
	process.exit( 1 );
}

fs.mkdirSync( PO_DIR, { recursive: true } );

// msginit fills Language and Plural-Forms for the locale.
run( 'msginit', [ '--no-translator', '--no-wrap', '-l', `${ locale }.UTF-8`, '-i', POT_FILE, '-o', file ] );
run( 'msgattrib', [ '--no-location', '--no-wrap', '--sort-output', '-o', file, file ] );

console.log( `Created ${ path.relative( process.cwd(), file ) }` );
