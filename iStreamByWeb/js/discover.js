const TMDB_API_KEY = "f0609e6638ef2bc5b31313a712e7a8a4";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const ORIGINAL_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";
const YOUTUBE_BASE_URL = "https://www.youtube.com/embed/";

const PROVIDERS = {
    8: 'Netflix',
    337: 'Disney Plus',
    9: 'Prime Video',
    350: 'Apple TV Plus',
    384: 'HBO Max'
};

const state = {
    currentFilter: {
        type: 'movie',
        provider: null,
        genre: null,
        sort: 'popular'
    },
    watchLater: JSON.parse(localStorage.getItem('watchLater')) || [],
    genres: null,
    isLoading: false,
    currentResults: [],
    currentTrailerKey: "",
    player: null
};

const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

const showLoading = () => {
    state.isLoading = true;
    document.getElementById('loading-spinner')?.classList.add('active');
};

const hideLoading = () => {
    state.isLoading = false;
    document.getElementById('loading-spinner')?.classList.remove('active');
};

function showNotification(message, type) {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function addEventListenersToContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (container.dataset.listenerAttached) {
        return;
    }

    container.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button || !button.dataset.item) return;

        try {
            const itemData = JSON.parse(button.dataset.item);
            const itemType = itemData.media_type || state.currentFilter.type;

            if (button.classList.contains('play-btn')) {
                const poster = itemData.poster_path ? `${IMAGE_BASE_URL}${itemData.poster_path}` : '';
                playMovie(itemData.imdb_id, itemType, itemData.title || itemData.name, poster);
            } else if (button.classList.contains('details-btn')) {
                showDetails(itemData, itemType);
            } else if (button.classList.contains('watch-later-btn')) {
                toggleWatchLater(itemData, itemType, button);
            }
        } catch (e) {
            console.error("Failed to parse item data from data-item attribute", e);
            showNotification("Could not perform action due to a data error.", "error");
        }
    });

    container.dataset.listenerAttached = 'true';
}

