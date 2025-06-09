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
    console.log(`[SETUP] Recebido pedido para preparar: ${type} ${imdbId}`);

    if (streamUrlCache.has(imdbId)) {
        console.log(`[SETUP] Link encontrado na cache para ${imdbId}.`);
        return res.json({ success: true, streamPath: `/stream/${imdbId}` });
    }

    try {
        const torrentioUrl = `https://torrentio.strem.fun/stream/${type}/${imdbId}.json`;
        const { data: torrentsData } = await axios.get(torrentioUrl);
        const stream = torrentsData.streams?.find(s => s.infoHash);
        if (!stream) throw new Error('Nenhum stream encontrado no Torrentio.');

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
                console.log(`[SETUP] [${imdbId}] Tentativa ${attempts + 1}: Status - ${torrentInfo.status}`);
                if (torrentInfo.status === 'downloaded') {
                    if (torrentInfo.links && torrentInfo.links.length > 0) return torrentInfo;
                } else if (torrentInfo.status === 'waiting_files_selection') {
                    const videoFile = torrentInfo.files.filter(f => f.path.match(/\.(mp4|mkv|avi)$/i) && f.bytes > 10000000).sort((a, b) => b.bytes - a.bytes)[0];
                    if (videoFile) {
                        await axios.post(
                            `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`,
                            `files=${videoFile.id}`,
                            { headers: { 'Authorization': `Bearer ${REAL_DEBRID_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
                        );
                    }
                } else if (['magnet_error', 'error', 'dead'].includes(torrentInfo.status)) {
                    throw new Error(`Erro no torrent do RD: ${torrentInfo.error || torrentInfo.status}`);
                }
            }
            throw new Error('Processamento no Real-Debrid demorou muito.');
        };

        const torrentInfo = await pollTorrentInfo();
        const downloadableLink = torrentInfo.links[0];

        const { data: unrestrictedData } = await axios.post(
            'https://api.real-debrid.com/rest/1.0/unrestrict/link',
            `link=${downloadableLink}`,
            { headers: { 'Authorization': `Bearer ${REAL_DEBRID_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const finalStreamUrl = unrestrictedData.download;

        streamUrlCache.set(imdbId, finalStreamUrl);
        setTimeout(() => streamUrlCache.delete(imdbId), 3600 * 1000);

        console.log(`[SETUP] Link para ${imdbId} preparado e guardado na cache.`);
        res.json({ success: true, streamPath: `/stream/${imdbId}` });

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[SETUP] Erro ao preparar o stream para ${imdbId}:`, errorMessage);
        res.status(500).json({ success: false, message: `Erro ao preparar o vídeo: ${errorMessage}` });
    }
});

// --- Endpoint de Stream (Versão de Teste com REDIRECIONAMENTO) ---
app.get('/stream/:imdbId', (req, res) => {
    const { imdbId } = req.params;
    const finalStreamUrl = streamUrlCache.get(imdbId);

    if (!finalStreamUrl) {
        return res.status(404).send('Link de stream não encontrado ou expirado. Tente novamente a partir da página inicial.');
    }

    console.log(`[TESTE] Redirecionando cliente para o link final do Real-Debrid: ${finalStreamUrl}`);
    res.redirect(finalStreamUrl);
});

app.listen(PORT, () => {
    console.log(`Servidor backend rodando em http://localhost:${PORT}`);
});