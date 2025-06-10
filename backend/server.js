const express = require('express');
const axios = require('axios');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = 3000;

const REAL_DEBRID_TOKEN = "2RHUYGEFBFKUNIKQSUDID2NUIG4MDBOWRD2AFQL3Y6ZOVISI7OSQ";

const streamUrlCache = new Map();

app.use(express.static(path.join(__dirname, '../iStreamByWeb')));

app.get('/setup-stream/:type/:imdbId', async (req, res) => {
    const { type, imdbId } = req.params;
    const { season, episode } = req.query;

    const cacheKey = `${imdbId}-S${season}-E${episode}`;
    console.log(`[SETUP] Pedido para preparar: ${type} ${cacheKey}`);

    if (streamUrlCache.has(cacheKey)) {
        console.log(`[SETUP] Link encontrado na cache para ${cacheKey}.`);
        return res.json({ success: true, streamPath: `/stream/${cacheKey}` });
    }

    try {
        const torrentioUrl = `https://torrentio.strem.fun/stream/${type}/${imdbId}.json`;
        const { data: torrentsData } = await axios.get(torrentioUrl);

        let availableStreams = torrentsData.streams?.filter(s => s.infoHash) || [];

        // Filtra por temporada e episódio
        if (season && episode) {
            const seasonNum = parseInt(season, 10);
            const episodeNum = parseInt(episode, 10);
            const patterns = [
                new RegExp(`S0?${seasonNum}E0?${episodeNum}`, 'i'),
                new RegExp(`0?${seasonNum}x0?${episodeNum}`, 'i'),
                new RegExp(`Season\\s*${seasonNum}\\D+Episode\\s*${episodeNum}`, 'i')
            ];
            availableStreams = availableStreams.filter(stream =>
                patterns.some(p => p.test(stream.title))
            );
        }

        // Evita HEVC/H.265
        availableStreams = availableStreams.filter(s => !/x265|h265|hevc/i.test(s.title));

        // Prioriza MP4
        availableStreams.sort((a, b) => {
            const aIsMp4 = a.title.toLowerCase().includes('.mp4');
            const bIsMp4 = b.title.toLowerCase().includes('.mp4');
            return aIsMp4 === bIsMp4 ? 0 : aIsMp4 ? -1 : 1;
        });

        const stream = availableStreams[0];
        if (!stream) throw new Error('Nenhum stream compatível (MP4/H.264) encontrado.');

        console.log(`[SETUP] [${cacheKey}] Stream selecionado: ${stream.title}`);

        const magnetURI = `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(stream.title)}`;
        const { data: addedMagnetData } = await axios.post(
            'https://api.real-debrid.com/rest/1.0/torrents/addMagnet',
            `magnet=${encodeURIComponent(magnetURI)}`,
            { headers: { 'Authorization': `Bearer ${REAL_DEBRID_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const torrentId = addedMagnetData.id;

        const pollTorrentInfo = async () => {
            for (let attempts = 0; attempts < 25; attempts++) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                const { data: torrentInfo } = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
                    headers: { 'Authorization': `Bearer ${REAL_DEBRID_TOKEN}` }
                });
                console.log(`[SETUP] [${cacheKey}] Tentativa ${attempts + 1}: Status - ${torrentInfo.status}`);

                if (torrentInfo.status === 'downloaded') {
                    if (torrentInfo.links?.length > 0) return torrentInfo;
                } else if (torrentInfo.status === 'waiting_files_selection') {
                    const mp4Files = torrentInfo.files
                        .filter(f => f.path.match(/\.mp4$/i) && f.bytes > 10000000)
                        .sort((a, b) => b.bytes - a.bytes);

                    if (mp4Files.length > 0) {
                        const videoFile = mp4Files[0];
                        await axios.post(
                            `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`,
                            `files=${videoFile.id}`,
                            { headers: { 'Authorization': `Bearer ${REAL_DEBRID_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
                        );
                    } else {
                        await axios.delete(`https://api.real-debrid.com/rest/1.0/torrents/delete/${torrentId}`, {
                            headers: { 'Authorization': `Bearer ${REAL_DEBRID_TOKEN}` }
                        }).catch(() => {});
                        throw new Error(`Nenhum ficheiro MP4 válido encontrado.`);
                    }
                } else if (['magnet_error', 'error', 'dead'].includes(torrentInfo.status)) {
                    throw new Error(`Erro no torrent RD: ${torrentInfo.error || torrentInfo.status}`);
                }
            }
            throw new Error('Timeout no Real-Debrid.');
        };

        const torrentInfo = await pollTorrentInfo();
        const downloadableLink = torrentInfo.links[0];

        const { data: unrestrictedData } = await axios.post(
            'https://api.real-debrid.com/rest/1.0/unrestrict/link',
            `link=${downloadableLink}`,
            { headers: { 'Authorization': `Bearer ${REAL_DEBRID_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const finalStreamUrl = unrestrictedData.download;

        streamUrlCache.set(cacheKey, finalStreamUrl);
        setTimeout(() => streamUrlCache.delete(cacheKey), 3600 * 1000);

        console.log(`[SETUP] Link para ${cacheKey} preparado e guardado na cache.`);
        res.json({ success: true, streamPath: `/stream/${cacheKey}` });

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[SETUP] Erro ao preparar o stream para ${imdbId}:`, errorMessage);
        res.status(500).json({ success: false, message: `Erro: ${errorMessage}` });
    }
});

app.get('/stream/:identifier', async (req, res) => {
    const { identifier } = req.params;
    const finalStreamUrl = streamUrlCache.get(identifier);

    if (!finalStreamUrl) {
        return res.status(404).send('Link de stream não encontrado ou expirado.');
    }

    console.log(`[STREAM] Iniciando proxy para ${identifier}`);

    try {
        const agent = new https.Agent({ rejectUnauthorized: false });

        const videoResponse = await axios({
            method: 'get',
            url: finalStreamUrl,
            responseType: 'stream',
            headers: {
                'Range': req.headers.range || 'bytes=0-'
            },
            httpsAgent: agent
        });

        res.writeHead(videoResponse.status, videoResponse.headers);
        videoResponse.data.pipe(res);

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[STREAM] Erro ao fazer proxy do stream para ${identifier}:`, errorMessage);
        res.status(500).send('Erro ao obter o vídeo.');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor backend rodando em http://localhost:${PORT}`);
});
