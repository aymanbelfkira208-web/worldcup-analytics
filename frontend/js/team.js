(function () {
  const elements = {};

  document.addEventListener('DOMContentLoaded', () => {
    elements.notice = document.getElementById('teamNotice');
    elements.form = document.getElementById('teamLookupForm');
    elements.input = document.getElementById('teamLookupInput');
    elements.options = document.getElementById('teamOptions');
    elements.pageTitle = document.getElementById('pageTitle');
    elements.teamCrest = document.getElementById('teamCrest');
    elements.teamMeta = document.getElementById('teamMeta');
    elements.teamName = document.getElementById('teamName');
    elements.teamSubtext = document.getElementById('teamSubtext');
    elements.statsGrid = document.getElementById('teamStatsGrid');
    elements.standings = document.getElementById('teamStandings');
    elements.matches = document.getElementById('teamMatches');

    elements.form.addEventListener('submit', (event) => {
      event.preventDefault();
      loadTeam(elements.input.value.trim());
    });

    loadTeamOptions();

    const initialTeam = new URLSearchParams(window.location.search).get('team');
    if (initialTeam) {
      elements.input.value = initialTeam;
      loadTeam(initialTeam);
    }
  });

  async function loadTeamOptions() {
    try {
      const payload = await WorldCupAPI.getTeams();
      elements.options.innerHTML = (payload.teams || [])
        .map((team) => `<option value="${escapeAttribute(team.name)}"></option>`)
        .join('');
    } catch (error) {
      setNotice(error.message, 'warning');
    }
  }

  async function loadTeam(teamName) {
    if (!teamName) {
      setNotice('Enter a team returned by football-data.org.', 'warning');
      return;
    }

    try {
      setNotice(`Loading ${teamName}...`, 'info');
      const detail = await WorldCupAPI.getTeam(teamName);
      renderTeam(detail);
      window.history.replaceState({}, '', `team.html?team=${encodeURIComponent(detail.team.name)}`);

      if (detail.warnings?.length) {
        setNotice(detail.warnings.join(' '), 'warning');
      } else {
        hideNotice();
      }
    } catch (error) {
      setNotice(error.message, 'warning');
    }
  }

  function renderTeam(detail) {
    const team = detail.team;
    elements.pageTitle.textContent = team.name;
    elements.teamName.textContent = team.name;
    elements.teamMeta.textContent = [team.tla, team.area?.name].filter(Boolean).join(' - ') || 'World Cup 2026';
    elements.teamSubtext.textContent = [team.venue, team.coach?.name ? `Coach: ${team.coach.name}` : '']
      .filter(Boolean)
      .join(' - ') || 'Profile data returned by football-data.org.';

    if (team.crest) {
      elements.teamCrest.innerHTML = `<img src="${escapeAttribute(team.crest)}" alt="">`;
    } else {
      elements.teamCrest.textContent = team.tla || team.name.slice(0, 3);
    }

    renderStats(detail.stats);
    renderStandings(detail.standings || []);
    renderMatches(detail.matches || []);
    renderCharts(detail);
  }

  function renderStats(stats) {
    if (!stats?.available) {
      elements.statsGrid.innerHTML = `
        <article class="metric-card warning-card">
          <span>Finished match data</span>
          <strong>--</strong>
          <small>${escapeHtml(stats?.message || 'No finished match statistics returned by the API.')}</small>
        </article>
      `;
      return;
    }

    const cards = [
      ['Played', stats.played],
      ['Points', stats.points],
      ['Wins', stats.won],
      ['Draws', stats.draw],
      ['Losses', stats.lost, stats.lost > 0 ? 'is-negative' : ''],
      ['Goal difference', stats.goalDifference, stats.goalDifference < 0 ? 'is-negative' : ''],
      ['Goals for', stats.goalsFor],
      ['Goals against', stats.goalsAgainst, stats.goalsAgainst > stats.goalsFor ? 'is-negative' : '']
    ];

    elements.statsGrid.innerHTML = cards.map(([label, statValue, className]) => `
      <article class="metric-card">
        <span>${escapeHtml(label)}</span>
        <strong class="${className || ''}">${value(statValue)}</strong>
      </article>
    `).join('');
  }

  function renderStandings(standings) {
    if (!standings.length) {
      elements.standings.innerHTML = empty('No standing row returned for this team.');
      return;
    }

    elements.standings.innerHTML = standings.map((standing) => {
      const row = standing.row;
      return `
        <section class="standing-group">
          <div class="standing-title">
            <strong>${escapeHtml(standing.group || standing.stage || 'Standing')}</strong>
            <span>${escapeHtml(standing.type || '')}</span>
          </div>
          <div class="team-stat-line">
            <span>Position</span><strong>${value(row.position)}</strong>
          </div>
          <div class="team-stat-line">
            <span>Points</span><strong>${value(row.points)}</strong>
          </div>
          <div class="team-stat-line">
            <span>Goal difference</span><strong class="${row.goalDifference < 0 ? 'is-negative' : ''}">${value(row.goalDifference)}</strong>
          </div>
          <div class="team-stat-line">
            <span>Record</span><strong>${value(row.won)}-${value(row.draw)}-${value(row.lost)}</strong>
          </div>
        </section>
      `;
    }).join('');
  }

  function renderMatches(matches) {
    if (!matches.length) {
      elements.matches.innerHTML = empty('No fixtures returned for this team.');
      return;
    }

    elements.matches.innerHTML = matches
      .slice()
      .sort((left, right) => new Date(left.utcDate) - new Date(right.utcDate))
      .map(matchMarkup)
      .join('');
  }

  function renderCharts(detail) {
    const recordRendered = WorldCupCharts.renderTeamRecord('teamRecordChart', detail);
    const goalsRendered = WorldCupCharts.renderTeamGoals('teamGoalsChart', detail);

    if (!recordRendered) {
      clearCanvas('teamRecordChart');
    }

    if (!goalsRendered) {
      clearCanvas('teamGoalsChart');
    }
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

  function clearCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    const context = canvas?.getContext('2d');

    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
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
