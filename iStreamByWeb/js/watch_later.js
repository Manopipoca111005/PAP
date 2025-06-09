// ===== Constantes Globais (MUITO CUIDADO COM API KEYS NO CLIENT-SIDE!) =====
const TMDB_API_KEY = "f0609e6638ef2bc5b31313a712e7a8a4"; // A SUA TMDB API KEY
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const YOUTUBE_EMBED_BASE_URL = "https://www.youtube.com/embed/VIDEO_ID"; // URL Padrão para embeds do YouTube

// ===== Variáveis de Estado Globais =====
let watchLaterItemsGlobal = [];
let filteredItemsGlobal = [];
let searchTermGlobal = "";
let currentTypeFilterGlobal = 'all'; // 'all', 'movie', 'tv'
let currentSortByGlobal = 'addedDate'; // Opção de ordenação padrão
let currentPlayer = null;
let currentItemForDetailsTrailer = null;

// ===== Funções Utilitárias de UI (Notificação, Loading) =====
function showNotification(message, type = 'info') {
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) existingNotification.remove();

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  if (!document.getElementById('notification-styles-watchlater')) {
    const style = document.createElement('style');
    style.id = 'notification-styles-watchlater';
    // Estilos podem ser partilhados com discover.js se tiver um ficheiro CSS/JS comum
    style.textContent = `
        .notification { position: fixed; bottom: -70px; left: 50%; transform: translateX(-50%); padding: 12px 25px; border-radius: 8px; color: white; background-color: #333; z-index: 1005; font-size: 0.95rem; opacity: 0; transition: opacity 0.3s ease-in-out, bottom 0.3s ease-in-out; box-shadow: 0 4px 15px rgba(0,0,0,0.2); text-align: center; }
        .notification.success { background-color: #4CAF50; }
        .notification.error { background-color: #f44336; }
        .notification.info { background-color: #2196F3; }`;
    document.head.appendChild(style);
  }
  
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.bottom = '20px';
  });

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.bottom = '-70px';
    setTimeout(() => notification.remove(), 350);
  }, 3000);
}

const loadingSpinnerWatchLater = document.getElementById('loading-spinner-watch-later');
function showLoading() {
    if (loadingSpinnerWatchLater) loadingSpinnerWatchLater.style.display = 'flex';
    else console.log("A carregar...");
}
function hideLoading() {
    if (loadingSpinnerWatchLater) loadingSpinnerWatchLater.style.display = 'none';
    else console.log("Carregamento completo.");
}


// ===== Funções de Detalhes e Trailer =====
async function fetchTmdbDetails(itemId, itemType) {
    showLoading();
    try {
        const lang = 'pt-BR'; // ou 'en-US'
        const [detailsRes, creditsRes, externalIdsRes] = await Promise.all([
            fetch(`${TMDB_BASE_URL}/${itemType}/${itemId}?api_key=${TMDB_API_KEY}&language=${lang}&append_to_response=release_dates`),
            fetch(`${TMDB_BASE_URL}/${itemType}/${itemId}/credits?api_key=${TMDB_API_KEY}&language=${lang}`),
            fetch(`${TMDB_BASE_URL}/${itemType}/${itemId}/external_ids?api_key=${TMDB_API_KEY}`)
        ]);
        if (!detailsRes.ok) throw new Error(`Detalhes TMDB: ${detailsRes.statusText}`);
        if (!creditsRes.ok) throw new Error(`Créditos TMDB: ${creditsRes.statusText}`);
        if (!externalIdsRes.ok) throw new Error(`IDs Externos TMDB: ${externalIdsRes.statusText}`);
        
        const details = await detailsRes.json();
        const credits = await creditsRes.json();
        const externalIds = await externalIdsRes.json();

        const director = credits.crew?.find(member => member.job === "Director")?.name || "N/A";
        const cast = credits.cast?.slice(0, 5).map(actor => actor.name).join(", ") || "N/A";
        
        return { ...details, imdb_id: externalIds.imdb_id, director, cast };
    } catch (error) { console.error("Erro ao obter detalhes TMDB:", error); showNotification("Erro ao carregar detalhes.", "error"); return null;
    } finally { hideLoading(); }
}

