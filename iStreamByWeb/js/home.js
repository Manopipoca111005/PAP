const API_KEY = "f0609e6638ef2bc5b31313a712e7a8a4";
const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

let watchLaterList = JSON.parse(localStorage.getItem("watchLater")) || [];
let currentTrailerKey = "";

function playMovie(imdbId, type, title, poster) {
    if (!imdbId) {
        showNotification("Não é possível reproduzir: ID do IMDb está faltando.", "error");
        return;
    }
    const playerUrl = `player.html?imdbId=${imdbId}&type=${type}&title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}`;
    window.open(playerUrl, '_blank');
}

async function fetchMovies(endpoint, containerId, type) {
  const container = document.getElementById(containerId);
  const spinner = document.getElementById(`${containerId}-spinner`);
  if (!container || !spinner) {
    console.error(`Container or spinner not found for ${containerId}`);
    return;
  }
  try {
    spinner.classList.add("active");
    const response = await fetch(
      `${BASE_URL}/${endpoint}?api_key=${API_KEY}&language=en-US&include_adult=false`
    );
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TMDB fetch error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    
    container.innerHTML = "";
    if (!data.results || data.results.length === 0) {
        container.innerHTML = "<p>No results found.</p>";
        spinner.classList.remove("active");
        return;
    }

    for (const [index, itemData] of data.results.entries()) {
      const itemTypeForAPI = itemData.media_type || type || (itemData.title ? 'movie' : 'tv');
      let imdbId = "";
      try {
        if (itemData.id) {
            const externalIdsResponse = await fetch(
              `${BASE_URL}/${itemTypeForAPI}/${itemData.id}/external_ids?api_key=${API_KEY}`
            );
            if (externalIdsResponse.ok) {
              const externalIds = await externalIdsResponse.json();
              imdbId = externalIds.imdb_id || "";
            } else {
              console.warn(`Could not fetch external IDs for ${itemData.title || itemData.name} (type: ${itemTypeForAPI}, id: ${itemData.id}) - Status: ${externalIdsResponse.status}`);
            }
        } else {
            console.warn("Item has no ID, cannot fetch external_ids:", itemData);
        }
      } catch (e) {
          console.warn(`Error fetching external IDs for ${itemData.title || itemData.name}: ${e.message}`);
      }

      const card = document.createElement("div");
      const poster = itemData.poster_path
        ? `${IMAGE_BASE_URL}${itemData.poster_path}`
        : "https://via.placeholder.com/200x280?text=No+Poster";
      const titleText = itemData.title || itemData.name || "Untitled";

      card.classList.add("carousel-item");
      card.style = `--i: ${index + 1};`;
      card.innerHTML = `
          <img src="${poster}" alt="${titleText} Poster">
          <div class="carousel-item-overlay">
              <button onclick='playMovie("${imdbId}", "${itemTypeForAPI}", "${encodeURIComponent(titleText)}", "${encodeURIComponent(poster)}")'>Play</button>
              <button onclick='showDetails(${JSON.stringify(itemData).replace(/'/g, "'")}, "${itemTypeForAPI}")'>View Details</button>
              <button onclick='addToWatchLater(${JSON.stringify(itemData).replace(/'/g, "'")}, "${itemTypeForAPI}")'>Add to Watch Later</button>
          </div>
          <div class="carousel-item-content">
              <h3>${titleText}</h3>
              <p>Rating: ${itemData.vote_average ? itemData.vote_average.toFixed(1) : "N/A"}/10</p>
          </div>`;
      container.appendChild(card);
    }
    spinner.classList.remove("active");
  } catch (error) {
    console.error(`Error loading content for ${containerId}:`, error.message, error.stack);
    showNotification(`Failed to load ${containerId.replace(/-/g, ' ')}: ${error.message}`, "error");
    if(container) container.innerHTML = `<p class="error-message">Could not load content. Please try again later.</p>`;
    if(spinner) spinner.classList.remove("active");
  }
}

