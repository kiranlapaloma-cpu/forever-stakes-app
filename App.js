const SUPABASE_URL = 'https://szdhfauofsjpfavwxyyw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zrvSGEOZlIa7wtdqjMzR6A_pxSN1JpT';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentGuest = null;
let selectedOptions = {};

const loginCard = document.getElementById('loginCard');
const appSection = document.getElementById('appSection');
const guestNameInput = document.getElementById('guestName');
const startBtn = document.getElementById('startBtn');
const balanceDisplay = document.getElementById('balanceDisplay');
const marketsList = document.getElementById('marketsList');
const myBetsList = document.getElementById('myBetsList');
const leaderboardList = document.getElementById('leaderboardList');

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'myBetsTab') loadMyBets();
    if (btn.dataset.tab === 'leaderboardTab') loadLeaderboard();
  });
});

startBtn.addEventListener('click', startGame);

async function startGame() {
  try {
    const name = guestNameInput.value.trim();

    if (!name) {
      alert('Please enter your name.');
      return;
    }

    alert('Start button clicked');

    let { data: guest, error } = await supabaseClient
      .from('guests')
      .select('*')
      .eq('name', name)
      .maybeSingle();

    if (error) {
      alert('Could not check your name: ' + error.message);
      console.error(error);
      return;
    }

    if (!guest) {
      alert('Creating new guest...');

      const insertResult = await supabaseClient
        .from('guests')
        .insert([{ name }])
        .select()
        .single();

      if (insertResult.error) {
        alert('Could not create guest: ' + insertResult.error.message);
        console.error(insertResult.error);
        return;
      }

      guest = insertResult.data;
    }

    alert('Guest loaded: ' + guest.name);

    currentGuest = guest;
    localStorage.setItem('forever_stakes_guest_name', guest.name);

    balanceDisplay.textContent = `${guest.current_balance} K-Max Credits`;
    loginCard.classList.add('hidden');
    appSection.classList.remove('hidden');

    await loadMarkets();

    alert('Markets loaded');
  } catch (err) {
    alert('Unexpected error: ' + err.message);
    console.error(err);
  }
}

async function restoreGuest() {
  try {
    const savedName = localStorage.getItem('forever_stakes_guest_name');
    if (!savedName) return;

    const { data: guest, error } = await supabaseClient
      .from('guests')
      .select('*')
      .eq('name', savedName)
      .maybeSingle();

    if (error || !guest) return;

    currentGuest = guest;
    balanceDisplay.textContent = `${guest.current_balance} K-Max Credits`;
    loginCard.classList.add('hidden');
    appSection.classList.remove('hidden');
    await loadMarkets();
  } catch (err) {
    console.error('Restore guest error:', err);
  }
}

async function loadMarkets() {
  const { data, error } = await supabaseClient
    .from('markets')
    .select(`
      id,
      title,
      slug,
      is_open,
      selections (
        id,
        label,
        odds,
        result,
        sort_order
      )
    `)
    .order('id', { ascending: true });

  if (error) {
    marketsList.innerHTML = `<div class="card">Could not load markets: ${error.message}</div>`;
    console.error(error);
    return;
  }

  const openMarkets = data.filter(m => m.is_open);

  marketsList.innerHTML = openMarkets.map(market => {
    const orderedSelections = [...market.selections].sort((a, b) => a.sort_order - b.sort_order);

    return `
      <div class="market-card">
        <h3>${market.title}</h3>
        <div class="options">
          ${orderedSelections.map(sel => `
            <button
              class="option-btn ${selectedOptions[market.id] === sel.id ? 'selected' : ''}"
              onclick="selectOption(${market.id}, ${sel.id})">
              ${sel.label} — ${sel.odds}
            </button>
          `).join('')}
        </div>
        <div class="bet-row">
          <input
            type="number"
            min="1"
            max="${currentGuest ? currentGuest.current_balance : 100}"
            id="stake_${market.id}"
            placeholder="Stake" />
          <button class="place-btn" onclick="placeBet(${market.id})">Place Bet</button>
        </div>
      </div>
    `;
  }).join('');
}