async function fetchTrailerKey(itemId, itemType) {
    try {
        const response = await fetch(`${TMDB_BASE_URL}/${itemType}/${itemId}/videos?api_key=${TMDB_API_KEY}&language=en-US,pt-BR`);
        if (!response.ok) throw new Error('Falha ao obter vídeos do trailer.');
        const data = await response.json();
        const trailer = data.results?.find(video => video.type === "Trailer" && video.site === "YouTube" && video.iso_639_1 === "pt") || 
                        data.results?.find(video => video.type === "Trailer" && video.site === "YouTube" && video.iso_639_1 === "en") || 
                        data.results?.find(video => video.type === "Trailer" && video.site === "YouTube");
        return trailer ? trailer.key : null;
    } catch (error) { console.error("Erro ao obter chave do trailer:", error); return null; }
}

window.openTrailerModalFromDetails = async function() {
    if (currentItemForDetailsTrailer?.id && currentItemForDetailsTrailer?.type) {
        showLoading();
        const trailerKey = await fetchTrailerKey(currentItemForDetailsTrailer.id, currentItemForDetailsTrailer.type);
        hideLoading();
        const trailerModal = document.getElementById('trailer-modal');
        const trailerIframe = document.getElementById('trailer-iframe');
        if (trailerKey && trailerIframe && trailerModal) {
            trailerIframe.src = `${YOUTUBE_EMBED_BASE_URL}/${trailerKey}?autoplay=1&hl=pt`;
            if (typeof trailerModal.showModal === 'function') trailerModal.showModal(); else trailerModal.style.display = 'flex';
        } else { showNotification('Nenhum trailer disponível.', 'info'); }
    }
};

window.closeTrailerModal = function() {
    const tModal = document.getElementById('trailer-modal'); const tIframe = document.getElementById('trailer-iframe');
    if (tIframe) tIframe.src = ""; if (tModal && typeof tModal.close === 'function') tModal.close(); else if (tModal) tModal.style.display = 'none';
};

async function showItemDetails(item) {
    currentItemForDetailsTrailer = item;
    const detailsModal = document.getElementById("details-modal");
    if (!detailsModal) return;
    const fullDetails = (item.director && item.cast) ? item : await fetchTmdbDetails(item.id, item.type);
    if (!fullDetails) { showNotification("Não foi possível carregar os detalhes.", "error"); return; }

    document.getElementById("details-title").textContent = fullDetails.title || fullDetails.name || "N/A";
    document.getElementById("details-poster").src = fullDetails.poster_path ? `${IMAGE_BASE_URL}${fullDetails.poster_path}` : "https://via.placeholder.com/150x225?text=S/Poster";
    document.getElementById("details-overview").textContent = fullDetails.overview || "Sem resumo.";
    document.getElementById("details-rating").textContent = fullDetails.vote_average ? `${fullDetails.vote_average.toFixed(1)}/10 (${fullDetails.vote_count} votos)` : "N/A";
    const releaseDate = fullDetails.release_date || fullDetails.first_air_date;
    document.getElementById("details-release").textContent = releaseDate ? new Date(releaseDate + 'T00:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : "N/A";
    document.getElementById("details-director").textContent = fullDetails.director || "N/A";
    document.getElementById("details-cast").textContent = fullDetails.cast || "N/A";
    document.getElementById("details-trailer-button").style.display = 'inline-block';
    if (typeof detailsModal.showModal === 'function') detailsModal.showModal(); else detailsModal.style.display = 'block';
}

// ===== Lógica Específica do Watch Later =====
function applyFiltersAndSort() {
    let itemsToDisplay = [...watchLaterItemsGlobal];

    if (currentTypeFilterGlobal === "movie" || currentTypeFilterGlobal === "tv") {
        itemsToDisplay = itemsToDisplay.filter(item => item.type === currentTypeFilterGlobal);
    }
    if (searchTermGlobal) {
        itemsToDisplay = itemsToDisplay.filter(item =>
            (item.title || item.name || '').toLowerCase().includes(searchTermGlobal)
        );
    }
    
    switch (currentSortByGlobal) {
        case "title": itemsToDisplay.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || '')); break;
        case "addedDate": itemsToDisplay.sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0)); break;
        case "rating": itemsToDisplay.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
    }
    filteredItemsGlobal = itemsToDisplay;
    displayWatchLaterItems(filteredItemsGlobal);
}