async function fetchMovies(endpoint, containerId = 'movie-grid', type = state.currentFilter.type, params = {}) {
    showLoading();
    try {
        const queryParams = new URLSearchParams({
            api_key: TMDB_API_KEY,
            language: 'en-US',
            ...params
        });

        if (state.currentFilter.provider && !params.with_watch_providers) {
            queryParams.append('with_watch_providers', state.currentFilter.provider);
            queryParams.append('watch_region', 'US');
        }
        if (state.currentFilter.genre && !params.with_genres) {
            queryParams.append('with_genres', state.currentFilter.genre);
        }

        const response = await fetch(`${TMDB_BASE_URL}/${endpoint}?${queryParams}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.status_message || `Failed to fetch from ${endpoint}`);
        }
        const data = await response.json();
        state.currentResults = data.results;
        state.currentFilter.type = type;
        renderMovies(containerId, type);
    } catch (error) {
        console.error(`Error loading ${type}s:`, error);
        showNotification(`Failed to load content: ${error.message}`, "error");
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = `<p class="error-message">Could not load content. ${error.message}</p>`;
    } finally {
        hideLoading();
    }
}

async function renderMovies(containerId = 'movie-grid', type = state.currentFilter.type) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error("Movie grid container not found:", containerId);
        return;
    }
    const spinner = document.getElementById("loading-spinner");
    if (spinner) spinner.classList.add("active");
    container.innerHTML = "";

    const searchQuery = document.getElementById("search-input")?.value.toLowerCase() || "";
    const filteredResults = state.currentResults.filter((item) =>
        (item.title || item.name)?.toLowerCase().includes(searchQuery)
    );

    if (filteredResults.length === 0) {
        container.innerHTML = "<p>No results found.</p>";
        if (spinner) spinner.classList.remove("active");
        return;
    }

    const itemsToRender = await Promise.all(filteredResults.map(async item => {
        let imdbId = "";
        try {
            const externalIdsResponse = await fetch(`${TMDB_BASE_URL}/${type}/${item.id}/external_ids?api_key=${TMDB_API_KEY}`);
            if (externalIdsResponse.ok) {
                const externalIds = await externalIdsResponse.json();
                imdbId = externalIds.imdb_id || "";
            }
        } catch (error) {
            console.warn("Error fetching IMDb ID for item:", item.id, error);
        }
        item.imdb_id = imdbId;
        return item;
    }));

    container.innerHTML = itemsToRender.map((item, index) => {
        const poster = item.poster_path ?
            `${IMAGE_BASE_URL}${item.poster_path}` :
            "https://via.placeholder.com/200x280?text=No+Poster";
        const title = item.title || item.name;
        const rating = item.vote_average ? item.vote_average.toFixed(1) : "N/A";
        const itemJSON = JSON.stringify(item).replace(/'/g, "&#39;");
        const isInWatchLater = state.watchLater.some(w => w.id === item.id && w.type === type);

        return `
            <article class="movie-card" style="--i: ${index + 1};" tabindex="0" aria-label="Details for ${title}">
                <img src="${poster}" alt="${title} Poster">
                <div class="movie-card-overlay">
                    ${item.imdb_id ? `<button class="play-btn" data-item='${itemJSON}'>Play ${type === "movie" ? "Movie" : "Series"}</button>` : '<button disabled>Play Unavailable</button>'}
                    <button class="details-btn" data-item='${itemJSON}'>View Details</button>
                    <button class="watch-later-btn" data-item='${itemJSON}'>${isInWatchLater ? 'Remove from Watch Later' : 'Add to Watch Later'}</button>
                </div>
                <div class="movie-card-content">
                    <h3>${title}</h3>
                    <p>Rating: ${rating}/10</p>
                </div>
            </article>
        `;
    }).join('');
    
    addEventListenersToContainer(containerId);

    if (spinner) spinner.classList.remove("active");
}

function playMovie(imdbId, type, title, poster) {
    if (!imdbId) {
        showNotification("Não é possível reproduzir: ID do IMDb está faltando.", "error");
        return;
    }
    const playerUrl = `player.html?imdbId=${imdbId}&type=${type}&title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}`;
    window.open(playerUrl, '_blank');
}

async function fetchGenres() {
    if (state.genres) {
        populateGenres(state.genres);
        return;
    }
    showLoading();
    try {
        const [movieGenresResponse, tvGenresResponse] = await Promise.all([
            fetch(`${TMDB_BASE_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=en-US`),
            fetch(`${TMDB_BASE_URL}/genre/tv/list?api_key=${TMDB_API_KEY}&language=en-US`)
        ]);

        if (!movieGenresResponse.ok || !tvGenresResponse.ok) {
            throw new Error("Failed to fetch genre lists.");
        }

        const movieGenresData = await movieGenresResponse.json();
        const tvGenresData = await tvGenresResponse.json();

        const combinedGenres = [...movieGenresData.genres, ...tvGenresData.genres];
        const uniqueGenres = combinedGenres.reduce((acc, current) => {
            if (!acc.find(genre => genre.id === current.id)) {
                acc.push(current);
            }
            return acc;
        }, []).sort((a, b) => a.name.localeCompare(b.name));

        state.genres = uniqueGenres;
        populateGenres(state.genres);
    } catch (error) {
        console.error("Error loading genres:", error);
        showNotification("Failed to load genres.", "error");
    } finally {
        hideLoading();
    }
}

function populateGenres(genres) {
    const genreDropdownContainer = document.getElementById("genre-dropdown");
    const modalGenreDropdownContainer = document.getElementById("modal-genre-dropdown");

    if (genreDropdownContainer) genreDropdownContainer.innerHTML = '';
    if (modalGenreDropdownContainer) modalGenreDropdownContainer.innerHTML = '';

    genres.forEach(genre => {
        const button = document.createElement("button");
        button.textContent = genre.name;
        button.setAttribute("role", "menuitem");
        button.onclick = () => {
            filterByGenre(genre.id, genre.name);
            const activeDropdown = document.querySelector(".dropdown-menu.active, .dropdown-menu.show");
            if (activeDropdown) activeDropdown.classList.remove("active", "show");
        };

        if (genreDropdownContainer) genreDropdownContainer.appendChild(button.cloneNode(true));
        if (modalGenreDropdownContainer) modalGenreDropdownContainer.appendChild(button);
    });
}

function filterByType(type) {
    state.currentFilter.type = type;
    state.currentFilter.genre = null;
    state.currentFilter.provider = null;
    document.querySelectorAll('.filter-button[data-tooltip="Genre Options"]').forEach(btn => btn.textContent = "Genre");
    document.querySelectorAll('.filter-button[data-tooltip="Provider Options"]').forEach(btn => btn.textContent = "Provider");

    fetchMovies(`${type}/${state.currentFilter.sort}`, 'movie-grid', type);
}

async function filterByProvider(providerId, providerName = null) {
    state.currentFilter.provider = providerId;
    state.currentFilter.genre = null;
    const providerButtonText = providerName || PROVIDERS[providerId] || "Provider";
    document.querySelectorAll('.filter-button[data-tooltip="Provider Options"]').forEach(btn => btn.textContent = providerButtonText);
    document.querySelectorAll('.filter-button[data-tooltip="Genre Options"]').forEach(btn => btn.textContent = "Genre");

    fetchMovies(`discover/${state.currentFilter.type}`, 'movie-grid', state.currentFilter.type, {
        with_watch_providers: providerId,
        watch_region: 'US',
        sort_by: 'popularity.desc'
    });
}

async function filterByGenre(genreId, genreName) {
    state.currentFilter.genre = genreId;
    document.querySelectorAll('.filter-button[data-tooltip="Genre Options"]').forEach(btn => btn.textContent = genreName);

    fetchMovies(`discover/${state.currentFilter.type}`, 'movie-grid', state.currentFilter.type, {
        with_genres: genreId,
        sort_by: 'popularity.desc'
    });
}

async function showDetails(item, type) {
    const modal = document.getElementById("details-modal");
    if (!modal) return;

    document.getElementById("details-title").textContent = "Loading...";
    document.getElementById("details-overview").textContent = "";
    document.getElementById("trailer-button").style.display = "none";
    modal.showModal();

    try {
        const response = await fetch(`${TMDB_BASE_URL}/${type}/${item.id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=videos`);
        if (!response.ok) {
            throw new Error('Failed to fetch item details.');
        }
        const details = await response.json();

        document.getElementById("details-title").textContent = details.title || details.name || "No Title";
        document.getElementById("details-poster").src = details.poster_path ?
            `${IMAGE_BASE_URL}${details.poster_path}` :
            "https://via.placeholder.com/200x280?text=No+Poster";
        document.getElementById("details-poster").alt = `${details.title || details.name} Poster`;
        document.getElementById("details-overview").textContent = details.overview || "No overview available.";
        document.getElementById("details-rating").textContent = details.vote_average ? `${details.vote_average.toFixed(1)}/10` : "N/A";
        document.getElementById("details-release").textContent = details.release_date || details.first_air_date || "Unknown";

        const trailer = details.videos?.results.find(v => v.type === "Trailer" && v.site === "YouTube") || details.videos?.results.find(v => v.site === "YouTube");
        state.currentTrailerKey = trailer ? trailer.key : "";

        const trailerButton = document.getElementById("trailer-button");
        if (trailerButton) {
            trailerButton.style.display = state.currentTrailerKey ? "inline-block" : "none";
            trailerButton.onclick = () => playTrailer();
        }

    } catch (error) {
        console.error("Error fetching details:", error);
        showNotification("Could not load details for this item.", "error");
        if (modal.hasAttribute('open')) modal.close();
    }
}

function playTrailer() {
    if (state.currentTrailerKey) {
        const iframe = document.getElementById("trailer-iframe");
        const modal = document.getElementById("trailer-modal");
        if (iframe && modal) {
            iframe.src = `https://www.youtube.com/embed/$${state.currentTrailerKey}?autoplay=1`;
            modal.showModal();
        } else {
            showNotification("Trailer player components not found.", "error");
        }
    } else {
        showNotification("No trailer available to play.", "info");
    }
}

function closeTrailerModal() {
    const iframe = document.getElementById("trailer-iframe");
    const modal = document.getElementById("trailer-modal");
    if (iframe) iframe.src = "";
    if (modal && typeof modal.close === 'function') modal.close();
}

function toggleWatchLater(item, type, buttonElement = null) {
    const index = state.watchLater.findIndex(w => w.id === item.id && w.type === type);
    const watchLaterItem = {
        id: item.id,
        title: item.title || item.name,
        poster_path: item.poster_path,
        type: type,
        rating: item.vote_average,
        overview: item.overview,
        release_date: item.release_date || item.first_air_date,
        addedDate: new Date().toISOString(),
    };

    if (index === -1) {
        state.watchLater.push(watchLaterItem);
        showNotification(`${item.title || item.name} added to Watch Later!`, "success");
        if (buttonElement) {
            buttonElement.textContent = 'Remove from Watch Later';
        }
    } else {
        state.watchLater.splice(index, 1);
        showNotification(`${item.title || item.name} removed from Watch Later.`, "info");
        if (buttonElement) {
            buttonElement.textContent = 'Add to Watch Later';
        }
    }
    localStorage.setItem('watchLater', JSON.stringify(state.watchLater));
}

function setupThemeToggle() {
    const themeToggleButton = document.querySelector(".theme-toggle");
    if (!themeToggleButton) return;

    const applyTheme = (theme) => {
        if (theme === "dark") {
            document.body.classList.add("dark-theme");
            themeToggleButton.innerHTML = '<i class="fas fa-sun"></i>';
            themeToggleButton.setAttribute('data-tooltip', 'Switch to Light Theme');
        } else {
            document.body.classList.remove("dark-theme");
            themeToggleButton.innerHTML = '<i class="fas fa-moon"></i>';
            themeToggleButton.setAttribute('data-tooltip', 'Switch to Dark Theme');
        }
    };

    themeToggleButton.addEventListener("click", () => {
        const isDark = document.body.classList.toggle("dark-theme");
        const newTheme = isDark ? "dark" : "light";
        localStorage.setItem("theme", newTheme);
        applyTheme(newTheme);
    });

    const savedTheme = localStorage.getItem("theme") || "light";
    applyTheme(savedTheme);
}

function setupSidebarToggle() {
    const hamburgerButton = document.querySelector(".hamburger");
    const sidebar = document.querySelector(".sidebar");
    if (hamburgerButton && sidebar) {
        hamburgerButton.addEventListener("click", () => {
            sidebar.classList.toggle("active");
            hamburgerButton.setAttribute('aria-expanded', sidebar.classList.contains('active').toString());
        });
    }
}

function setupProfileDropdown() {
    const userProfileIcon = document.querySelector(".user-profile .fa-user-circle");
    const profileDropdown = document.querySelector(".profile-dropdown");
    if (userProfileIcon && profileDropdown) {
        userProfileIcon.addEventListener("click", (event) => {
            event.stopPropagation();
            const isActive = profileDropdown.classList.toggle("active");
            userProfileIcon.setAttribute('aria-expanded', isActive.toString());
        });
        document.addEventListener('click', (event) => {
            if (!userProfileIcon.contains(event.target) && !profileDropdown.contains(event.target) && profileDropdown.classList.contains('active')) {
                profileDropdown.classList.remove('active');
                userProfileIcon.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function setupBackToTopButton() {
    const backToTopButton = document.querySelector(".back-to-top");
    if (!backToTopButton) return;

    backToTopButton.addEventListener('click', scrollToTop);

    window.addEventListener("scroll", () => {
        backToTopButton.classList.toggle("active", window.scrollY > 300);
    });
}

function toggleDropdown(button) {
    const dropdown = button.nextElementSibling;
    if (!dropdown) return;

    document.querySelectorAll(".dropdown-menu.active, .dropdown-menu.show").forEach(menu => {
        if (menu !== dropdown) {
            menu.classList.remove("active", "show");
            const otherButton = menu.previousElementSibling;
            if (otherButton) otherButton.setAttribute("aria-expanded", "false");
        }
    });

    const isOpen = dropdown.classList.toggle("active");
    button.setAttribute("aria-expanded", isOpen.toString());

    if (isOpen) {
        const closeHandler = (event) => {
            if (!button.contains(event.target) && !dropdown.contains(event.target)) {
                dropdown.classList.remove("active", "show");
                button.setAttribute("aria-expanded", "false");
                document.removeEventListener('click', closeHandler, true);
            }
        };
        document.addEventListener('click', closeHandler, true);
    }
}

function openFilterModal() {
    const modal = document.getElementById("filter-options-modal");
    if (modal) {
        modal.showModal();
        if (!document.getElementById("modal-genre-dropdown").hasChildNodes() && state.genres) {
            populateGenres(state.genres);
        } else if (!state.genres) {
            fetchGenres().then(() => populateGenres(state.genres));
        }
    }
}

function closeFilterModal() {
    const modal = document.getElementById("filter-options-modal");
    if (modal && typeof modal.close === 'function') modal.close();
}

function showTutorial() {
    const modal = document.getElementById("tutorial-modal");
    if (modal) modal.showModal();
}

function closeTutorial() {
    const modal = document.getElementById("tutorial-modal");
    if (modal && typeof modal.close === 'function') modal.close();
}

function setupHelpButton() {
    const helpButton = document.querySelector(".help-button");
    if (helpButton) helpButton.addEventListener("click", showTutorial);
}

function setupSearchBar() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        const debouncedSearch = debounce(() => {
            const searchTerm = searchInput.value.trim();
            const endpoint = searchTerm ? 'search/multi' : `${state.currentFilter.type}/${state.currentFilter.sort}`;
            const params = searchTerm ? { query: searchTerm, include_adult: false } : {};
            fetchMovies(endpoint, 'movie-grid', state.currentFilter.type, params);
        }, 500);

        searchInput.addEventListener("input", debouncedSearch);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchInput.blur();
                debouncedSearch.flush();
            }
        });
    }
}

function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModal = document.querySelector('dialog[open]');
            if (openModal) {
                openModal.close();
                if (openModal.id === 'trailer-modal') {
                    closeTrailerModal();
                }
            } else {
                document.querySelectorAll(".dropdown-menu.active, .dropdown-menu.show").forEach(menu => {
                    menu.classList.remove("active", "show");
                    const button = menu.previousElementSibling;
                    if (button) button.setAttribute("aria-expanded", "false");
                });
            }
        }
    });

    document.querySelectorAll('.dropdown-menu button').forEach(button => {
        button.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            }
        });
    });
}

