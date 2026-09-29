/**
 * Minimal zip writer (deflate, no directories), so the build has no native
 * `zip` dependency and runs the same locally on any OS.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

function dosDateTime( d = new Date() ) {
	const time = ( d.getHours() << 11 ) | ( d.getMinutes() << 5 ) | ( d.getSeconds() >> 1 );
	const date = ( ( d.getFullYear() - 1980 ) << 9 ) | ( ( d.getMonth() + 1 ) << 5 ) | d.getDate();
	return ( date << 16 ) | time;
}

export function writeZip( outFile, files ) {
	const stamp = dosDateTime() >>> 0;
	const locals = [];
	const centrals = [];
	let offset = 0;

	for ( const { name, data } of files ) {
		const nameBuf = Buffer.from( name, 'utf8' );
		const compressed = zlib.deflateRawSync( data, { level: 9 } );
		const crc = zlib.crc32( data );

		const local = Buffer.alloc( 30 );
		local.writeUInt32LE( 0x04034b50, 0 );
		local.writeUInt16LE( 20, 4 ); // version needed
		local.writeUInt16LE( 0x0800, 6 ); // UTF-8 names
		local.writeUInt16LE( 8, 8 ); // deflate
		local.writeUInt32LE( stamp, 10 ); // time/date
		local.writeUInt32LE( crc, 14 );
		local.writeUInt32LE( compressed.length, 18 );
		local.writeUInt32LE( data.length, 22 );
		local.writeUInt16LE( nameBuf.length, 26 );
		local.writeUInt16LE( 0, 28 );

		const central = Buffer.alloc( 46 );
		central.writeUInt32LE( 0x02014b50, 0 );
		central.writeUInt16LE( 20, 4 ); // version made by
		central.writeUInt16LE( 20, 6 );
		central.writeUInt16LE( 0x0800, 8 );
		central.writeUInt16LE( 8, 10 );
		central.writeUInt32LE( stamp, 12 );
		central.writeUInt32LE( crc, 16 );
		central.writeUInt32LE( compressed.length, 20 );
		central.writeUInt32LE( data.length, 24 );
		central.writeUInt16LE( nameBuf.length, 28 );
		central.writeUInt32LE( offset, 42 );

		locals.push( local, nameBuf, compressed );
		centrals.push( central, nameBuf );
		offset += local.length + nameBuf.length + compressed.length;
	}

	const centralSize = centrals.reduce( ( n, b ) => n + b.length, 0 );
	const end = Buffer.alloc( 22 );
	end.writeUInt32LE( 0x06054b50, 0 );
	end.writeUInt16LE( files.length, 8 );
	end.writeUInt16LE( files.length, 10 );
	end.writeUInt32LE( centralSize, 12 );
	end.writeUInt32LE( offset, 16 );

	fs.writeFileSync( outFile, Buffer.concat( [ ...locals, ...centrals, end ] ) );
}