function scrollCarousel(containerId, scrollAmount) {
  const container = document.getElementById(containerId);
  if (container) {
    container.scrollBy({ left: scrollAmount, behavior: "smooth" });
  }
}

async function fetchTrailer(id, typeForAPI) {
  try {
    const response = await fetch(
      `${BASE_URL}/${typeForAPI}/${id}/videos?api_key=${API_KEY}&language=en-US`
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to fetch videos: ${errorData.status_message || response.statusText}`);
    }
    const data = await response.json();
    const trailer = data.results.find(
      (video) => video.type === "Trailer" && video.site === "YouTube" && video.key
    );
    currentTrailerKey = trailer ? trailer.key : "";
    if (!currentTrailerKey && data.results.length > 0) {
        const fallbackTrailer = data.results.find(video => video.site === "YouTube" && video.key);
        currentTrailerKey = fallbackTrailer ? fallbackTrailer.key : "";
        if(currentTrailerKey) console.log("Using fallback YouTube video as trailer key.");
    }

  } catch (error) {
    console.error("Error fetching trailer for ID", id, "Type", typeForAPI, ":", error.message);
    currentTrailerKey = "";
    showNotification("Could not fetch trailer information.", "error");
  }
}

function playTrailer() {
  if (currentTrailerKey) {
    const iframe = document.getElementById("trailer-iframe");
    const modal = document.getElementById("trailer-modal");
    if (iframe && modal) {
      iframe.src = `https://www.youtube.com/embed/${currentTrailerKey}?autoplay=1&modestbranding=1&rel=0&vq=hd720`;
      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        console.error("Trailer modal does not have showModal method");
        showNotification("Could not display trailer.", "error");
      }
    } else {
      console.error("Trailer iframe or modal element not found.");
      showNotification("Trailer player components not found.", "error");
    }
  } else {
    showNotification("No trailer available for this item.", "info");
  }
}

function closeTrailerModal() {
  const iframe = document.getElementById("trailer-iframe");
  const modal = document.getElementById("trailer-modal");
  if (iframe) iframe.src = "";
  if (modal && typeof modal.close === 'function' && modal.hasAttribute('open')) {
    modal.close();
  }
}

async function showDetails(itemData, type) {
  const modal = document.getElementById("details-modal");
  if (!modal) {
      console.error("Details modal element not found!");
      return;
  }
  const title = itemData.title || itemData.name || "No Title";
  document.getElementById("details-title").textContent = title;
  document.getElementById("details-poster").src = itemData.poster_path
    ? `${IMAGE_BASE_URL}${itemData.poster_path}`
    : "https://via.placeholder.com/300x450?text=No+Poster";
  document.getElementById("details-poster").alt = `${title} Poster`;
  document.getElementById("details-overview").textContent = itemData.overview || "No overview available.";
  document.getElementById("details-rating").textContent = (itemData.vote_average ? itemData.vote_average.toFixed(1) : "N/A") + "/10";
  document.getElementById("details-release").textContent = itemData.release_date || itemData.first_air_date || "Unknown";

  let itemTypeForApiCall = type;
  if (type === 'series' || itemData.media_type === 'tv') {
      itemTypeForApiCall = 'tv';
  } else if (itemData.media_type === 'movie') {
      itemTypeForApiCall = 'movie';
  }
  
  if (itemData.id && itemTypeForApiCall) {
    await fetchTrailer(itemData.id, itemTypeForApiCall);
  } else {
      console.warn("Missing ID or valid type for fetching trailer in showDetails:", itemData, type);
      currentTrailerKey = "";
  }

  const trailerButton = document.getElementById("trailer-button");
  if (trailerButton) {
    trailerButton.style.display = currentTrailerKey ? "inline-block" : "none";
  }

  if (typeof modal.showModal === 'function') {
    modal.showModal();
  } else {
    console.error("Details modal does not have showModal method");
  }
}

