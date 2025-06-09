// Theme toggle
const themeToggle = document.querySelector('.theme-toggle');
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        themeToggle.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;
    });
}

// Load saved theme
// Ensure themeToggle is selected again or use the one from above if script execution order is guaranteed.
// For safety, re-select or check if it exists, especially if this script might run before DOMContentLoaded.
const currentThemeToggle = document.querySelector('.theme-toggle'); // Re-selecting for safety or use themeToggle if defined in the same immediate scope.
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    if (currentThemeToggle) {
        currentThemeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

// Mobile sidebar toggle
const hamburger = document.querySelector('.hamburger');
const sidebar = document.querySelector('.sidebar');
if (hamburger && sidebar) {
    hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

// Save settings
const saveSettingsButton = document.querySelector('.save-settings');
if (saveSettingsButton) {
    saveSettingsButton.addEventListener('click', () => {
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = 'Settings saved successfully!';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    });
}

// Add URL simulation
const addUrlButton = document.querySelector('.btn.add');
if (addUrlButton) {
    addUrlButton.addEventListener('click', () => {
        const spinner = document.getElementById('streaming-loading');
        if (spinner) {
            spinner.classList.add('active');
            setTimeout(() => {
                spinner.classList.remove('active');
                const notification = document.createElement('div');
                notification.className = 'notification success';
                notification.textContent = 'URL added successfully!';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }, 1500);
        }
    });
}

// Reload simulation
const reloadButton = document.querySelector('.btn.reload');
if (reloadButton) {
    reloadButton.addEventListener('click', () => {
        const spinner = document.getElementById('streaming-loading');
        if (spinner) {
            spinner.classList.add('active');
            setTimeout(() => {
                spinner.classList.remove('active');
                const notification = document.createElement('div');
                notification.className = 'notification success';
                notification.textContent = 'Connection reloaded!';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }, 1500);
        }
    });
}

// Trakt authentication simulation
const authenticateButton = document.querySelector('.authenticate-button');
if (authenticateButton) {
    authenticateButton.addEventListener('click', () => {
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner active';
        const traktSection = document.querySelector('.trakt-section');
        if (traktSection) {
            traktSection.appendChild(spinner);
            setTimeout(() => {
                spinner.remove();
                const notification = document.createElement('div');
                notification.className = 'notification success';
                notification.textContent = 'Trakt authenticated successfully!';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }, 1500);
        }
    });
}