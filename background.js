// Фоновая служба для управления кэшем
class CacheManager {
  constructor() {
    this.cacheTimeout = 30 * 60 * 1000; // 30 минут
  }

  // Генерация ключа для кэша
  generateCacheKey(url, dataType) {
    return `metal_${dataType}_${btoa(url).slice(0, 32)}`;
  }

  // Сохранение данных в кэш
  async saveToCache(key, data) {
    const cacheData = {
      data: data,
      timestamp: Date.now(),
      url: window.location.href
    };

    await chrome.storage.local.set({ [key]: cacheData });
    console.log('Данные сохранены в кэш:', key);
  }

  // Получение данных из кэша
  async getFromCache(key) {
    const result = await chrome.storage.local.get([key]);
    if (result[key]) {
      const cacheData = result[key];
      const isExpired = Date.now() - cacheData.timestamp > this.cacheTimeout;

      if (!isExpired) {
        console.log('Данные загружены из кэша:', key);
        return cacheData.data;
      } else {
        // Удаляем просроченные данные
        await chrome.storage.local.remove([key]);
      }
    }
    return null;
  }

  // Очистка всего кэша
  async clearCache() {
    const allData = await chrome.storage.local.get(null);
    const metalKeys = Object.keys(allData).filter(key => key.startsWith('metal_'));

    await chrome.storage.local.remove(metalKeys);
    console.log('Кэш очищен');
    return metalKeys.length;
  }
}

const cacheManager = new CacheManager();

// Обработчик сообщений
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "clearCache") {
    cacheManager.clearCache().then(count => {
      sendResponse({ cleared: count });
    });
    return true;
  }
});
