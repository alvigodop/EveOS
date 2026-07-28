'use strict';

const path = require('node:path');
const { mergeTrack } = require(path.resolve(__dirname, '..', '..', 'server_modules', 'audioflix_spotify_scrape.js'));

const merged = mergeTrack(null, {
    title: 'Purpose Is Glorious',
    artists: ['Natalie Holt'],
    durationText: '3:08',
    url: 'https://open.spotify.com/track/example123456'
});

if (merged.title !== 'Purpose Is Glorious'
    || merged.artist !== 'Natalie Holt'
    || merged.duration !== 188) {
    throw new Error('ASSERT FAILED: DOM-only Spotify rows must merge without a network record.');
}

console.log('AUDIOFLIX_SPOTIFY_SCRAPER_SMOKE_OK');
