(function () {
  const elements = {};

  document.addEventListener('DOMContentLoaded', () => {
    elements.notice = document.getElementById('compareNotice');
    elements.form = document.getElementById('compareForm');
    elements.teamOneInput = document.getElementById('teamOneInput');
    elements.teamTwoInput = document.getElementById('teamTwoInput');
    elements.options = document.getElementById('teamOptions');
    elements.cards = document.getElementById('compareCards');
    elements.teamOneMatches = document.getElementById('teamOneMatches');
    elements.teamTwoMatches = document.getElementById('teamTwoMatches');

    elements.form.addEventListener('submit', handleCompare);
    loadTeamOptions();
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

  async function handleCompare(event) {
    event.preventDefault();
    const teamOne = elements.teamOneInput.value.trim();
    const teamTwo = elements.teamTwoInput.value.trim();

    if (!teamOne || !teamTwo) {
      setNotice('Choose two teams returned by football-data.org.', 'warning');
      return;
    }

    if (teamOne.toLowerCase() === teamTwo.toLowerCase()) {
      setNotice('Choose two different teams.', 'warning');
      return;
    }

    try {
      setNotice('Loading comparison...', 'info');
      const [left, right] = await Promise.all([
        WorldCupAPI.getTeam(teamOne),
        WorldCupAPI.getTeam(teamTwo)
      ]);

      renderComparison(left, right);
      const warnings = [...(left.warnings || []), ...(right.warnings || [])];

      if (warnings.length) {
        setNotice(warnings.join(' '), 'warning');
      } else {
        hideNotice();
      }
    } catch (error) {
      setNotice(error.message, 'warning');
    }
  }

  function renderComparison(left, right) {
    elements.cards.innerHTML = [left, right].map(teamCard).join('');
    elements.teamOneMatches.innerHTML = renderMatches(left.matches || []);
    elements.teamTwoMatches.innerHTML = renderMatches(right.matches || []);

    if (!WorldCupCharts.renderCompare('compareChart', left, right)) {
      clearCanvas('compareChart');
    }
  }

  function teamCard(detail) {
    const stats = detail.stats;
    const team = detail.team;

    return `
      <article class="team-card">
        <div class="team-card-header">
          ${crestMarkup(team)}
          <div>
            <strong>${escapeHtml(team.name)}</strong>
            <small>${escapeHtml([team.tla, team.area?.name].filter(Boolean).join(' - '))}</small>
          </div>
        </div>
        ${stats?.available ? `
          <div class="team-stat-line"><span>Played</span><strong>${value(stats.played)}</strong></div>
          <div class="team-stat-line"><span>Points</span><strong>${value(stats.points)}</strong></div>
          <div class="team-stat-line"><span>Record</span><strong>${value(stats.won)}-${value(stats.draw)}-${value(stats.lost)}</strong></div>
          <div class="team-stat-line"><span>Goal difference</span><strong class="${stats.goalDifference < 0 ? 'is-negative' : ''}">${value(stats.goalDifference)}</strong></div>
        ` : `
          <p class="empty-state">${escapeHtml(stats?.message || 'No finished match statistics returned by the API.')}</p>
        `}
      </article>
    `;
  }

  function renderMatches(matches) {
    if (!matches.length) {
      return empty('No fixtures returned for this team.');
    }

    return matches
      .slice()
      .sort((left, right) => new Date(left.utcDate) - new Date(right.utcDate))
      .map(matchMarkup)
      .join('');
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
