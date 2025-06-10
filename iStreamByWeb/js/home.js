const API_KEY = "f0609e6638ef2bc5b31313a712e7a8a4";
const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

let watchLaterList = JSON.parse(localStorage.getItem("watchLater")) || [];
let currentTrailerKey = "";
let currentSearchResults = [];

const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

function handleMediaClick(item, type) {
    if (type === 'movie') {
        const poster = item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : "https://via.placeholder.com/500x750?text=No+Poster";
        const titleText = item.title || item.name || "Untitled";
        playMovie(item.imdb_id, 'movie', titleText, poster);
    } else if (type === 'tv' || type === 'series') {
        openSeriesModal(item);
    } else {
        showNotification("Unsupported media type.", "error");
    }
}

function handleSearchItemClick(index) {
    const item = currentSearchResults[index];
    if (item) {
        handleMediaClick(item, item.media_type);
    }
}

function showDetailsByIndex(index) {
    const item = currentSearchResults[index];
    if (item) {
        showDetails(item, item.media_type);
    }
}

function addToWatchLaterByIndex(index) {
    const item = currentSearchResults[index];
    if (item) {
        addToWatchLater(item, item.media_type);
    }
}

async function handleSearch(query) {
    const mainContainer = document.querySelector('.main');
    const heroBanner = document.querySelector('.hero-banner');
    const originalSections = mainContainer.querySelectorAll('.section');
    let searchSection = document.getElementById('search-results-section');
    currentSearchResults = [];

    if (!query) {
        if (searchSection) searchSection.remove();
        if (heroBanner) heroBanner.style.display = '';
        originalSections.forEach(section => { section.style.display = ''; });
        return;
    }

    if (heroBanner) heroBanner.style.display = 'none';
    originalSections.forEach(section => { section.style.display = 'none'; });

    if (!searchSection) {
        const searchBar = document.querySelector('.search-bar');
        searchSection = document.createElement('div');
        searchSection.id = 'search-results-section';
        searchSection.className = 'section';
        searchSection.innerHTML = `
            <div class="section-title"><i class="fas fa-search"></i> Search Results</div>
            <div class="movie-grid" id="search-results-grid"></div>
            <div class="loading-spinner" id="search-results-spinner"><i class="fas fa-spinner fa-spin"></i></div>`;
        searchBar.insertAdjacentElement('afterend', searchSection);
    }
    searchSection.style.display = '';

    const resultsGrid = document.getElementById('search-results-grid');
    const spinner = document.getElementById('search-results-spinner');
    resultsGrid.innerHTML = '';
    spinner.classList.add('active');

    try {
        const response = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&language=en-US&query=${encodeURIComponent(query)}&include_adult=false`);
        if (!response.ok) throw new Error('Failed to fetch search results.');
        
        const data = await response.json();
        const results = data.results.filter(item => item.media_type !== 'person' && item.poster_path);

        if (results.length === 0) {
            resultsGrid.innerHTML = "<p>No results found.</p>";
            spinner.classList.remove('active');
            return;
        }
        
        for (const item of results) {
             let imdbId = "";
            if (item.id && item.media_type) {
                try {
                    const externalIdsResponse = await fetch(`${BASE_URL}/${item.media_type}/${item.id}/external_ids?api_key=${API_KEY}`);
                    if (externalIdsResponse.ok) imdbId = (await externalIdsResponse.json()).imdb_id || "";
                } catch (e) { console.warn('Could not fetch external ID.'); }
            }
            item.imdb_id = imdbId;
            currentSearchResults.push(item);
        }

        resultsGrid.innerHTML = currentSearchResults.map((item, index) => {
            const poster = `${IMAGE_BASE_URL}${item.poster_path}`;
            const titleText = item.title || item.name || "Untitled";
            return `
                <article class="movie-card" style="--i: ${index + 1};">
                    <img src="${poster}" alt="${titleText} Poster">
                    <div class="carousel-item-overlay">
                        <button onclick='handleSearchItemClick(${index})'>Play</button>
                        <button onclick='showDetailsByIndex(${index})'>View Details</button>
                        <button onclick='addToWatchLaterByIndex(${index})'>Add to Watch Later</button>
                    </div>
                    <div class="carousel-item-content">
                        <h3>${titleText}</h3>
                        <p>Rating: ${item.vote_average ? item.vote_average.toFixed(1) : "N/A"}/10</p>
                    </div>
                </article>`;
        }).join('');

    } catch (error) {
        resultsGrid.innerHTML = `<p class="error-message">Error loading results.</p>`;
        console.error("Search error:", error);
    } finally {
        spinner.classList.remove('active');
    }
}

function setupSearchBar() {
    const searchInput = document.querySelector(".search-input");
    if (searchInput) {
        searchInput.addEventListener("input", debounce(e => handleSearch(e.target.value.trim()), 500));
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(searchInput.value.trim());
                searchInput.blur();
            }
        });
    }
}

function playMovie(imdbId, type, title, poster, season, episode) {
    if (!imdbId) {
        showNotification("Cannot play: Missing IMDb ID.", "error");
        return;
    }
    let playerUrl = `player.html?imdbId=${imdbId}&type=${type}&title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}`;
    if (type === 'series' && season && episode) {
        playerUrl += `&season=${season}&episode=${episode}`;
    }
    window.open(playerUrl, '_blank');
}

async function fetchMovies(endpoint, containerId, type) {
  const container = document.getElementById(containerId);
  const spinner = document.getElementById(`${containerId}-spinner`);
  if (!container || !spinner) return;
  
  try {
    spinner.classList.add("active");
    const response = await fetch(`${BASE_URL}/${endpoint}?api_key=${API_KEY}&language=en-US&include_adult=false`);
    if (!response.ok) throw new Error(`TMDB fetch error: ${response.status}`);
    const data = await response.json();
    
    container.innerHTML = "";
    if (!data.results || data.results.length === 0) {
        container.innerHTML = "<p>No results found.</p>";
        spinner.classList.remove("active");
        return;
    }

    const itemsWithImdb = await Promise.all(data.results.map(async item => {
        const itemTypeForAPI = item.media_type || type || (item.title ? 'movie' : 'tv');
        let imdbId = "";
        if(item.id) {
            try {
                const externalIdsResponse = await fetch(`${BASE_URL}/${itemTypeForAPI}/${item.id}/external_ids?api_key=${API_KEY}`);
                if (externalIdsResponse.ok) imdbId = (await externalIdsResponse.json()).imdb_id || "";
            } catch (e) { console.warn(`Error fetching external ID for ${item.id}`); }
        }
        item.imdb_id = imdbId;
        item.media_type = itemTypeForAPI;
        return item;
    }));

    container.innerHTML = itemsWithImdb.map((item, index) => {
        const poster = item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : "https://via.placeholder.com/200x280?text=No+Poster";
        const titleText = item.title || item.name || "Untitled";
        return `
            <div class="carousel-item" style="--i: ${index + 1};">
                <img src="${poster}" alt="${titleText} Poster">
                <div class="carousel-item-overlay">
                    <button onclick='handleMediaClick(${JSON.stringify(item).replace(/'/g, "\\'")}, "${item.media_type}")'>Play</button>
                    <button onclick='showDetails(${JSON.stringify(item).replace(/'/g, "\\'")}, "${item.media_type}")'>View Details</button>
                    <button onclick='addToWatchLater(${JSON.stringify(item).replace(/'/g, "\\'")}, "${item.media_type}")'>Add to Watch Later</button>
                </div>
                <div class="carousel-item-content">
                    <h3>${titleText}</h3>
                    <p>Rating: ${item.vote_average ? item.vote_average.toFixed(1) : "N/A"}/10</p>
                </div>
            </div>`;
    }).join('');

    spinner.classList.remove("active");
  } catch (error) {
    console.error(`Error loading content for ${containerId}:`, error);
    showNotification(`Failed to load content.`, "error");
    if(container) container.innerHTML = `<p class="error-message">Could not load content.</p>`;
    if(spinner) spinner.classList.remove("active");
  }
}

async function openSeriesModal(seriesData) {
    const modal = document.getElementById('series-modal');
    if (!modal) return;

    document.getElementById('series-modal-title').textContent = seriesData.name || seriesData.title;
    const seasonsList = document.getElementById('seasons-list');
    const episodesList = document.getElementById('episodes-list');
    
    seasonsList.innerHTML = '<div class="loading-spinner active"><i class="fas fa-spinner fa-spin"></i></div>';
    episodesList.innerHTML = '<p>Please select a season first.</p>';
    modal.showModal();

    try {
        const response = await fetch(`${BASE_URL}/tv/${seriesData.id}?api_key=${API_KEY}&language=en-US`);
        if (!response.ok) throw new Error('Failed to fetch series details.');
        const details = await response.json();

        seasonsList.innerHTML = details.seasons
            .filter(season => season.season_number > 0) 
            .map(season => `<button onclick="fetchEpisodes(${seriesData.id}, ${season.season_number}, '${seriesData.imdb_id}', this)">${season.name}</button>`)
            .join('');
    } catch (error) {
        console.error('Error fetching seasons:', error);
        seasonsList.innerHTML = '<p class="error-message">Could not load seasons.</p>';
    }
}

async function fetchEpisodes(seriesId, seasonNumber, seriesImdbId, seasonButton) {
    const episodesList = document.getElementById('episodes-list');
    episodesList.innerHTML = '<div class="loading-spinner active"><i class="fas fa-spinner fa-spin"></i></div>';

    document.querySelectorAll('#seasons-list button').forEach(btn => btn.classList.remove('active'));
    seasonButton.classList.add('active');

    try {
        // Verifica se o IMDb ID está presente; caso não esteja, busca-o
        if (!seriesImdbId) {
            try {
                const externalIdsResponse = await fetch(`${BASE_URL}/tv/${seriesId}/external_ids?api_key=${API_KEY}`);
                if (externalIdsResponse.ok) {
                    const externalIds = await externalIdsResponse.json();
                    seriesImdbId = externalIds.imdb_id || "";
                }
            } catch (error) {
                console.warn("Failed to fetch fallback IMDb ID:", error);
            }
        }

        const response = await fetch(`${BASE_URL}/tv/${seriesId}/season/${seasonNumber}?api_key=${API_KEY}&language=en-US`);
        if (!response.ok) throw new Error('Failed to fetch episodes.');
        const seasonDetails = await response.json();

        const poster = seasonDetails.poster_path ? `${IMAGE_BASE_URL}${seasonDetails.poster_path}` : "https://via.placeholder.com/500x750?text=No+Poster";

        episodesList.innerHTML = seasonDetails.episodes.map(episode => {
            const title = `${episode.episode_number}. ${episode.name}`;
            const fullTitle = `${seasonDetails.name} - ${title}`;
            return `<button class="episode-button" onclick="playMovie('${seriesImdbId}', 'series', '${encodeURIComponent(fullTitle)}', '${encodeURIComponent(poster)}', ${seasonNumber}, ${episode.episode_number})">
                        <span>${title}</span>
                        <i class="fas fa-play play-icon"></i>
                    </button>`;
        }).join('');
    } catch (error) {
        console.error('Error fetching episodes:', error);
        episodesList.innerHTML = '<p class="error-message">Could not load episodes.</p>';
    }
}



function scrollCarousel(containerId, scrollAmount) {
  const container = document.getElementById(containerId);
  if (container) container.scrollBy({ left: scrollAmount, behavior: "smooth" });
}

async function fetchTrailer(id, typeForAPI) {
  try {
    const response = await fetch(`${BASE_URL}/${typeForAPI}/${id}/videos?api_key=${API_KEY}&language=en-US`);
    if (!response.ok) throw new Error(`Failed to fetch videos`);
    const data = await response.json();
    const trailer = data.results.find(v => v.type === "Trailer" && v.site === "YouTube" && v.key) || data.results.find(v => v.site === "YouTube" && v.key);
    currentTrailerKey = trailer ? trailer.key : "";
  } catch (error) {
    console.error("Error fetching trailer:", error.message);
    currentTrailerKey = "";
  }
}

function playTrailer() {
  if (currentTrailerKey) {
    const iframe = document.getElementById("trailer-iframe");
    const modal = document.getElementById("trailer-modal");
    if (iframe && modal) {
      iframe.src = `https://www.youtube.com/embed/${currentTrailerKey}?autoplay=1&modestbranding=1&rel=0&vq=hd720`;
      modal.showModal();
    }
  } else {
    showNotification("No trailer available for this item.", "info");
  }
}