function addToWatchLater(itemData, type) {
  const itemType = itemData.media_type || type || (itemData.title ? 'movie' : 'tv');
  const title = itemData.title || itemData.name || "Untitled";
  const watchLaterItem = {
    id: itemData.id,
    title: title,
    imdb_id: itemData.imdb_id || null,
    poster_path: itemData.poster_path,
    type: itemType,
    rating: itemData.vote_average,
    overview: itemData.overview,
    release_date: itemData.release_date || itemData.first_air_date,
    addedDate: new Date().toISOString(),
  };
  if (!watchLaterList.some((existing) => existing.id === itemData.id && existing.type === itemType)) {
    watchLaterList.push(watchLaterItem);
    localStorage.setItem("watchLater", JSON.stringify(watchLaterList));
    if (document.getElementById("watch-later-grid")) {
      renderWatchLater();
    }
    showNotification(`${title} added to Watch Later!`, "success");
  } else {
    showNotification(`${title} is already in Watch Later.`, "info");
  }
}

async function renderWatchLater() {
  const grid = document.getElementById("watch-later-grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (watchLaterList.length === 0) {
    grid.innerHTML = "<p>Your Watch Later list is empty.</p>";
    return;
  }

  for (const [index, item] of watchLaterList.entries()) {
    let imdbId = item.imdb_id || "";
    if (!imdbId && item.id && item.type) {
        try {
            const externalIdsResponse = await fetch(`${BASE_URL}/${item.type}/${item.id}/external_ids?api_key=${API_KEY}`);
            if (externalIdsResponse.ok) {
                const externalIdsData = await externalIdsResponse.json();
                imdbId = externalIdsData.imdb_id || "";
                item.imdb_id = imdbId;
            }
        } catch (e) { console.warn("Could not fetch imdb_id for watch later item:", item.title, e); }
    }

    const card = document.createElement("div");
    card.classList.add("watch-later-card");
    card.style = `--i: ${index + 1};`;
    const poster = item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : "https://via.placeholder.com/200x280?text=No+Poster";
    const titleText = item.title || item.name || "Untitled";
    card.innerHTML = `
        <img src="${poster}" alt="${titleText} Poster">
        <div class="watch-later-card-overlay">
            <button onclick='playMovie("${imdbId}", "${item.type}", "${encodeURIComponent(titleText)}", "${encodeURIComponent(poster)}")'>Play</button>
            <button onclick='showDetails(${JSON.stringify(item).replace(/'/g, "'")}, "${item.type}")'>View Details</button>
            <button onclick="removeFromWatchLater(${item.id}, '${item.type}')">Remove</button>
        </div>
        <div class="watch-later-card-content">
            <h3>${titleText}</h3>
            <p>Rating: ${item.rating ? item.rating.toFixed(1) : "N/A"}/10</p>
        </div>`;
    grid.appendChild(card);
  }
}

function removeFromWatchLater(id, type) {
  const initialLength = watchLaterList.length;
  watchLaterList = watchLaterList.filter(
    (item) => !(item.id === id && item.type === type)
  );
  if (watchLaterList.length < initialLength) {
    localStorage.setItem("watchLater", JSON.stringify(watchLaterList));
    if (document.getElementById("watch-later-grid")) {
      renderWatchLater();
    }
    showNotification("Removed from Watch Later!", "success");
  }
}

function sortWatchLater(criteria) {
  if (criteria === "title") {
    watchLaterList.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  } else if (criteria === "addedDate") {
    watchLaterList.sort(
      (a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0)
    );
  } else if (criteria === "rating") {
    watchLaterList.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }
  if (document.getElementById("watch-later-grid")) {
    renderWatchLater();
  }
  showNotification(`Watch Later sorted by ${criteria}!`, "success");
}

