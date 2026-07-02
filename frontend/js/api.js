(function () {
  const sameOriginApi = `${window.location.origin}/api`;
  const API_BASE_URL = window.WORLD_CUP_API_URL ||
    (window.location.protocol === 'file:' ? 'http://localhost:5000/api' : sameOriginApi);

  function buildUrl(path, params = {}) {
    const url = new URL(`${API_BASE_URL}${path}`);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    return url;
  }

  async function request(path, params) {
    const response = await fetch(buildUrl(path, params));
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || `API request failed with status ${response.status}.`);
    }

    return payload;
  }

  window.WorldCupAPI = {
    getTeams(query) {
      return request('/teams', query ? { q: query } : {});
    },
    getStandings(params = {}) {
      return request('/standings', params);
    },
    getMatches(params = {}) {
      return request('/matches', params);
    },
    getTeam(name) {
      return request(`/team/${encodeURIComponent(name)}`);
    }
  };
})();
