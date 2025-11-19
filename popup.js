class PopupManager {
  constructor() {
    this.currentData = null;
    this.isLoading = false;
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.loadBandData();
      this.setupEventListeners();
    });
  }

  setupEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.loadBandData(true);
    });
  }

  async loadBandData(forceRefresh = false) {
    if (this.isLoading) return;

    this.showLoading();
    this.isLoading = true;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab.url.includes('metal-archives.com')) {
        this.showError('Откройте страницу группы на metal-archives.com');
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "getBandData",
        forceRefresh: forceRefresh
      });

      if (response && response.data) {
        this.currentData = response;
        this.displayBandData(response.data, response.fromCache, response.cacheTime);

        // Если есть альбомы, загружаем их детали
        if (response.data.albums && response.data.albums.length > 0) {
          await this.loadAlbumDetails(response.data.albums, forceRefresh);
        }
      } else {
        this.showError('Не удалось загрузить данные с страницы');
      }

    } catch (error) {
      console.error('Error:', error);
      this.showError('Ошибка загрузки данных. Обновите страницу.');
    } finally {
      this.isLoading = false;
    }
  }

  async loadAlbumDetails(albums, forceRefresh = false) {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      const albumUrls = albums.map(album => album.url).filter(url => url);

      if (albumUrls.length > 0) {
        this.updateStatus('Загружаем детали альбомов...');

        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "getAlbumDetails",
          albumUrls: albumUrls,
          forceRefresh: forceRefresh
        });

        if (response && response.albums) {
          this.displayAlbumDetails(response.albums, response.fromCache);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки альбомов:', error);
    }
  }

  showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('content').style.display = 'none';
  }

  hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
  }

  updateStatus(message) {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
      const statusElement = loadingDiv.querySelector('.status') ||
        loadingDiv.appendChild(document.createElement('div'));
      statusElement.className = 'status';
      statusElement.textContent = message;
      statusElement.style.marginTop = '10px';
      statusElement.style.fontSize = '12px';
      statusElement.style.color = '#888';
    }
  }

  showError(message) {
    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = `<div class="error">${message}</div>`;
    this.hideLoading();
  }

  displayBandData(data, fromCache = false, cacheTime = null) {
    const contentDiv = document.getElementById('content');

    let html = `
      <div class="band-info">
        <strong>🎸 Группа:</strong> ${data.name}
      </div>
      <div class="band-info">
        <strong>🌍 Страна:</strong> ${data.country.join(', ')}
      </div>
      <div class="band-info">
        <strong>🏘️ Город:</strong> ${data.city}
      </div>
      <div class="band-info">
        <strong>🎵 Жанр:</strong> ${data.genre}
      </div>
      <div class="band-info">
        <strong>📊 Статус:</strong> ${data.status}
      </div>
      <div class="band-info">
        <strong>📖 Темы:</strong> ${data.themes.join(', ')}
      </div>
    `;

    if (fromCache && cacheTime) {
      const cacheDate = new Date(cacheTime).toLocaleTimeString();
      html += `<div class="cache-info">🕒 Данные из кэша (обновлено: ${cacheDate})</div>`;
    }

    if (data.albums && data.albums.length > 0) {
      html += `
        <div id="albumDetails"></div>
      `;
    }

    contentDiv.innerHTML = html;
    this.hideLoading();
  }

  displayAlbumDetails(albums, fromCache = false) {
    const detailsDiv = document.getElementById('albumDetails');
    if (!detailsDiv) return;

    let html = `<div class="band-info" style="margin-top: 15px;">
      <strong>🎵 Детали альбомов:</strong>
      ${fromCache ? ' <span class="cache-info">(из кэша)</span>' : ''}
    </div>`;

    albums.forEach(album => {
      if (album && album.tracks && album.tracks.length > 0) {
        html += `
          <div class="album-item">
            <strong>${album.title}</strong> (${album.releaseDate})<br>
            <small>Треков: ${album.tracks.length}</small>
            <small>Тип: ${album.type}</small>
            <div style="font-size: 11px; margin-top: 5px;">
              ${album.tracks.map(track =>
          `▸ ${track.number} ${track.title} (${track.duration})`
        ).join('<br>')}
            </div>
          </div>
        `;
      }
    });

    detailsDiv.innerHTML = html;
  }
}

// Инициализация
new PopupManager();