async function filterWatchLater(typeToFilter) {
  const grid = document.getElementById("watch-later-grid");
  if (!grid) return;

  let filteredList = watchLaterList;
  if (typeToFilter !== "all") {
    filteredList = watchLaterList.filter((item) => item.type === typeToFilter);
  }
  grid.innerHTML = "";

  if (filteredList.length === 0) {
    grid.innerHTML = `<p>No items match your filter "${typeToFilter}".</p>`;
    return;
  }

  for (const [index, item] of filteredList.entries()) {
     let imdbId = item.imdb_id || "";
     if (!imdbId && item.id && item.type) {
        try {
            const externalIdsResponse = await fetch(`${BASE_URL}/${item.type}/${item.id}/external_ids?api_key=${API_KEY}`);
            if (externalIdsResponse.ok) {
                const externalIdsData = await externalIdsResponse.json();
                imdbId = externalIdsData.imdb_id || "";
            }
        } catch (e) { console.warn("Could not fetch imdb_id for watch later item:", item.title, e); }
    }
    const card = document.createElement("div");
    card.classList.add("watch-later-card");
    card.style = `--i: ${index + 1};`;
    const poster = item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : "https://via.placeholder.com/200x280?text=No+Poster";
    const titleText = item.title || item.name || "Untitled";
    card.innerHTML = `
        <img src="${poster}" alt="${titleText} Poster">
        <div class="watch-later-card-overlay">
            <button onclick='playMovie("${imdbId}", "${item.type}", "${encodeURIComponent(titleText)}", "${encodeURIComponent(poster)}")'>Play</button>
            <button onclick='showDetails(${JSON.stringify(item).replace(/'/g, "'")}, "${item.type}")'>View Details</button>
            <button onclick="removeFromWatchLater(${item.id}, '${item.type}')">Remove</button>
        </div>
        <div class="watch-later-card-content">
            <h3>${titleText}</h3>
            <p>Rating: ${item.rating ? item.rating.toFixed(1) : "N/A"}/10</p>
        </div>`;
    grid.appendChild(card);
  }
  showNotification(`Watch Later filtered by ${typeToFilter}!`, "success");
}

const themeToggle = document.querySelector(".theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    const isDark = document.body.classList.contains("dark-theme");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    themeToggle.innerHTML = `<i class="fas fa-${isDark ? "sun" : "moon"}"></i>`;
    showNotification(`Theme switched to ${isDark ? "Dark" : "Light"}.`, "success");
  });
}

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-theme");
  if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

const hamburger = document.querySelector(".hamburger");
const sidebar = document.querySelector(".sidebar");
if (hamburger && sidebar) {
  hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("active");
  });
}

const userProfile = document.querySelector(".user-profile .fa-user-circle");
const profileDropdown = document.querySelector(".profile-dropdown");
if (userProfile && profileDropdown) {
  userProfile.addEventListener("click", (event) => {
    event.stopPropagation();
    profileDropdown.classList.toggle("active");
  });
  document.addEventListener('click', (event) => {
      if (profileDropdown && profileDropdown.classList.contains('active') &&
          !userProfile.contains(event.target) && !profileDropdown.contains(event.target)) {
          profileDropdown.classList.remove('active');
      }
  });
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.addEventListener("scroll", () => {
  const backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    if (window.scrollY > 300) { backToTop.classList.add("active"); }
    else { backToTop.classList.remove("active"); }
  }
});

function showTutorial() {
  const tutorialModal = document.getElementById("tutorial-modal");
  if (tutorialModal && typeof tutorialModal.showModal === 'function') {
    tutorialModal.showModal();
  }
}
function closeTutorial() {
  const tutorialModal = document.getElementById("tutorial-modal");
  if (tutorialModal && typeof tutorialModal.close === 'function' && tutorialModal.hasAttribute('open')) {
    tutorialModal.close();
  }
}
const helpButton = document.querySelector(".help-button");
if (helpButton) {
  helpButton.addEventListener("click", showTutorial);
}