window.selectOption = function (marketId, selectionId) {
  selectedOptions[marketId] = selectionId;
  loadMarkets();
};

window.placeBet = async function (marketId) {
  try {
    if (!currentGuest) {
      alert('No guest loaded.');
      return;
    }

    const selectionId = selectedOptions[marketId];
    const stakeInput = document.getElementById(`stake_${marketId}`);
    const stake = Number(stakeInput.value);

    if (!selectionId) {
      alert('Please choose an option first.');
      return;
    }

    if (!stake || stake < 1) {
      alert('Enter a valid stake.');
      return;
    }

    if (stake > currentGuest.current_balance) {
      alert('Not enough balance.');
      return;
    }

    const { data: selection, error: selectionError } = await supabaseClient
      .from('selections')
      .select('*')
      .eq('id', selectionId)
      .single();

    if (selectionError) {
      alert('Could not load odds: ' + selectionError.message);
      console.error(selectionError);
      return;
    }

    const newBalance = currentGuest.current_balance - stake;

    const betInsert = await supabaseClient
      .from('bets')
      .insert([{
        guest_id: currentGuest.id,
        selection_id: selection.id,
        stake: stake,
        odds_at_bet: selection.odds
      }]);

    if (betInsert.error) {
      alert('Could not place bet: ' + betInsert.error.message);
      console.error(betInsert.error);
      return;
    }

    const guestUpdate = await supabaseClient
      .from('guests')
      .update({ current_balance: newBalance })
      .eq('id', currentGuest.id)
      .select()
      .single();

    if (guestUpdate.error) {
      alert('Bet saved, but balance failed to update: ' + guestUpdate.error.message);
      console.error(guestUpdate.error);
      return;
    }

    currentGuest = guestUpdate.data;
    balanceDisplay.textContent = `${currentGuest.current_balance} K-Max Credits`;

    alert('Bet placed!');
    await loadMarkets();
    await loadMyBets();
    await loadLeaderboard();
  } catch (err) {
    alert('Unexpected betting error: ' + err.message);
    console.error(err);
  }
};

async function loadMyBets() {
  if (!currentGuest) return;

  const { data, error } = await supabaseClient
    .from('bets')
    .select(`
      id,
      stake,
      odds_at_bet,
      status,
      payout,
      created_at,
      selections (
        label,
        markets (
          title
        )
      )
    `)
    .eq('guest_id', currentGuest.id)
    .order('created_at', { ascending: false });

  if (error) {
    myBetsList.innerHTML = 'Could not load bets: ' + error.message;
    console.error(error);
    return;
  }

  if (!data.length) {
    myBetsList.innerHTML = '<div class="small">No bets placed yet.</div>';
    return;
  }

  myBetsList.innerHTML = data.map(bet => `
    <div class="bet-item">
      <strong>${bet.selections.markets.title}</strong><br>
      Pick: ${bet.selections.label}<br>
      Stake: ${bet.stake} K-Max Credits<br>
      Odds: ${bet.odds_at_bet}<br>
      <span class="${bet.status === 'won' ? 'win' : bet.status === 'lost' ? 'lose' : 'pending'}">
        Status: ${bet.status}
      </span>
    </div>
  `).join('');
}

async function loadLeaderboard() {
  const { data, error } = await supabaseClient
    .from('guests')
    .select('name, current_balance')
    .order('current_balance', { ascending: false })
    .limit(20);

  if (error) {
    leaderboardList.innerHTML = 'Could not load leaderboard: ' + error.message;
    console.error(error);
    return;
  }

  leaderboardList.innerHTML = data.map((guest, index) => `
    <div class="lb-item">
      <strong>#${index + 1} ${guest.name}</strong><br>
      ${guest.current_balance} K-Max Credits
    </div>
  `).join('');
}

restoreGuest();
