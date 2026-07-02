require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;
const API_BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || 'WC';
const DEFAULT_SEASON = process.env.FOOTBALL_DATA_SEASON || '2026';
const CACHE_TTL_MS = 60 * 1000;

const footballClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

const cache = new Map();

app.use(cors());
app.use(express.json());

const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function getFootballToken() {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) {
    throw createHttpError(
      500,
      'Missing FOOTBALL_DATA_API_KEY. Create backend/.env from .env.example and add your football-data.org token.'
    );
  }

  return token;
}

function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function cacheKey(endpoint, params) {
  const search = new URLSearchParams(
    Object.entries(cleanParams(params)).sort(([left], [right]) => left.localeCompare(right))
  );
  return `${endpoint}?${search.toString()}`;
}

async function requestFootball(endpoint, params = {}, headers = {}) {
  const key = cacheKey(endpoint, params);
  const cached = cache.get(key);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const response = await footballClient.get(endpoint, {
      params: cleanParams(params),
      headers: {
        'X-Auth-Token': getFootballToken(),
        ...headers
      }
    });

    cache.set(key, {
      createdAt: Date.now(),
      data: response.data
    });

    return response.data;
  } catch (error) {
    if (error.status) {
      throw error;
    }

    const status = error.response?.status || 502;
    const apiMessage = error.response?.data?.message || error.response?.data?.error;
    throw createHttpError(status, apiMessage || 'football-data.org request failed.', {
      endpoint,
      status
    });
  }
}

function worldCupParams(query, allowedFilters = []) {
  const params = {
    season: query.season || DEFAULT_SEASON
  };

  allowedFilters.forEach((filter) => {
    if (query[filter]) {
      params[filter] = query[filter];
    }
  });

  return params;
}

function normalizeCompetition(payload) {
  return {
    competition: payload.competition || null,
    season: payload.season || null,
    filters: payload.filters || {}
  };
}

function normalizeTeam(team) {
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    tla: team.tla,
    crest: team.crest,
    address: team.address,
    website: team.website,
    founded: team.founded,
    clubColors: team.clubColors,
    venue: team.venue,
    type: team.type,
    area: team.area
      ? {
          id: team.area.id,
          name: team.area.name,
          code: team.area.code,
          flag: team.area.flag
        }
      : null,
    coach: team.coach
      ? {
          id: team.coach.id,
          name: team.coach.name,
          nationality: team.coach.nationality
        }
      : null
  };
}

function normalizeMatchTeam(team) {
  return {
    id: team?.id,
    name: team?.name,
    shortName: team?.shortName,
    tla: team?.tla,
    crest: team?.crest
  };
}

function normalizeMatch(match) {
  return {
    id: match.id,
    utcDate: match.utcDate,
    status: match.status,
    stage: match.stage,
    group: match.group,
    matchday: match.matchday,
    lastUpdated: match.lastUpdated,
    homeTeam: normalizeMatchTeam(match.homeTeam),
    awayTeam: normalizeMatchTeam(match.awayTeam),
    score: {
      winner: match.score?.winner || null,
      duration: match.score?.duration || null,
      fullTime: match.score?.fullTime || null,
      halfTime: match.score?.halfTime || null,
      regularTime: match.score?.regularTime || null,
      extraTime: match.score?.extraTime || null,
      penalties: match.score?.penalties || null
    },
    referees: match.referees || []
  };
}

function normalizeStandingRow(row) {
  return {
    position: row.position,
    team: normalizeMatchTeam(row.team),
    playedGames: row.playedGames,
    form: row.form,
    won: row.won,
    draw: row.draw,
    lost: row.lost,
    points: row.points,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference
  };
}

function normalizeStanding(standing) {
  return {
    stage: standing.stage,
    type: standing.type,
    group: standing.group,
    table: Array.isArray(standing.table) ? standing.table.map(normalizeStandingRow) : []
  };
}