function closeTrailerModal() {
  const iframe = document.getElementById("trailer-iframe");
  const modal = document.getElementById("trailer-modal");
  if (iframe) iframe.src = "";
  if (modal && modal.hasAttribute('open')) modal.close();
}

async function showDetails(itemData, type) {
  const modal = document.getElementById("details-modal");
  if (!modal) return;
  
  const title = itemData.title || itemData.name || "No Title";
  document.getElementById("details-title").textContent = title;
  document.getElementById("details-poster").src = itemData.poster_path ? `${IMAGE_BASE_URL}${itemData.poster_path}` : "https://via.placeholder.com/300x450?text=No+Poster";
  document.getElementById("details-poster").alt = `${title} Poster`;
  document.getElementById("details-overview").textContent = itemData.overview || "No overview available.";
  document.getElementById("details-rating").textContent = (itemData.vote_average ? itemData.vote_average.toFixed(1) : "N/A") + "/10";
  document.getElementById("details-release").textContent = itemData.release_date || itemData.first_air_date || "Unknown";

  let itemTypeForApiCall = itemData.media_type || type;
  
  if (itemData.id && itemTypeForApiCall) {
    await fetchTrailer(itemData.id, itemTypeForApiCall);
  } else {
    currentTrailerKey = "";
  }
  document.getElementById("trailer-button").style.display = currentTrailerKey ? "inline-block" : "none";
  modal.showModal();
}