function toggleDropdown(button) {
  const dropdown = button.nextElementSibling;
  if (!dropdown || !dropdown.classList.contains('dropdown-menu')) return;
  const isOpen = dropdown.classList.contains("active");
  document.querySelectorAll(".filter-bar .dropdown-menu.active").forEach((menu) => {
    if (menu !== dropdown) menu.classList.remove("active");
  });
  if (!isOpen) {
    dropdown.classList.add("active");
  }
}

function showNotification(message, type) {
  const notificationArea = document.body;
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notificationArea.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'fadeOutNotification 0.5s forwards';
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

const carousels = document.querySelectorAll(".carousel");
carousels.forEach((carousel) => {
  let isDragging = false, startX, scrollLeft, autoScrollInterval;
  function startAutoScroll() {
    stopAutoScroll();
    if (carousel.children.length === 0 || Array.from(carousel.children).every(child => child.classList.contains('skeleton-card'))) {
      return;
    }
    autoScrollInterval = setInterval(() => {
      if (!carousel.matches(':hover') && !isDragging) {
        if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 1) {
          carousel.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          carousel.scrollBy({ left: 200, behavior: "smooth" });
        }
      }
    }, 4000);
  }
  function stopAutoScroll() {
    clearInterval(autoScrollInterval);
  }
  setTimeout(startAutoScroll, 1000);

  carousel.addEventListener("mouseenter", stopAutoScroll);
  carousel.addEventListener("mouseleave", () => { if (!isDragging) startAutoScroll();});
  carousel.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.pageX - carousel.offsetLeft;
    scrollLeft = carousel.scrollLeft;
    stopAutoScroll();
    carousel.classList.add('dragging');
  });
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      carousel.classList.remove('dragging');
      if (!carousel.matches(':hover')) { startAutoScroll(); }
    }
  });
  carousel.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - carousel.offsetLeft;
    const walk = (x - startX) * 2;
    carousel.scrollLeft = scrollLeft - walk;
  });
  carousel.addEventListener("touchstart", (e) => {
    isDragging = true;
    startX = e.touches[0].pageX - carousel.offsetLeft;
    scrollLeft = carousel.scrollLeft;
    stopAutoScroll();
  }, { passive: true });
  carousel.addEventListener("touchend", () => {
    if (isDragging) { isDragging = false; startAutoScroll(); }
  });
  carousel.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    const x = e.touches[0].pageX - carousel.offsetLeft;
    const walk = (x - startX) * 2;
    carousel.scrollLeft = scrollLeft - walk;
  }, { passive: true });
});

