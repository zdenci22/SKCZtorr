const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const builder = new addonBuilder({
    id: "czsk.torrent.super",
    version: "1.0.0",
    name: "CZSK Super Streams",
    description: "Massive torrent streams",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

const CZ_PATTERNS = [
    /cz/i,
    /sk/i,
    /dab/i,
    /fenix/i,
    /czteam/i,
    /czrip/i,
    /titulky/i
];

function isCZSK(title) {
    return CZ_PATTERNS.some(p => p.test(title));
}

function toStream(t) {

    const size = t.size
        ? (t.size / 1024 / 1024 / 1024).toFixed(2)
        : "?";

    return {
        title: `${t.name}\n👤 ${t.seeders} 📀 ${size}GB`,
        infoHash: t.info_hash,
        sources: [`tracker:${t.tracker || "public"}`]
    };
}

async function searchPirateBay(query) {

    try {

        const res = await axios.get(
            `https://apibay.org/q.php?q=${encodeURIComponent(query)}`
        );

        return res.data.map(t => ({
            name: t.name,
            seeders: parseInt(t.seeders),
            size: parseInt(t.size),
            info_hash: t.info_hash,
            tracker: "TPB"
        }));

    } catch {
        return [];
    }
}

async function searchYTS(imdb) {

    try {

        const res = await axios.get(
            `https://yts.mx/api/v2/list_movies.json?query_term=${imdb}`
        );

        if (!res.data.data.movies) return [];

        const torrents = [];

        for (const movie of res.data.data.movies) {

            for (const t of movie.torrents) {

                torrents.push({
                    name: `${movie.title} ${t.quality}`,
                    seeders: 100,
                    size: t.size_bytes,
                    info_hash: t.hash,
                    tracker: "YTS"
                });
            }
        }

        return torrents;

    } catch {
        return [];
    }
}

async function multiSearch(imdb) {

    const queries = [
        imdb,
        imdb.replace("tt", "")
    ];

    let results = [];

    for (const q of queries) {

        const tpb = await searchPirateBay(q);
        results.push(...tpb);
    }

    const yts = await searchYTS(imdb);
    results.push(...yts);

    return results;
}

function uniqueByHash(arr) {

    const seen = new Set();

    return arr.filter(t => {

        if (seen.has(t.info_hash)) return false;

        seen.add(t.info_hash);

        return true;
    });
}

builder.defineStreamHandler(async ({ id }) => {

    const imdb = id.split(":")[0];

    const torrents = await multiSearch(imdb);

    const unique = uniqueByHash(torrents);

    const filtered = unique
        .filter(t => isCZSK(t.name))
        .sort((a, b) => b.seeders - a.seeders)
        .slice(0, 500);

    const streams = filtered.map(toStream);

    return { streams };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });

console.log("CZSK Super Addon running");
