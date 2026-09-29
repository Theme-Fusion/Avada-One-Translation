/**
 * Per-string checks shared by validate.js and seed-classic.js.
 */

// No space flag: it would read prose like "50% off" as a placeholder.
const PLACEHOLDER = /%(?:(\d+)\$)?[-+0]*\d*(?:\.\d+)?[bcdeEfFgGosuxX]/g;
const URL = /\b(?:https?:)?\/\/[^\s"'<>)]+/gi;
const TAG = /<\s*\/?\s*([a-z][a-z0-9-]*)/gi;
const DANGEROUS = /<\s*(?:script|iframe|object|embed|style|meta|link|form)\b|\bon[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i;

function placeholders( str ) {
	const numbered = [];
	const positional = [];
	for ( const m of str.replace( /%%/g, '' ).matchAll( PLACEHOLDER ) ) {
		// Translators may reorder numbered placeholders, but not unnumbered ones.
		( m[ 1 ] ? numbered : positional ).push( m[ 0 ] );
	}
	return numbered.sort().join( ' ' ) + ' | ' + positional.join( ' ' );
}

function set( str, re ) {
	return new Set( [ ...str.matchAll( re ) ].map( ( m ) => ( m[ 1 ] || m[ 0 ] ).toLowerCase() ) );
}

export function checkEntry( entry ) {
	const problems = [];
	const sources = [ entry.msgid, entry.msgid_plural || entry.msgid ];

	entry.msgstr.forEach( ( str, i ) => {
		const source = sources[ Math.min( i, 1 ) ];

		// Plural forms may drop the number (e.g. "One item" for n=1), so only
		// check non-singular forms against the plural source, and allow the
		// singular form to omit placeholders the plural form has.
		const expected = placeholders( source );
		const actual = placeholders( str );
		if ( expected !== actual && ! ( entry.msgid_plural && 0 === i && '' === actual.replace( /[\s|]/g, '' ) ) ) {
			problems.push( `placeholders \`${ expected }\` became \`${ actual }\`` );
		}

		// Localising an example URL ("http://example.com" -> "http://exemple.fr") is fine;
		// any other new link is not.
		const sourceUrls = set( sources.join( ' ' ), URL );
		const examplesOnly = sourceUrls.size && [ ...sourceUrls ].every( ( u ) => /example/.test( u ) );
		const urls = set( str, URL );
		if ( examplesOnly && urls.size <= sourceUrls.size && [ ...urls ].every( ( u ) => /^(https?:)?\/\/[\w.-]+\/?$/.test( u ) ) ) {
			urls.clear();
		}
		for ( const url of urls ) {
			if ( ! sourceUrls.has( url ) ) {
				problems.push( `adds a link \`${ url }\`` );
			}
		}

		if ( DANGEROUS.test( str ) && ! DANGEROUS.test( sources.join( ' ' ) ) ) {
			problems.push( 'adds script/iframe/event-handler markup' );
		}

		const sourceTags = set( sources.join( ' ' ), TAG );
		for ( const tag of set( str, TAG ) ) {
			if ( ! sourceTags.has( tag ) ) {
				problems.push( `adds an HTML tag \`<${ tag }>\`` );
			}
		}
	} );

	return problems;
}
