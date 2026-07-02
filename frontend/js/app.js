(function () {
  const state = {
    teams: [],
    standings: [],
    matches: []
  };

  const elements = {};

  document.addEventListener('DOMContentLoaded', () => {
    elements.notice = document.getElementById('dataNotice');
    elements.teamCount = document.getElementById('teamCount');
    elements.groupCount = document.getElementById('groupCount');
    elements.finishedMatchCount = document.getElementById('finishedMatchCount');
    elements.pendingMatchCount = document.getElementById('pendingMatchCount');
    elements.teamsContainer = document.getElementById('teamsContainer');
    elements.standingsContainer = document.getElementById('standingsContainer');
    elements.matchesContainer = document.getElementById('matchesContainer');
    elements.searchForm = document.getElementById('teamSearchForm');
    elements.searchInput = document.getElementById('teamSearchInput');

    elements.searchForm.addEventListener('submit', handleSearch);
    loadDashboard();
  });

  async function loadDashboard() {
    setNotice('Loading football-data.org World Cup 2026 data...', 'info');

    const [teamsResult, standingsResult, matchesResult] = await Promise.allSettled([
      WorldCupAPI.getTeams(),
      WorldCupAPI.getStandings(),
      WorldCupAPI.getMatches()
    ]);

    const errors = [];

    if (teamsResult.status === 'fulfilled') {
      state.teams = teamsResult.value.teams || [];
      renderTeams(state.teams);
    } else {
      errors.push(teamsResult.reason.message);
      elements.teamsContainer.innerHTML = empty('Teams unavailable.');
    }

    if (standingsResult.status === 'fulfilled') {
      state.standings = standingsResult.value.standings || [];
      renderStandings(state.standings);
    } else {
      errors.push(standingsResult.reason.message);
      elements.standingsContainer.innerHTML = empty('Standings unavailable.');
    }

    if (matchesResult.status === 'fulfilled') {
      state.matches = matchesResult.value.matches || [];
      renderMatches(state.matches);
    } else {
      errors.push(matchesResult.reason.message);
      elements.matchesContainer.innerHTML = empty('Matches unavailable.');
    }

    renderMetrics();
    renderCharts();

    if (errors.length) {
      setNotice([...new Set(errors)].join(' '), 'warning');
    } else {
      hideNotice();
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    const query = elements.searchInput.value.trim();

    try {
      setNotice(query ? `Searching for "${query}"...` : 'Loading teams...', 'info');
      const payload = await WorldCupAPI.getTeams(query);
      state.teams = payload.teams || [];
      renderTeams(state.teams);
      elements.teamCount.textContent = state.teams.length;
      hideNotice();
    } catch (error) {
      setNotice(error.message, 'warning');
      elements.teamsContainer.innerHTML = empty('Search unavailable.');
    }
  }

  function renderMetrics() {
    const groups = new Set(state.standings.map((standing) => standing.group).filter(Boolean));
    const finished = state.matches.filter((match) => match.status === 'FINISHED').length;
    const pending = state.matches.filter((match) => match.status !== 'FINISHED').length;

    elements.teamCount.textContent = state.teams.length || '--';
    elements.groupCount.textContent = groups.size || '--';
    elements.finishedMatchCount.textContent = state.matches.length ? finished : '--';
    elements.pendingMatchCount.textContent = state.matches.length ? pending : '--';
  }

  function renderTeams(teams) {
    if (!teams.length) {
      elements.teamsContainer.innerHTML = empty('No teams returned by the API.');
      return;
    }

    elements.teamsContainer.innerHTML = teams.map((team) => `
      <a class="team-row" href="team.html?team=${encodeURIComponent(team.name)}">
        ${crestMarkup(team)}
        <span>
          <strong>${escapeHtml(team.name)}</strong>
          <small>${escapeHtml([team.tla, team.area?.name].filter(Boolean).join(' - '))}</small>
        </span>
      </a>
    `).join('');
  }

  function renderStandings(standings) {
    if (!standings.length) {
      elements.standingsContainer.innerHTML = empty('No standings returned by the API.');
      return;
    }

    elements.standingsContainer.innerHTML = standings.map((standing) => `
      <section class="standing-group">
        <div class="standing-title">
          <strong>${escapeHtml(standing.group || standing.stage || 'Standings')}</strong>
          <span>${escapeHtml(standing.type || '')}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              ${standing.table.map((row) => `
                <tr>
                  <td>${value(row.position)}</td>
                  <td>
                    <a class="table-team" href="team.html?team=${encodeURIComponent(row.team.name)}">
                      ${escapeHtml(row.team.shortName || row.team.name)}
                    </a>
                  </td>
                  <td>${value(row.playedGames)}</td>
                  <td>${value(row.won)}</td>
                  <td>${value(row.draw)}</td>
                  <td class="${row.lost > 0 ? 'is-negative' : ''}">${value(row.lost)}</td>
                  <td>${value(row.goalsFor)}</td>
                  <td class="${row.goalsAgainst > 0 ? 'is-warning' : ''}">${value(row.goalsAgainst)}</td>
                  <td class="${row.goalDifference < 0 ? 'is-negative' : ''}">${value(row.goalDifference)}</td>
                  <td><strong>${value(row.points)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `).join('');
  }

  function renderMatches(matches) {
    if (!matches.length) {
      elements.matchesContainer.innerHTML = empty('No matches returned by the API.');
      return;
    }

    elements.matchesContainer.innerHTML = matches
      .slice()
      .sort((left, right) => new Date(left.utcDate) - new Date(right.utcDate))
      .slice(0, 16)
      .map(matchMarkup)
      .join('');
  }

  function renderCharts() {
    WorldCupCharts.renderStandingsPoints('standingsChart', state.standings);
    WorldCupCharts.renderGoals('goalsChart', state.standings);
  }

  function matchMarkup(match) {
    const score = match.score?.fullTime;
    const hasScore = typeof score?.home === 'number' && typeof score?.away === 'number';

    return `
      <article class="match-row">
        <div>
          <strong>${escapeHtml(match.homeTeam?.shortName || match.homeTeam?.name || 'TBD')} vs ${escapeHtml(match.awayTeam?.shortName || match.awayTeam?.name || 'TBD')}</strong>
          <small>${formatDate(match.utcDate)} ${match.group ? `- ${escapeHtml(match.group)}` : ''}</small>
        </div>
        <span class="${match.status !== 'FINISHED' ? 'status-pill' : 'status-pill is-live'}">
          ${hasScore ? `${score.home} - ${score.away}` : escapeHtml(match.status)}
        </span>
      </article>
    `;
  }

  function crestMarkup(team) {
    if (team.crest) {
      return `<img class="team-crest" src="${escapeAttribute(team.crest)}" alt="">`;
    }

    return `<span class="team-crest fallback">${escapeHtml(team.tla || team.name.slice(0, 3))}</span>`;
  }

  function setNotice(message, type) {
    elements.notice.textContent = message;
    elements.notice.className = `notice ${type || 'info'}`;
  }

  function hideNotice() {
    elements.notice.className = 'notice hidden';
    elements.notice.textContent = '';
  }

  function empty(message) {
    return `<p class="empty-state">${escapeHtml(message)}</p>`;
  }

  function value(input) {
    return input === undefined || input === null || input === '' ? '--' : input;
  }

  function formatDate(dateString) {
    if (!dateString) {
      return 'Date unavailable';
    }

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
  }
})();