function displayWatchLaterItems(itemsToDisplayOnGrid) {
    const grid = document.getElementById("watch-later-grid");
    if (!grid) { console.error("Elemento watch-later-grid não encontrado."); return; }
    grid.innerHTML = "";

    if (!itemsToDisplayOnGrid || itemsToDisplayOnGrid.length === 0) {
        let message = 'A sua lista "Ver Mais Tarde" está vazia.';
        if(searchTermGlobal || currentTypeFilterGlobal !== 'all') message = 'Nenhum item corresponde aos filtros/pesquisa atuais.';
        grid.innerHTML = `<p style="color: var(--text-color, white); text-align: center; width: 100%; padding: 20px;">${message}</p>`;
        return;
    }

    itemsToDisplayOnGrid.forEach((item) => {
        const card = document.createElement("article"); card.classList.add("watch-later-card"); card.tabIndex = 0;
        const itemTitle = item.title || item.name || 'Título Desconhecido';
        card.setAttribute('aria-label', `Item: ${itemTitle}`);
        const posterUrl = item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : "https://via.placeholder.com/200x300?text=S/Poster";
        const itemTypeDisplay = item.type === 'movie' ? 'Filme' : item.type === 'tv' ? 'Série' : 'N/A';
        const itemAddedDate = item.addedDate ? new Date(item.addedDate).toLocaleDateString('pt-BR') : 'N/A';
        const itemRating = item.rating ? `${item.rating.toFixed(1)}/10` : 'N/A';

        card.innerHTML = `
            <img src="${posterUrl}" alt="Poster de ${itemTitle}" loading="lazy">
            <div class="watch-later-card-content">
                <h3 class="watch-later-card-title">${itemTitle}</h3>
                <p class="card-info"><strong>Tipo:</strong> ${itemTypeDisplay}</p>
                <p class="card-info"><strong>Adicionado:</strong> ${itemAddedDate}</p>
                <p class="card-info"><strong>Rating:</strong> ${itemRating}</p>
            </div>
            <div class="watch-later-card-actions">
                <button class="action-btn play-btn" title="Reproduzir ${itemTitle}" aria-label="Reproduzir ${itemTitle}">Play</button>
                <button class="action-btn details-btn" title="Ver detalhes de ${itemTitle}" aria-label="Ver detalhes de ${itemTitle}">Detalhes</button>
                <button class="action-btn remove-btn" title="Remover ${itemTitle}" aria-label="Remover ${itemTitle} da lista">Remover</button>
            </div>`;
        
        card.querySelector(".play-btn")?.addEventListener("click", (e) => { e.stopPropagation(); playWatchLaterItem(item); });
        card.querySelector(".details-btn")?.addEventListener("click", (e) => { e.stopPropagation(); showItemDetails(item); });
        card.querySelector(".remove-btn")?.addEventListener("click", (e) => { e.stopPropagation(); card.classList.add('removing'); card.addEventListener('animationend', () => removeItemFromStorageAndRefresh(item.id, item.type), { once: true }); });
        card.addEventListener('click', (e) => { if (!e.target.closest('.action-btn')) showItemDetails(item); });
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.closest('button')) showItemDetails(item); });
        grid.appendChild(card);
    });
}

function removeItemFromStorageAndRefresh(itemId, itemType) {
    watchLaterItemsGlobal = watchLaterItemsGlobal.filter(item => !(item.id === itemId && item.type === itemType));
    localStorage.setItem('watchLater', JSON.stringify(watchLaterItemsGlobal));
    applyFiltersAndSort();
    showNotification("Item removido da lista!", "success");
}

