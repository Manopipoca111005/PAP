document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const imdbId = params.get('imdbId');
    const type = params.get('type');
    const title = decodeURIComponent(params.get('title') || 'Player');
    const poster = decodeURIComponent(params.get('poster') || '');
    const playerContainer = document.getElementById('player-container');

    document.title = title + " - iStreamByWeb";

    if (!playerContainer) {
        console.error("Elemento #player-container não encontrado.");
        return;
    }

    const showError = (message) => {
        playerContainer.innerHTML = `<div style="color: white; text-align: center; padding: 20px; font-family: sans-serif;"><h1>Erro ao Carregar</h1><p>${message}</p></div>`;
    };

    if (imdbId && type) {
        fetch(`/setup-stream/${type}/${imdbId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const videoElement = document.createElement('video');
                    videoElement.id = 'player';
                    videoElement.src = data.streamPath;

                    if (poster) {
                        videoElement.poster = poster;
                    }

                    playerContainer.appendChild(videoElement);

                    const player = new Plyr(videoElement, {
                        title: title,
                        autoplay: true,
                        muted: true,
                        settings: ['captions', 'quality', 'speed', 'loop'],
                        controls: [
                            'play-large', 'restart', 'rewind', 'play', 'fast-forward',
                            'progress', 'current-time', 'duration', 'mute', 'volume',
                            'captions', 'settings', 'pip', 'airplay', 'fullscreen'
                        ],
                    });

                    player.on('error', event => {
                        console.error('Erro no leitor Plyr:', event);
                        showError('O leitor de vídeo encontrou um erro inesperado.');
                    });
                } else {
                    console.error('Falha na preparação do stream:', data.message);
                    showError(data.message);
                }
            })
            .catch(error => {
                console.error('Erro de rede ao contactar o servidor de preparação:', error);
                showError('Não foi possível contactar o servidor para preparar o vídeo. Verifique a sua ligação.');
            });
    } else {
        showError("Faltam informações (ID ou tipo) para carregar o vídeo.");
    }
});