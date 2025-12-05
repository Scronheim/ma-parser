class MetalArchivesParser {
  constructor() {
    this.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  }

  // Основной парсинг данных группы
  parseBandData() {
    const data = {
      name: '',
      country: [''],
      city: '',
      genre: '',
      status: '',
      formedYear: 0,
      yearsActive: '',
      themes: [],
      albums: [],
      label: '',
      lastUpdated: new Date().toISOString()
    };

    try {
      // Основная информация
      data.name = document.querySelector('.band_name a')?.textContent?.trim() || 'Не найдено';
      data.country[0] = countriesMap[document.querySelector("#band_stats > dl.float_left > dd:nth-child(2) > a")?.textContent?.trim()] || 'Не найдено';
      data.city = document.querySelector("#band_stats > dl.float_left > dd:nth-child(4)")?.textContent?.trim() || 'Не найдено';
      data.genre = document.querySelector("#band_stats > dl.float_right > dd:nth-child(2)")?.textContent?.trim() || 'Не найдено';
      data.status = document.querySelector("#band_stats > dl.float_left > dd:nth-child(6)")?.textContent?.trim().toLowerCase() || 'Не найдено';
      data.formedYear = parseInt(document.querySelector("#band_stats > dl.float_left > dd:nth-child(8)")?.textContent?.trim()) || 'Не найдено';
      data.yearsActive = document.querySelector("#band_stats > dl.clear > dd")?.innerText?.trim() || 'Не найдено';
      data.themes = document.querySelector("#band_stats > dl.float_right > dd:nth-child(4)")?.textContent?.trim().split(', ') || 'Не найдено';
      data.label = document.querySelector("#band_stats > dl.float_right > dd:nth-child(6)")?.textContent?.trim() || 'Не найдено';

      // Парсинг альбомов
      let albumRows = document.querySelectorAll("#ui-tabs-3 > table > tbody > tr")
      if (!albumRows.length) albumRows = document.querySelectorAll("#ui-tabs-4 > table > tbody > tr")
      if (!albumRows.length) albumRows = document.querySelectorAll("#ui-tabs-5 > table > tbody > tr")
      data.albums = Array.from(albumRows).map(row => {
        const cells = row.querySelectorAll('td');
        const albumLink = cells[0]?.querySelector('a');

        return {
          name: albumLink?.textContent?.trim() || 'Неизвестно',
          url: albumLink?.href || '',
          year: cells[2]?.textContent?.trim() || 'Неизвестно',
          type: cells[1]?.textContent?.trim() || 'Неизвестно',
        };
      });

    } catch (error) {
      console.error('Ошибка парсинга группы:', error);
    }

    return data;
  }

  // Парсинг деталей альбома (с задержкой)
  async parseAlbumDetails(albumUrl) {
    try {
      // Имитируем задержку для избежания блокировки
      await this.delay(500 + Math.random() * 1000);

      const response = await fetch(albumUrl);
      const html = await response.text();
      const parser = new DOMParser();
      const document = parser.parseFromString(html, 'text/html');

      const albumData = {
        title: document.querySelector("#album_info > h1 > a")?.textContent?.trim() || '',
        groups: [document.querySelector("#album_info > h2 > a")?.textContent?.trim() || ''],
        type: document.querySelector("#album_info > dl.float_left > dd:nth-child(2)")?.textContent?.trim().toLowerCase() || '',
        releaseDate: formatDate(document.querySelector("#album_info > dl.float_left > dd:nth-child(4)")?.textContent?.trim()) || '',
        tracks: []
      };

      // Парсинг треков
      const trackRows = document.querySelectorAll("#album_tabs_tracklist > div.ui-tabs-panel-content.block_spacer_top_20 > table > tbody > tr")
      trackRows.forEach(row => {
        const cells = row.querySelectorAll('td')
        if (cells.length > 3) {
          albumData.tracks.push({
            number: parseInt(cells[0]?.innerText?.trim()) || 1,
            title: cells[1]?.innerText.trim() || '',
            discNumber: 1,
            duration: cells[2]?.innerText?.trim() ? `00:${cells[2]?.innerText?.trim()}` : '00:00:01',
            lyrics: ''
          });
        }
      });

      return albumData;
    } catch (error) {
      console.error('Ошибка парсинга альбома:', error, albumUrl);
      return null;
    }
  }

  // Парсинг нескольких альбомов с задержками
  async parseMultipleAlbums(albums, maxConcurrent = 2) {
    const results = [];

    // Обрабатываем альбомы батчами для контроля нагрузки
    for (let i = 0; i < albums.length; i += maxConcurrent) {
      const batch = albums.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(album => this.parseAlbumDetails(album.url));

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null));

      // Задержка между батчами
      if (i + maxConcurrent < albums.length) {
        await this.delay(1000);
      }
    }

    return results;
  }
}

const parser = new MetalArchivesParser();

// Обработчик сообщений с кэшированием
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getBandData") {
    handleBandDataRequest(request, sendResponse);
    return true;
  }

  if (request.action === "getAlbumDetails") {
    handleAlbumDataRequest(request, sendResponse);
    return true;
  }
});

let group = {}
let albums = []

