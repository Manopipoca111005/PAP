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
        notification.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}
const styleSheetNotification = document.createElement("style");
styleSheetNotification.textContent = `
    .notification {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        border-radius: 5px;
        color: white;
        z-index: 1005;
        font-size: 1rem;
        opacity: 1;
        transition: opacity 0.5s ease-in-out;
    }
    .notification.success { background-color: #4CAF50; }
    .notification.error { background-color: #f44336; }
    .notification.info { background-color: #2196F3; }

    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(styleSheetNotification);



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
        showNotification("Content loaded!", "success");
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

    for (const [index, item] of filteredResults.entries()) {
        let imdbId = "";
        try {
            const externalIdsResponse = await fetch(
                `${TMDB_BASE_URL}/${type}/${item.id}/external_ids?api_key=${TMDB_API_KEY}`
            );
            if (externalIdsResponse.ok) {
                const externalIds = await externalIdsResponse.json();
                imdbId = externalIds.imdb_id || "";
            }
        } catch (error) {
            console.warn("Error fetching IMDb ID for item:", item.id, error);
        }

        const poster = item.poster_path ?
            `${IMAGE_BASE_URL}${item.poster_path}` :
            "https://via.placeholder.com/200x280?text=No+Poster";
        const title = item.title || item.name;
        const rating = item.vote_average ? item.vote_average.toFixed(1) : "N/A";

        const card = document.createElement("article");
        card.classList.add("movie-card");
        card.style = `--i: ${index + 1};`;
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Details for ${title}`);

        card.innerHTML = `
            <img src="${poster}" alt="${title} Poster">
            <div class="movie-card-overlay">
                ${imdbId ? `<button class="play-btn" onclick='playMovie("${imdbId}", "${type}", "${encodeURIComponent(title)}", "${encodeURIComponent(poster)}")' aria-label="Play ${title}">Play ${type === "movie" ? "Movie" : "Series"}</button>` : '<button disabled>Play Unavailable</button>'}
                <button class="details-btn" onclick='showDetails(${JSON.stringify(item)}, "${type}")' aria-label="View details for ${title}">View Details</button>
                <button class="watch-later-btn" onclick='toggleWatchLater(${JSON.stringify(item)}, "${type}", this)' aria-label="Add or remove ${title} from watch later">${state.watchLater.some(w => w.id === item.id && w.type === type) ? 'Remove from Watch Later' : 'Add to Watch Later'}</button>
            </div>
            <div class="movie-card-content">
                <h3>${title}</h3>
                <p>Rating: ${rating}/10</p>
            </div>
        `;
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.target.closest('button')) {
                showDetails(item, type);
            }
        });
        container.appendChild(card);
    }
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
        showNotification("Genres loaded.", "success");
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
    showNotification(`Filtered by ${type === "movie" ? "Movies" : "Series"}.`, "success");
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
    showNotification(`Filtered by provider: ${providerButtonText}!`, "success");
}

async function filterByGenre(genreId, genreName) {
    state.currentFilter.genre = genreId;
    document.querySelectorAll('.filter-button[data-tooltip="Genre Options"]').forEach(btn => btn.textContent = genreName);

    fetchMovies(`discover/${state.currentFilter.type}`, 'movie-grid', state.currentFilter.type, {
        with_genres: genreId,
        sort_by: 'popularity.desc'
    });
    showNotification(`Filtered by genre: ${genreName}!`, "success");
}

async function showDetails(item, type) {
    const modal = document.getElementById("details-modal");
    if (!modal) return;

    document.getElementById("details-title").textContent = item.title || item.name || "No Title";
    document.getElementById("details-poster").src = item.poster_path ?
        `${IMAGE_BASE_URL}${item.poster_path}` :
        "https://via.placeholder.com/200x280?text=No+Poster";
    document.getElementById("details-poster").alt = `${item.title || item.name} Poster`;
    document.getElementById("details-overview").textContent = item.overview || "No overview available.";
    document.getElementById("details-rating").textContent = item.vote_average ? `${item.vote_average.toFixed(1)}/10` : "N/A";
    document.getElementById("details-release").textContent = item.release_date || item.first_air_date || "Unknown";

    await fetchTrailer(item.id, type);

    const trailerButton = document.getElementById("trailer-button");
    if (trailerButton) {
        trailerButton.style.display = state.currentTrailerKey ? "inline-block" : "none";
        trailerButton.onclick = () => playTrailer();
    }
    const closeButton = modal.querySelector('button[onclick*="details-modal"]');
    if (closeButton && !closeButton.hasAttribute('data-listener-attached')) {
        closeButton.addEventListener('click', () => modal.close());
        closeButton.setAttribute('data-listener-attached', 'true');
    }

    modal.showModal();
    showNotification("Details opened.", "success");
}

