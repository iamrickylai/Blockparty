export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!env.blockparty) {
      return new Response('D1 binding "blockparty" is missing!', { status: 500 });
    }

    // ✅ Helper for safe primitive strings
    const toPrimitiveString = (val) => val != null ? `${val}` : '';

    // ✅ Add / Update player
    if (url.pathname === '/admin' && request.method === 'POST') {
      const formData = await request.formData();

      const newPlayerID = formData.get('new_player_id');
      const updatePlayerID = formData.get('update_player_id');

      const player_id = toPrimitiveString(newPlayerID || updatePlayerID).trim();
      const players_name = toPrimitiveString(formData.get('new_players_name') || formData.get('update_players_name')).trim();
      const profile_photo = toPrimitiveString(formData.get('new_profile_photo') || formData.get('update_profile_photo')).trim();
      const total_score_raw = formData.get('new_total_score') || formData.get('update_total_score') || '0';
      const total_score = Math.min(Number(total_score_raw), 999999);

      console.log('✅ typeof:', typeof player_id, '| instanceof String:', player_id instanceof String);
      console.log('✅ .bind(...) args:', player_id, players_name, profile_photo, total_score);

      const { results } = await env.blockparty
        .prepare('SELECT player_id FROM players WHERE player_id = ?')
        .bind(player_id)
        .all();
      const exists = results.length > 0;

      if (newPlayerID) {
        if (exists) return new Response('Player ID already exists.', { status: 400 });

        await env.blockparty.prepare(
          'INSERT INTO players (player_id, players_name, profile_photo, total_score) VALUES (?, ?, ?, ?)'
        ).bind(
          player_id,
          players_name,
          profile_photo,
          total_score
        ).run();

      } else if (updatePlayerID) {
        if (!exists) return new Response('Player not found.', { status: 404 });

        await env.blockparty.prepare(
          'UPDATE players SET players_name = ?, profile_photo = ?, total_score = ? WHERE player_id = ?'
        ).bind(
          players_name,
          profile_photo,
          total_score,
          player_id
        ).run();
      }

      return new Response(null, { status: 303, headers: { 'Location': '/admin' } });
    }

    // ✅ Admin portal
    if (url.pathname === '/admin') {
      const selected = url.searchParams.get('player_id') || null;
      const { results: players } = await env.blockparty.prepare('SELECT * FROM players').all();
      const selectedPlayer = selected ? players.find(p => p.player_id === selected) : null;
      return new Response(renderAdmin(players, selectedPlayer), { headers: { 'Content-Type': 'text/html' } });
    }

    // ✅ Leaderboard
    if (url.pathname === '/') {
      const { results: players } = await env.blockparty.prepare(
        'SELECT * FROM players ORDER BY total_score DESC'
      ).all();
      return new Response(renderLeaderboard(players), { headers: { 'Content-Type': 'text/html' } });
    }

    // ✅ Delete player
    if (url.pathname === '/delete') {
      if (request.method === 'GET') {
        return new Response(`<!DOCTYPE html><html><body>
          <h1>Delete Player</h1>
          <form method="POST">
            <label>Player ID: <input type="text" name="player_id" required></label>
            <button type="submit">Delete</button>
          </form></body></html>`, { headers: { 'Content-Type': 'text/html' } });
      }
      if (request.method === 'POST') {
        const formData = await request.formData();
        const player_id = toPrimitiveString(formData.get('player_id')).trim();

        console.log('✅ Deleting:', player_id, '| typeof:', typeof player_id);

        await env.blockparty.prepare(
          'DELETE FROM players WHERE player_id = ?'
        ).bind(player_id).run();

        return new Response(`Player ${player_id} deleted. <a href="/admin">Back to Admin</a>`,
          { headers: { 'Content-Type': 'text/html' } });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};

// ✅ Admin HTML
function renderAdmin(players, selectedPlayer) {
  const playerOptions = players.map(p =>
    `<option value="${p.player_id}" ${selectedPlayer?.player_id === p.player_id ? 'selected' : ''}>
      [${p.player_id}] ${p.players_name}</option>`
  ).join('');

  const updateFields = selectedPlayer ? `
    <label>Profile Photo URL:</label>
    <input type="url" name="update_profile_photo" value="${selectedPlayer.profile_photo}" required class="input"><br>
    <label>Player Name:</label>
    <input type="text" name="update_players_name" value="${selectedPlayer.players_name}" required class="input"><br>
    <label>Total Score:</label>
    <input type="number" name="update_total_score" value="${selectedPlayer.total_score ?? 0}" min="0" max="999999" class="input"><br>
  ` : '';

  return `<!DOCTYPE html>
<html><head><style>
  body { font-family: 'Segoe UI', sans-serif; background: #f4f4f8; padding: 2rem; }
  h1, h2 { color: #333; }
  form { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 2rem; max-width: 600px; }
  label { display: block; margin: 0.5rem 0 0.2rem; font-weight: bold; }
  .input { width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; border-radius: 6px; border: 1px solid #ccc; }
  button { padding: 0.75rem 1.5rem; background: #0055cc; color: white; border: none; border-radius: 6px; cursor: pointer; }
  button:hover { background: #003f99; }
</style></head><body>
  <h1>Block Party Admin</h1>
  <h2>Add Player</h2>
  <form method="POST">
    <label>Player ID:</label><input type="text" name="new_player_id" required class="input">
    <label>Player Name:</label><input type="text" name="new_players_name" required class="input">
    <label>Profile Photo URL:</label><input type="url" name="new_profile_photo" required class="input">
    <label>Total Score:</label>
    <input type="number" name="new_total_score" value="0" min="0" max="999999" class="input"><br>
    <button type="submit">Add Player</button>
  </form>

  <h2>Update Player</h2>
  <form method="GET">
    <label>Select Player:</label>
    <select name="player_id" onchange="this.form.submit()" class="input">
      <option value="">Select Player</option>
      ${playerOptions}
    </select>
  </form>
  ${selectedPlayer ? `<form method="POST">
    <input type="hidden" name="update_player_id" value="${selectedPlayer.player_id}">
    ${updateFields}
    <button type="submit">Update Player</button>
  </form>` : ''}
  <p><a href="/delete">Delete a Player</a></p>
</body></html>`;
}

// ✅ Leaderboard HTML with correct <th>Photo</th> and column widths
function renderLeaderboard(players) {
  const rows = players.map((p, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><img src="${p.profile_photo}" width="80" height="80" style="border-radius:50%;object-fit:cover;"></td>
      <td>${p.players_name}</td>
      <td>${p.total_score ?? '-'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html><head><style>
  body { font-family: 'Segoe UI', sans-serif; background: #f4f4f8; padding: 2rem; }
  h1 { text-align: center; color: #222; font-size: 2.5rem; margin-top: 1rem; }
  .banner { display: block; width: 50%; max-width: 100%; height: auto; margin: 0 auto 2rem; border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden; }
  th, td { padding: 1.5rem; text-align: center; font-size: 2rem; }
  th:nth-child(1), td:nth-child(1) { width: 100px; } /* Rank */
  th:nth-child(2), td:nth-child(2) { width: 120px; } /* Photo */
  th:nth-child(3), td:nth-child(3) { width: 300px; } /* Name */
  th:nth-child(4), td:nth-child(4) { width: 120px; } /* Total Score */
  tr:nth-child(even) { background-color: #f9f9f9; }
  th { background: #0055cc; color: white; }
</style></head><body>
  <img src="https://imagedelivery.net/zATaYcXRip-iTD7KY4rWYw/40568403-42c4-4495-ab11-14318ee23300/public" alt="Block Party Banner" class="banner">
  <h1>Leaderboard</h1>
  <table border="1">
    <tr>
      <th>Rank</th>
      <th>Photo</th>
      <th>Name</th>
      <th>Total Score</th>
    </tr>
    ${rows}
  </table>
</body></html>`;
}