function addToWatchLater(itemData, type) {
  const itemType = itemData.media_type || type || (itemData.title ? 'movie' : 'tv');
  const title = itemData.title || itemData.name || "Untitled";
  if (!watchLaterList.some(item => item.id === itemData.id)) {
    watchLaterList.push({
      id: itemData.id,
      title: title,
      imdb_id: itemData.imdb_id || null,
      poster_path: itemData.poster_path,
      type: itemType,
      rating: itemData.vote_average,
      overview: itemData.overview,
      release_date: itemData.release_date || itemData.first_air_date,
      addedDate: new Date().toISOString(),
    });
    localStorage.setItem("watchLater", JSON.stringify(watchLaterList));
    showNotification(`${title} added to Watch Later!`, "success");
  } else {
    showNotification(`${title} is already in Watch Later.`, "info");
  }
}

function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  fetchMovies("movie/now_playing", "new-movies", "movie");
  fetchMovies("tv/on_the_air", "new-series", "tv");
  fetchMovies("movie/popular", "popular-movies", "movie");
  fetchMovies("tv/popular", "popular-series", "tv");
  setupSearchBar();

  const themeToggle = document.querySelector(".theme-toggle");
  if(themeToggle) {
    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark-theme");
        const isDark = document.body.classList.contains("dark-theme");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        themeToggle.innerHTML = `<i class="fas fa-${isDark ? "sun" : "moon"}"></i>`;
    });
    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark-theme");
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
  }

  const helpButton = document.querySelector(".help-button");
  if(helpButton) helpButton.addEventListener('click', () => document.getElementById('tutorial-modal').showModal());
});