async function handleBandDataRequest(request, sendResponse) {
  const cacheKey = `band_${btoa(window.location.href)}`;

  // Проверяем кэш
  const cached = await chrome.storage.local.get([cacheKey]);
  if (cached[cacheKey] && !request.forceRefresh) {
    sendResponse({
      data: cached[cacheKey].data,
      fromCache: true,
      cacheTime: cached[cacheKey].timestamp
    });
    return;
  }

  // Парсим новые данные
  const data = parser.parseBandData();
  group = data
  const genres = await getGenres()
  const groupGenres = group.genre.split('/').map(g => {
    return genresMap[g] || genres.find(genre => genre.name === g)
  }).filter(Boolean)

  group.genres = groupGenres
  const response = await fetch('https://metal-archives.ru/api/group', {
    headers: {
      "Content-Type": "application/json",
      Authorization: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZmIxNzNlNmNiM2FkNjhjODg3YmQ0ZCIsInVzZXJuYW1lIjoiU2Nyb25oZWltIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzYyODc4ODk2LCJleHAiOjE3NjU0NzA4OTZ9.bAH7ADIjT9zzBf_yhKQoh37z9Q0x0OwBe6N0xrbkp1Q'
    },
    method: 'POST',
    body: JSON.stringify(group)
  })

  group = { ...group, ...await response.json() }

  // Сохраняем в кэш
  await chrome.storage.local.set({
    [cacheKey]: {
      data: data,
      timestamp: Date.now()
    }
  });

  sendResponse({
    data: data,
    fromCache: false,
    cacheTime: Date.now()
  });
}

async function handleAlbumDataRequest(request, sendResponse) {
  const cacheKey = `albums_${btoa(request.albumUrls.join(','))}`;

  // Проверяем кэш
  const cached = await chrome.storage.local.get([cacheKey]);
  if (cached[cacheKey] && !request.forceRefresh) {
    sendResponse({
      albums: cached[cacheKey].data,
      fromCache: true
    });
    return;
  }

  // Парсим новые данные с задержками
  const albumData = await parser.parseMultipleAlbums(
    request.albumUrls.map(url => ({ url })),
    2
  );
  albums = albumData
  albums.forEach(async (album) => {
    album.groups = [group._id]
    album.genres = group.genres
    await fetch('https://metal-archives.ru/api/album', {
      headers: {
        "Content-Type": "application/json",
        Authorization: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZmIxNzNlNmNiM2FkNjhjODg3YmQ0ZCIsInVzZXJuYW1lIjoiU2Nyb25oZWltIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzYyODc4ODk2LCJleHAiOjE3NjU0NzA4OTZ9.bAH7ADIjT9zzBf_yhKQoh37z9Q0x0OwBe6N0xrbkp1Q'
      },
      method: 'POST',
      body: JSON.stringify(album)
    })
  })

  console.log('group', group, 'albums', albums);
  // Сохраняем в кэш
  await chrome.storage.local.set({
    [cacheKey]: {
      data: albumData,
      timestamp: Date.now()
    }
  });

  sendResponse({
    albums: albumData,
    fromCache: false
  });
}

async function getGenres() {
  const response = await fetch('https://metal-archives.ru/api/genre')
  return await response.json()
}

function formatDate(dateStr, format = 'YYYY-MM-DD') {
  if (!dateStr) return ''

  // Убираем суффиксы "st", "nd", "rd", "th" (20th → 20)
  const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1')

  // Парсим дату в объект Date
  const date = new Date(cleaned)

  if (isNaN(date)) return ''

  // Форматируем в зависимости от нужного формата
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  switch (format) {
    case 'DD.MM.YYYY':
      return `${day}.${month}.${year}`
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`
    case 'YYYY-MM-DD':
    default:
      return `${year}-${month}-${day}`
  }
}


const countriesMap = {
  Türkiye: 'Турция',
  Germany: 'Германия',
  Norway: 'Норвегия',
  Finland: 'Финляндия',
  Thailand: 'Тайланд',
  Canada: 'Канада',
  Mexico: 'Мексика',
  Greece: 'Греция',
  Russia: 'Россия',
  Austria: 'Австрия',
  Australia: 'Австралия',
  Sweden: 'Швеция',
  International: 'Интернациональная',
  Argentina: 'Аргентина',
  France: 'Франция',
  Poland: 'Польша',
  'South Africa': 'Южно-Африканская Республика',
  'United Kingdom': 'Соединённое Королевство',
  'United States': 'Соединённые Штаты Америки',
}
const genresMap = {
  Gothic: '68ef8d5a39489319bc90fe0e',
  Doom: '68ef8d1639489319bc90fe09',
  Black: '68ef47c639489319bc90fe03',
  Death: '68ef8d0939489319bc90fe08',
  Heavy: '69135ca0268c1ed45e97f0e2',
  Thrash: '69135799268c1ed45e97f0e0',
  Groove: '69135f42268c1ed45e97f0e3',
  Progressive: '6915c472c1b8b0e45cf43ebc',
  'Melodic Death': '68ef8d6439489319bc90fe0f',
  'Funeral Doom': '6915a9dac1b8b0e45cf43eb9',
}
