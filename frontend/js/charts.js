(function () {
  const charts = new Map();
  const colors = {
    yellow: '#ffd400',
    yellowSoft: 'rgba(255, 212, 0, 0.22)',
    red: '#ff3b30',
    redSoft: 'rgba(255, 59, 48, 0.22)',
    green: '#24d47e',
    greenSoft: 'rgba(36, 212, 126, 0.22)',
    cyan: '#5cc8ff',
    text: '#f8f8f8',
    muted: '#9a9a9a',
    grid: 'rgba(255, 255, 255, 0.1)'
  };

  function getCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);

    if (!canvas || typeof Chart === 'undefined') {
      return null;
    }

    if (charts.has(canvasId)) {
      charts.get(canvasId).destroy();
      charts.delete(canvasId);
    }

    return canvas;
  }

  function baseOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: colors.text,
            boxWidth: 12,
            boxHeight: 12
          }
        },
        tooltip: {
          backgroundColor: '#111111',
          borderColor: colors.yellow,
          borderWidth: 1,
          titleColor: colors.text,
          bodyColor: colors.text
        }
      },
      scales: {
        x: {
          ticks: { color: colors.muted },
          grid: { color: colors.grid }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: colors.muted,
            precision: 0
          },
          grid: { color: colors.grid }
        }
      },
      ...extra
    };
  }

  function flattenStandings(standings) {
    return standings
      .flatMap((standing) => standing.table.map((row) => ({
        group: standing.group,
        ...row
      })))
      .filter((row) => row.team?.name);
  }

  function renderStandingsPoints(canvasId, standings) {
    const canvas = getCanvas(canvasId);
    const rows = flattenStandings(standings)
      .filter((row) => typeof row.points === 'number')
      .sort((left, right) => right.points - left.points || right.goalDifference - left.goalDifference)
      .slice(0, 16);

    if (!canvas || !rows.length) {
      return false;
    }

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map((row) => row.team.shortName || row.team.name),
        datasets: [{
          label: 'Points',
          data: rows.map((row) => row.points),
          backgroundColor: colors.yellowSoft,
          borderColor: colors.yellow,
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: baseOptions()
    });

    charts.set(canvasId, chart);
    return true;
  }

  function renderGoals(canvasId, standings) {
    const canvas = getCanvas(canvasId);
    const rows = flattenStandings(standings)
      .filter((row) => typeof row.goalsFor === 'number' && typeof row.goalsAgainst === 'number')
      .sort((left, right) => right.goalsFor - left.goalsFor)
      .slice(0, 12);

    if (!canvas || !rows.length) {
      return false;
    }

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map((row) => row.team.shortName || row.team.name),
        datasets: [
          {
            label: 'Goals for',
            data: rows.map((row) => row.goalsFor),
            backgroundColor: colors.greenSoft,
            borderColor: colors.green,
            borderWidth: 2,
            borderRadius: 6
          },
          {
            label: 'Goals against',
            data: rows.map((row) => row.goalsAgainst),
            backgroundColor: colors.redSoft,
            borderColor: colors.red,
            borderWidth: 2,
            borderRadius: 6
          }
        ]
      },
      options: baseOptions()
    });

    charts.set(canvasId, chart);
    return true;
  }

  function renderTeamRecord(canvasId, detail) {
    const canvas = getCanvas(canvasId);
    const stats = detail?.stats;

    if (!canvas || !stats?.available) {
      return false;
    }

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Wins', 'Draws', 'Losses'],
        datasets: [{
          data: [stats.won, stats.draw, stats.lost],
          backgroundColor: [colors.greenSoft, colors.yellowSoft, colors.redSoft],
          borderColor: [colors.green, colors.yellow, colors.red],
          borderWidth: 2
        }]
      },
      options: baseOptions({
        scales: {}
      })
    });

    charts.set(canvasId, chart);
    return true;
  }

  function renderTeamGoals(canvasId, detail) {
    const canvas = getCanvas(canvasId);
    const stats = detail?.stats;

    if (!canvas || !stats?.available) {
      return false;
    }

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: [detail.team.shortName || detail.team.name],
        datasets: [
          {
            label: 'Goals for',
            data: [stats.goalsFor],
            backgroundColor: colors.greenSoft,
            borderColor: colors.green,
            borderWidth: 2,
            borderRadius: 6
          },
          {
            label: 'Goals against',
            data: [stats.goalsAgainst],
            backgroundColor: colors.redSoft,
            borderColor: colors.red,
            borderWidth: 2,
            borderRadius: 6
          }
        ]
      },
      options: baseOptions()
    });

    charts.set(canvasId, chart);
    return true;
  }

  function renderCompare(canvasId, left, right) {
    const canvas = getCanvas(canvasId);

    if (!canvas || (!left?.stats?.available && !right?.stats?.available)) {
      return false;
    }

    const labels = ['Points', 'Wins', 'Draws', 'Losses', 'Goals for', 'Goals against'];
    const fields = ['points', 'won', 'draw', 'lost', 'goalsFor', 'goalsAgainst'];
    const value = (detail, field) => detail?.stats?.available ? detail.stats[field] : null;

    const chart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: left.team.shortName || left.team.name,
            data: fields.map((field) => value(left, field)),
            backgroundColor: colors.yellowSoft,
            borderColor: colors.yellow,
            pointBackgroundColor: colors.yellow,
            borderWidth: 2
          },
          {
            label: right.team.shortName || right.team.name,
            data: fields.map((field) => value(right, field)),
            backgroundColor: 'rgba(92, 200, 255, 0.2)',
            borderColor: colors.cyan,
            pointBackgroundColor: colors.cyan,
            borderWidth: 2
          }
        ]
      },
      options: baseOptions({
        scales: {
          r: {
            beginAtZero: true,
            angleLines: { color: colors.grid },
            grid: { color: colors.grid },
            pointLabels: { color: colors.text },
            ticks: {
              color: colors.muted,
              backdropColor: 'transparent',
              precision: 0
            }
          }
        }
      })
    });

    charts.set(canvasId, chart);
    return true;
  }

  window.WorldCupCharts = {
    renderStandingsPoints,
    renderGoals,
    renderTeamRecord,
    renderTeamGoals,
    renderCompare
  };
})();