async function fetchTrailer(id, type) {
    try {
        const response = await fetch(
            `${TMDB_BASE_URL}/${type}/${id}/videos?api_key=${TMDB_API_KEY}&language=en-US`
        );
        if (!response.ok) throw new Error("Failed to fetch videos.");
        const data = await response.json();
        const trailer = data.results.find(
            (video) => video.type === "Trailer" && video.site === "YouTube"
        );
        state.currentTrailerKey = trailer ? trailer.key : "";
    } catch (error) {
        console.error("Error fetching trailer:", error);
        state.currentTrailerKey = "";
    }
}

function playTrailer() {
    if (state.currentTrailerKey) {
        const iframe = document.getElementById("trailer-iframe");
        const modal = document.getElementById("trailer-modal");
        if (iframe && modal) {
            iframe.src = `https://www.youtube.com/embed/$${state.currentTrailerKey}?autoplay=1`;
            modal.showModal();
            showNotification("Trailer opened.", "success");
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
    showNotification("Trailer closed.", "success");
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
            buttonElement.setAttribute('aria-label', `Remove ${item.title || item.name} from watch later`);
        }
    } else {
        state.watchLater.splice(index, 1);
        showNotification(`${item.title || item.name} removed from Watch Later.`, "success");
        if (buttonElement) {
            buttonElement.textContent = 'Add to Watch Later';
            buttonElement.setAttribute('aria-label', `Add ${item.title || item.name} to watch later`);
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
        showNotification(`Theme switched to ${newTheme}.`, "success");
    });

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme("light");
    }
}

function setupSidebarToggle() {
    const hamburgerButton = document.querySelector(".hamburger");
    const sidebar = document.querySelector(".sidebar");
    if (hamburgerButton && sidebar) {
        hamburgerButton.addEventListener("click", () => {
            sidebar.classList.toggle("active");
            hamburgerButton.setAttribute('aria-expanded', sidebar.classList.contains('active').toString());
            showNotification(sidebar.classList.contains('active') ? "Sidebar opened." : "Sidebar closed.", "info");
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
    showNotification("Scrolled to top.", "info");
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
        showNotification(`${button.getAttribute('data-tooltip') || 'Dropdown'} opened.`, "info");
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
        showNotification("Filter modal opened.", "success");
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
    showNotification("Filter modal closed.", "success");
}

function showTutorial() {
    const modal = document.getElementById("tutorial-modal");
    if (modal) modal.showModal();
    showNotification("Tutorial opened.", "success");
}

function closeTutorial() {
    const modal = document.getElementById("tutorial-modal");
    if (modal && typeof modal.close === 'function') modal.close();
    showNotification("Tutorial closed.", "success");
}

function setupHelpButton() {
    const helpButton = document.querySelector(".help-button");
    if (helpButton) helpButton.addEventListener("click", showTutorial);
}

function setupSearchBar() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", debounce(() => {
            const searchTerm = searchInput.value.trim();
            if (searchTerm) {
                fetchMovies(`search/multi`, 'movie-grid', state.currentFilter.type, {
                    query: searchTerm,
                    include_adult: false
                });
            } else {
                fetchMovies(`${state.currentFilter.type}/${state.currentFilter.sort}`, 'movie-grid', state.currentFilter.type);
            }
        }, 500));

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchInput.blur();
                const searchTerm = searchInput.value.trim();
                if (searchTerm) {
                    fetchMovies(`search/multi`, 'movie-grid', state.currentFilter.type, {
                        query: searchTerm,
                        include_adult: false
                    });
                } else {
                    fetchMovies(`${state.currentFilter.type}/${state.currentFilter.sort}`, 'movie-grid', state.currentFilter.type);
                }
            }
        });
    }
}