function namesMatch(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function findTeamByName(teams, requestedName) {
  const name = requestedName.trim().toLowerCase();

  return teams.find((team) => {
    const teamNames = [team.name, team.shortName, team.tla].filter(Boolean).map((value) => value.toLowerCase());
    return teamNames.some((value) => value === name);
  }) || teams.find((team) => {
    const teamNames = [team.name, team.shortName].filter(Boolean).map((value) => value.toLowerCase());
    return teamNames.some((value) => value.includes(name) || name.includes(value));
  });
}

function matchBelongsToTeam(match, team) {
  return match.homeTeam?.id === team.id ||
    match.awayTeam?.id === team.id ||
    namesMatch(match.homeTeam?.name, team.name) ||
    namesMatch(match.awayTeam?.name, team.name);
}

function getFullTimeScore(match) {
  const fullTime = match.score?.fullTime;

  if (typeof fullTime?.home !== 'number' || typeof fullTime?.away !== 'number') {
    return null;
  }

  return fullTime;
}

function deriveTeamStats(team, matches) {
  const finishedMatches = matches
    .filter((match) => match.status === 'FINISHED')
    .filter((match) => getFullTimeScore(match))
    .sort((left, right) => new Date(left.utcDate) - new Date(right.utcDate));

  if (!finishedMatches.length) {
    return {
      available: false,
      sampleSize: 0,
      message: 'No finished World Cup 2026 matches are available for this team from football-data.org yet.'
    };
  }

  const totals = {
    available: true,
    sampleSize: finishedMatches.length,
    played: finishedMatches.length,
    won: 0,
    draw: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    cleanSheets: 0,
    form: []
  };

  finishedMatches.forEach((match) => {
    const score = getFullTimeScore(match);
    const isHome = match.homeTeam?.id === team.id || namesMatch(match.homeTeam?.name, team.name);
    const goalsFor = isHome ? score.home : score.away;
    const goalsAgainst = isHome ? score.away : score.home;

    totals.goalsFor += goalsFor;
    totals.goalsAgainst += goalsAgainst;

    if (goalsAgainst === 0) {
      totals.cleanSheets += 1;
    }

    if (goalsFor > goalsAgainst) {
      totals.won += 1;
      totals.points += 3;
      totals.form.push('W');
    } else if (goalsFor === goalsAgainst) {
      totals.draw += 1;
      totals.points += 1;
      totals.form.push('D');
    } else {
      totals.lost += 1;
      totals.form.push('L');
    }
  });

  totals.goalDifference = totals.goalsFor - totals.goalsAgainst;
  totals.winRate = Number(((totals.won / totals.played) * 100).toFixed(1));
  totals.form = totals.form.slice(-5);

  return totals;
}

function standingsForTeam(standings, team) {
  return standings
    .map((standing) => {
      const row = standing.table.find((entry) => entry.team?.id === team.id || namesMatch(entry.team?.name, team.name));

      if (!row) {
        return null;
      }

      return {
        stage: standing.stage,
        type: standing.type,
        group: standing.group,
        row
      };
    })
    .filter(Boolean);
}

function buildWarningFromRejected(result, label) {
  if (result.status !== 'rejected') {
    return null;
  }

  return `${label}: ${result.reason.message}`;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    competition: COMPETITION,
    season: DEFAULT_SEASON
  });
});

app.get('/api/teams', async (req, res, next) => {
  try {
    const payload = await requestFootball(`/competitions/${COMPETITION}/teams`, worldCupParams(req.query));
    let teams = Array.isArray(payload.teams) ? payload.teams.map(normalizeTeam) : [];

    if (req.query.q) {
      const query = req.query.q.trim().toLowerCase();
      teams = teams.filter((team) =>
        [team.name, team.shortName, team.tla, team.area?.name]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query))
      );
    }

    res.json({
      ...normalizeCompetition(payload),
      count: teams.length,
      teams
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/standings', async (req, res, next) => {
  try {
    const payload = await requestFootball(
      `/competitions/${COMPETITION}/standings`,
      worldCupParams(req.query, ['matchday', 'date'])
    );

    res.json({
      ...normalizeCompetition(payload),
      standings: Array.isArray(payload.standings) ? payload.standings.map(normalizeStanding) : []
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/matches', async (req, res, next) => {
  try {
    const payload = await requestFootball(
      `/competitions/${COMPETITION}/matches`,
      worldCupParams(req.query, ['dateFrom', 'dateTo', 'stage', 'status', 'matchday', 'group'])
    );

    res.json({
      ...normalizeCompetition(payload),
      resultSet: payload.resultSet || null,
      matches: Array.isArray(payload.matches) ? payload.matches.map(normalizeMatch) : []
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/team/:name', async (req, res, next) => {
  try {
    const teamsPayload = await requestFootball(`/competitions/${COMPETITION}/teams`, worldCupParams(req.query));
    const teams = Array.isArray(teamsPayload.teams) ? teamsPayload.teams.map(normalizeTeam) : [];
    const team = findTeamByName(teams, req.params.name);

    if (!team) {
      throw createHttpError(404, `No World Cup 2026 team found for "${req.params.name}".`);
    }

    const [matchesResult, standingsResult] = await Promise.allSettled([
      requestFootball(`/competitions/${COMPETITION}/matches`, worldCupParams(req.query)),
      requestFootball(`/competitions/${COMPETITION}/standings`, worldCupParams(req.query))
    ]);

    const matchesPayload = matchesResult.status === 'fulfilled' && Array.isArray(matchesResult.value.matches)
      ? matchesResult.value.matches
      : [];
    const standingsPayload = standingsResult.status === 'fulfilled' && Array.isArray(standingsResult.value.standings)
      ? standingsResult.value.standings
      : [];

    const matches = matchesResult.status === 'fulfilled'
      ? matchesPayload.map(normalizeMatch).filter((match) => matchBelongsToTeam(match, team))
      : [];

    const standings = standingsResult.status === 'fulfilled'
      ? standingsPayload.map(normalizeStanding)
      : [];

    res.json({
      ...normalizeCompetition(teamsPayload),
      team,
      stats: deriveTeamStats(team, matches),
      standings: standingsForTeam(standings, team),
      matches,
      warnings: [
        buildWarningFromRejected(matchesResult, 'Matches unavailable'),
        buildWarningFromRejected(standingsResult, 'Standings unavailable')
      ].filter(Boolean)
    });
  } catch (error) {
    next(error);
  }
});

app.get(['/team.html', '/compare.html', '/index.html'], (req, res) => {
  res.sendFile(path.join(frontendPath, path.basename(req.path)));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found.'
  });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;

  res.status(status).json({
    message: error.message || 'Unexpected server error.',
    details: error.details || undefined
  });
});

app.listen(PORT, () => {
  console.log(`World Cup Analytics backend running on http://localhost:${PORT}`);
});