document.addEventListener('DOMContentLoaded', () => {
  fetchMovies("movie/now_playing", "new-movies", "movie");
  fetchMovies("tv/on_the_air", "new-series", "tv");
  fetchMovies("movie/popular", "popular-movies", "movie");
  fetchMovies("tv/popular", "popular-series", "tv");

  const continueWatchingData = JSON.parse(localStorage.getItem('continueWatching')) || [];
  const continueWatchingContainer = document.getElementById("continue-watching");
  const continueSpinner = document.getElementById("continue-watching-spinner");

  if (continueWatchingContainer && continueSpinner) {
    continueSpinner.classList.add("active");
    (async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            continueWatchingContainer.innerHTML = "";
            if (continueWatchingData.length === 0) {
                continueWatchingContainer.innerHTML = "<p>No items to continue watching.</p>";
            } else {
                for (const [index, item] of continueWatchingData.entries()) {
                    const itemType = item.media_type || (item.title ? 'movie' : 'tv');
                    let imdbId = item.imdb_id || "";
                    if (!imdbId && item.id && itemType) {
                        try {
                            const externalIdsResponse = await fetch(`${BASE_URL}/${itemType}/${item.id}/external_ids?api_key=${API_KEY}`);
                            if (externalIdsResponse.ok) {
                                const externalIds = await externalIdsResponse.json();
                                imdbId = externalIds.imdb_id || "";
                            }
                        } catch (e) { console.warn(`Could not fetch imdb_id for CW item: ${item.title || item.name}`, e); }
                    }
                    const card = document.createElement("div");
                    card.classList.add("carousel-item");
                    card.style = `--i: ${index + 1};`;
                    const poster = item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : "https://via.placeholder.com/200x280?text=No+Poster";
                    const titleText = item.title || item.name || "Untitled";
                    card.innerHTML = `
                        <img src="${poster}" alt="${titleText} Poster">
                        <div class="carousel-item-overlay">
                            <button onclick='playMovie("${imdbId}", "${itemType}", "${encodeURIComponent(titleText)}", "${encodeURIComponent(poster)}")'>Play</button>
                            <button onclick='showDetails(${JSON.stringify(item).replace(/'/g, "'")}, "${itemType}")'>View Details</button>
                            <button onclick='addToWatchLater(${JSON.stringify(item).replace(/'/g, "'")}, "${itemType}")'>Add to Watch Later</button>
                        </div>
                        <div class="carousel-item-content">
                            <h3>${titleText}</h3>
                            <p>Rating: ${item.vote_average ? item.vote_average.toFixed(1) : "N/A"}/10</p>
                        </div>`;
                    continueWatchingContainer.appendChild(card);
                }
            }
        } catch (error) {
            console.error("Error processing continue watching data:", error);
            if(continueWatchingContainer) continueWatchingContainer.innerHTML = "<p>Error loading continue watching.</p>";
        } finally {
            if(continueSpinner) continueSpinner.classList.remove("active");
        }
    })();
  } else {
    console.warn("Continue watching container or spinner not found.");
  }

  if (document.getElementById("watch-later-grid")) {
    renderWatchLater();
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      const openModals = document.querySelectorAll('dialog[open]');
      if (openModals.length > 0) {
        const topModal = openModals[openModals.length - 1];
        if (topModal.id === 'trailer-modal' && typeof closeTrailerModal === 'function') closeTrailerModal();
        else if (topModal.id === 'tutorial-modal' && typeof closeTutorial === 'function') closeTutorial();
        else if (topModal.id === 'details-modal' && typeof topModal.close === 'function') topModal.close();
      }
      const activeDropdowns = document.querySelectorAll('.profile-dropdown.active, .filter-bar .dropdown-menu.active');
      activeDropdowns.forEach(dropdown => dropdown.classList.remove('active'));
    }
  });

  const allDialogs = document.querySelectorAll('dialog');
  allDialogs.forEach(dialog => {
    if (dialog.hasAttribute('open') && typeof dialog.close === 'function') {
        console.warn(`Dialog #${dialog.id} was found open on DOMContentLoaded. Forcing close.`);
        dialog.close();
    }
  });
});

const welcomeTrailerShown = localStorage.getItem('welcomeTrailerShown');
if (!welcomeTrailerShown) {
    const trailerModal = document.getElementById('trailer-modal');
    const trailerIframe = document.getElementById('trailer-iframe');

    if (trailerModal && trailerIframe) {
        trailerIframe.src = "https://www.youtube.com/embed/0";
        if (typeof trailerModal.showModal === 'function') {
            trailerModal.showModal();
        } else {
            trailerModal.style.display = 'flex';
        }
        localStorage.setItem('welcomeTrailerShown', 'true');
    }
}

const trailerShown = sessionStorage.getItem('trailerShown');
if (!trailerShown) {
    const trailerModal = document.getElementById("trailer-modal-welcome");
    const trailerIframe = document.getElementById("trailer-iframe-welcome");

    if (trailerModal && trailerIframe) {
        trailerIframe.src = "https://www.youtube.com/embed/1";
        if (typeof trailerModal.showModal === 'function') {
            trailerModal.showModal();
        } else {
            trailerModal.style.display = 'block';
        }
        sessionStorage.setItem('trailerShown', 'true');
    }
}