async function setupFeaturedContent() {
    const discoverMovieTitle = document.getElementById('discoverMovieTitle');
    const discoverMovieDescription = document.getElementById('discoverMovieDescription');
    const discoverFeaturedContent = document.getElementById('discoverFeaturedContent');
    const discoverPlayButton = document.getElementById('discoverPlayButton');

    if (!discoverMovieTitle || !discoverMovieDescription || !discoverFeaturedContent) {
        return;
    }

    try {
        const trendingResponse = await fetch(`${TMDB_BASE_URL}/trending/all/week?api_key=${TMDB_API_KEY}`);
        const trendingData = await trendingResponse.json();
        const results = trendingData.results.filter(item => item.backdrop_path && (item.media_type === 'movie' || item.media_type === 'tv'));

        if (results.length > 0) {
            const featuredItem = results[Math.floor(Math.random() * results.length)];
            const mediaType = featuredItem.media_type;
            const itemId = featuredItem.id;

            const detailsResponse = await fetch(`${TMDB_BASE_URL}/${mediaType}/${itemId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
            if (!detailsResponse.ok) throw new Error('Failed to fetch details for featured content.');
            const details = await detailsResponse.json();

            discoverMovieTitle.textContent = details.title || details.name;
            discoverMovieDescription.textContent = details.overview;
            discoverFeaturedContent.style.backgroundImage = `linear-gradient(to right, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 100%), url(${ORIGINAL_IMAGE_BASE_URL}${details.backdrop_path})`;

            if (discoverPlayButton && details.external_ids.imdb_id) {
                discoverPlayButton.disabled = false;
                discoverPlayButton.onclick = () => {
                    const posterUrl = details.poster_path ? `${IMAGE_BASE_URL}${details.poster_path}` : '';
                    playMovie(details.external_ids.imdb_id, mediaType, details.title || details.name, posterUrl);
                };
            } else if (discoverPlayButton) {
                discoverPlayButton.disabled = true;
            }
        }
    } catch (error) {
        console.error('Erro ao buscar conteúdo em destaque:', error);
        discoverFeaturedContent.innerHTML = '<p class="error-message">Could not load featured content.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupSidebarToggle();
    setupProfileDropdown();
    setupBackToTopButton();
    setupHelpButton();
    setupSearchBar();
    setupKeyboardNavigation();
    setupFeaturedContent();

    fetchGenres();
    fetchMovies(`${state.currentFilter.type}/${state.currentFilter.sort}`, 'movie-grid', state.currentFilter.type);
});

window.toggleDropdown = toggleDropdown;
window.filterByType = filterByType;
window.filterByProvider = filterByProvider;
window.filterByGenre = filterByGenre;
window.openFilterModal = openFilterModal;
window.closeFilterModal = closeFilterModal;