async function playWatchLaterItem(item) {
    showLoading();
    let imdbIdToPlay = item.imdb_id;
    if (!imdbIdToPlay) {
        try {
            // CORREÇÃO AQUI: URL do fetch corrigido
            const response = await fetch(`${TMDB_BASE_URL}/${item.type}/${item.id}/external_ids?api_key=${TMDB_API_KEY}`);
            if (!response.ok) throw new Error('Falha ao obter IDs externos');
            const externalIdsData = await response.json();
            imdbIdToPlay = externalIdsData?.imdb_id;
        } catch (err) {
            console.error("Erro ao obter IMDB ID:", err);
            hideLoading();
            showNotification("Não foi possível obter os detalhes para reprodução.", "error");
            return;
        }
    }
    hideLoading();

    if (imdbIdToPlay) {
        playMovie(imdbIdToPlay, item.type, (item.title || item.name), item.poster_path);
    } else {
        showNotification("ID do IMDb não encontrado. Não é possível reproduzir.", "error");
    }
}

function playMovie(imdbId, type, title, poster) {
    if (!imdbId) {
        showNotification("Não é possível reproduzir: ID do IMDb está faltando.", "error");
        return;
    }
    const playerUrl = `player.html?imdbId=${imdbId}&type=${type}&title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}`;
    window.open(playerUrl, '_blank');
}

window.sortBy = function(sortByOption, buttonElement) {
    currentSortByGlobal = sortByOption;
    const sortButtonText = document.querySelector('.filter-bar button[data-tooltip="Opções de Ordenação"]');
    if(sortButtonText) sortButtonText.innerHTML = `Ordenar Por: <span style="font-weight:bold;">${(buttonElement || {textContent: sortByOption}).textContent}</span>`;
    applyFiltersAndSort();
    showNotification(`Ordenado por: ${(buttonElement || {textContent:sortByOption}).textContent}!`, "success");
};

window.filterBy = function(filterType, buttonElement) {
    currentTypeFilterGlobal = filterType;
    const filterButtonText = document.getElementById("filter-type-button");
    if(filterButtonText) filterButtonText.innerHTML = `Filtro: <span style="font-weight:bold;">${(buttonElement || {textContent: filterType}).textContent}</span>`;
    
    document.querySelectorAll('#filter-type-dropdown button').forEach(btn => btn.classList.remove('active-filter'));
    if(buttonElement) buttonElement.classList.add('active-filter');
    else {
        const btnToActivate = document.querySelector(`#filter-type-dropdown button[data-filter-type="${filterType}"]`);
        if (btnToActivate) btnToActivate.classList.add('active-filter');
    }
    applyFiltersAndSort();
    showNotification(`Filtrado por: ${(buttonElement || {textContent:filterType}).textContent}!`, "success");
};

// ===== Funções de UI Comuns e Inicialização =====
window.toggleDropdown = function(button) { 
    const allDropdowns = document.querySelectorAll(".dropdown-menu"); const clickedDropdown = button.nextElementSibling; if (!clickedDropdown) return;
    const isActive = clickedDropdown.classList.contains("show");
    allDropdowns.forEach(dropdown => { if (dropdown !== clickedDropdown) { dropdown.classList.remove("show"); if(dropdown.previousElementSibling) dropdown.previousElementSibling.setAttribute('aria-expanded','false');}});
    if (isActive) { clickedDropdown.classList.remove("show"); button.setAttribute('aria-expanded','false'); } else { clickedDropdown.classList.add("show"); button.setAttribute('aria-expanded','true'); }
    const closeHandler = (e) => { if (!button.contains(e.target) && !clickedDropdown.contains(e.target)) { clickedDropdown.classList.remove("show"); button.setAttribute('aria-expanded','false'); document.removeEventListener("click", closeHandler, true); }};
    if (clickedDropdown.classList.contains("show")) document.addEventListener("click", closeHandler, true); else document.removeEventListener("click", closeHandler, true);
};

window.scrollToTop = function() { window.scrollTo({ top: 0, behavior: "smooth" }); showNotification("De volta ao topo!", "info"); };
window.showTutorial = function() { const m = document.getElementById("tutorial-modal"); if(m && typeof m.showModal === 'function') m.showModal(); else if(m) m.style.display = 'block'; };
window.closeTutorial = function() { const m = document.getElementById("tutorial-modal"); if(m && typeof m.close === 'function') m.close(); else if(m) m.style.display = 'none'; };