function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const videoModal = document.getElementById('video-modal');
            const trailerModal = document.getElementById('trailer-modal');
            const detailsModal = document.getElementById('details-modal');
            const filterModal = document.getElementById('filter-options-modal');
            const tutorialModal = document.getElementById('tutorial-modal');

            if (videoModal && videoModal.open) {
                closeVideoModal();
                return;
            }
            if (trailerModal && trailerModal.open) {
                closeTrailerModal();
                return;
            }
            if (detailsModal && detailsModal.open) {
                detailsModal.close();
                return;
            }
            if (filterModal && filterModal.open) {
                closeFilterModal();
                return;
            }
            if (tutorialModal && tutorialModal.open) {
                closeTutorial();
                return;
            }

            document.querySelectorAll(".dropdown-menu.active, .dropdown-menu.show").forEach(menu => {
                menu.classList.remove("active", "show");
                const button = menu.previousElementSibling;
                if (button) button.setAttribute("aria-expanded", "false");
            });
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

    if (!discoverMovieTitle || !discoverMovieDescription || !discoverFeaturedContent || !discoverPlayButton) {
        console.warn("Featured content elements not found.");
        return;
    }

    try {
        const trendingResponse = await fetch(`${TMDB_BASE_URL}/trending/all/week?api_key=${TMDB_API_KEY}&language=pt-PT`);
        const trendingData = await trendingResponse.json();
        const results = trendingData.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');

        if (results && results.length > 0) {
            const randomIndex = Math.floor(Math.random() * results.length);
            const featuredItemRaw = results[randomIndex];
            const mediaType = featuredItemRaw.media_type;
            const itemId = featuredItemRaw.id;

            const detailsResponse = await fetch(`${TMDB_BASE_URL}/${mediaType}/${itemId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
            if (!detailsResponse.ok) {
                throw new Error('Failed to fetch item details.');
            }
            const details = await detailsResponse.json();

            const title = details.title || details.name;
            const overview = details.overview;
            const backdropPath = details.backdrop_path;
            const posterPath = details.poster_path;
            const imdbId = details.external_ids.imdb_id;

            discoverMovieTitle.textContent = title;
            discoverMovieDescription.textContent = overview;
            if (backdropPath) {
                discoverFeaturedContent.style.backgroundImage = `linear-gradient(to right, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 100%), url(${ORIGINAL_IMAGE_BASE_URL}${backdropPath})`;
            }

            if (imdbId) {
                discoverPlayButton.disabled = false;
                discoverPlayButton.onclick = () => {
                    const posterUrl = posterPath ? `${IMAGE_BASE_URL}${posterPath}` : '';
                    playMovie(imdbId, mediaType, encodeURIComponent(title), encodeURIComponent(posterUrl));
                };
            } else {
                discoverPlayButton.disabled = true;
            }
        }
    } catch (error) {
        console.error('Erro ao buscar filme em destaque:', error);
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


    const filterModalCloseButton = document.querySelector('#filter-options-modal button[onclick="closeFilterModal()"]');
    if (filterModalCloseButton) filterModalCloseButton.addEventListener('click', closeFilterModal);

    const tutorialModalCloseButton = document.querySelector('#tutorial-modal button[onclick="closeTutorial()"]');
    if (tutorialModalCloseButton) tutorialModalCloseButton.addEventListener('click', closeTutorial);

    const detailsModalElement = document.getElementById('details-modal');
    const detailsModalCloseButton = detailsModalElement ? detailsModalElement.querySelector('button[onclick*="details-modal"]') : null;
    if (detailsModalCloseButton) detailsModalCloseButton.addEventListener('click', () => {
        if (detailsModalElement) detailsModalElement.close();
    });


    fetchGenres();
    fetchMovies(`${state.currentFilter.type}/${state.currentFilter.sort}`, 'movie-grid', state.currentFilter.type);

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
        @keyframes removeCard {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8) rotate(10deg); }
            100% { opacity: 0; transform: scale(0) rotate(20deg); height: 0; padding: 0; margin: 0; border: 0; }
        }
        .movie-card.removing {
            animation: removeCard 0.5s forwards;
        }
    `;
    document.head.appendChild(styleSheet);
});

window.toggleDropdown = toggleDropdown;
window.filterByType = filterByType;
window.fetchMovies = fetchMovies;
window.filterByProvider = filterByProvider;
window.filterByGenre = filterByGenre;
window.openFilterModal = openFilterModal;
window.closeFilterModal = closeFilterModal;
window.showDetails = showDetails;
window.playTrailer = playTrailer;
window.closeTrailerModal = closeTrailerModal;
window.playMovie = playMovie;
window.closeVideoModal = closeVideoModal;
window.toggleWatchLater = toggleWatchLater;
window.scrollToTop = scrollToTop;
window.showTutorial = showTutorial;
window.closeTutorial = closeTutorial;