document.addEventListener("DOMContentLoaded", () => {
    watchLaterItemsGlobal = JSON.parse(localStorage.getItem("watchLater")) || [];
    filteredItemsGlobal = [...watchLaterItemsGlobal];
    
    applyFiltersAndSort();

    const themeToggleButton = document.querySelector(".theme-toggle");
    if (themeToggleButton) {
        const currentTheme = localStorage.getItem("theme");
        if (currentTheme === "dark") { document.body.classList.add("dark-theme"); themeToggleButton.innerHTML = '<i class="fas fa-sun"></i>'; themeToggleButton.setAttribute('data-tooltip', 'Mudar para Tema Claro');}
        else { document.body.classList.remove("dark-theme"); themeToggleButton.innerHTML = '<i class="fas fa-moon"></i>'; themeToggleButton.setAttribute('data-tooltip', 'Mudar para Tema Escuro');}
        themeToggleButton.addEventListener("click", () => { document.body.classList.toggle("dark-theme"); const isDark = document.body.classList.contains("dark-theme"); localStorage.setItem("theme", isDark ? "dark" : "light"); themeToggleButton.innerHTML = `<i class="fas fa-${isDark ? "sun" : "moon"}"></i>`; themeToggleButton.setAttribute('data-tooltip', isDark ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro'); showNotification(`Tema alterado para ${isDark ? 'Escuro' : 'Claro'}!`, "success"); });
    }

    const hamburgerButton = document.querySelector(".hamburger"); const sidebarElement = document.querySelector(".sidebar");
    if (hamburgerButton && sidebarElement) {
        hamburgerButton.addEventListener("click", () => { sidebarElement.classList.toggle("active"); hamburgerButton.setAttribute('aria-expanded', sidebarElement.classList.contains('active')); });
    }

    const userProfileIcon = document.querySelector(".user-profile .fa-user-circle"); const profileDropdownMenu = document.querySelector(".profile-dropdown");
    if (userProfileIcon && profileDropdownMenu) {
        userProfileIcon.addEventListener("click", (event) => { event.stopPropagation(); const isActive = profileDropdownMenu.classList.toggle("active"); userProfileIcon.setAttribute('aria-expanded', isActive); });
        document.addEventListener('click', (event) => { if (profileDropdownMenu.classList.contains('active') && !userProfileIcon.contains(event.target) && !profileDropdownMenu.contains(event.target)) { profileDropdownMenu.classList.remove('active'); userProfileIcon.setAttribute('aria-expanded', 'false'); } });
    }
    
    const backToTopButton = document.querySelector(".back-to-top");
    if (backToTopButton) { window.addEventListener("scroll", () => backToTopButton.classList.toggle("active", window.scrollY > 300)); }

    const helpButton = document.querySelector(".help-button");
    if (helpButton) { helpButton.addEventListener("click", window.showTutorial); }

    const searchInputElement = document.getElementById("search-input");
    if (searchInputElement) {
        searchInputElement.addEventListener("input", (e) => {
            searchTermGlobal = e.target.value.trim().toLowerCase();
            applyFiltersAndSort();
        });
    }
    
    const styleSheet = document.createElement("style");
    if (!document.getElementById('removeCardAnimationStyleWatchLater')) {
        styleSheet.id = 'removeCardAnimationStyleWatchLater';
        styleSheet.textContent = `
            @keyframes removeCardAnimation { 0% { opacity: 1; transform: scale(1) translateX(0); } 100% { opacity: 0; transform: scale(0.8) translateX(50px); height: 0; padding:0 !important; margin:0 !important; border:0 !important; overflow:hidden; } }
            .watch-later-card.removing { animation: removeCardAnimation 0.4s ease-out forwards; }`;
        document.head.appendChild(styleSheet);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const openModals = document.querySelectorAll('dialog[open]');
            openModals.forEach(modal => {
                if (modal.id === 'video-modal') window.closeVideoModal();
                else if (modal.id === 'trailer-modal') window.closeTrailerModal();
                else if (modal.id === 'details-modal' && typeof modal.close === 'function') modal.close();
                else if (modal.id === 'tutorial-modal' && typeof modal.close === 'function') modal.close();
            });
        }
    });
});