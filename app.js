const SUPABASE_URL = 'https://szdhfauofsjpfavwxyyw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zrvSGEOZlIa7wtdqjMzR6A_pxSN1JpT';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentGuest = null;
let selectedOptions = {};

const loginCard = document.getElementById('loginCard');
const appSection = document.getElementById('appSection');
const guestNameInput = document.getElementById('guestName');
const balanceDisplay = document.getElementById('balanceDisplay');
const marketsList = document.getElementById('marketsList');
const myBetsList = document.getElementById('myBetsList');
const leaderboardList = document.getElementById('leaderboardList');
const debugBox = document.getElementById('debugBox');

function debug(msg) {
  console.log(msg);
  if (debugBox) debugBox.textContent = msg;
}

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

window.startGame = async function () {
  try {
    debug('Start clicked');

    const name = guestNameInput.value.trim();
    if (!name) {
      alert('Please enter your name.');
      debug('No name entered');
      return;
    }

    debug('Checking guest...');

    const { data: guestCheck, error: checkError } = await supabaseClient
      .from('guests')
      .select('*')
      .eq('name', name)
      .maybeSingle();

    if (checkError) {
      debug('Name check failed: ' + checkError.message);
      alert('Could not check your name: ' + checkError.message);
      return;
    }

    let guest = guestCheck;

    if (!guest) {
      debug('Creating guest...');

      const { data: newGuest, error: insertError } = await supabaseClient
        .from('guests')
        .insert([{ name }])
        .select()
        .single();

      if (insertError) {
        debug('Create guest failed: ' + insertError.message);
        alert('Could not create guest: ' + insertError.message);
        return;
      }

      guest = newGuest;
    }

    currentGuest = guest;
    localStorage.setItem('forever_stakes_guest_name', guest.name);

    balanceDisplay.textContent = `${guest.current_balance} K-Max Credits`;
    loginCard.classList.add('hidden');
    appSection.classList.remove('hidden');

    debug('Loading markets...');
    await loadMarkets();
    debug('Markets loaded');
  } catch (err) {
    debug('Unexpected error: ' + err.message);
    alert('Unexpected error: ' + err.message);
  }
};

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
    console.error(err);
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
    debug('Load markets failed: ' + error.message);
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
      return;
    }

    const newBalance = currentGuest.current_balance - stake;

    const { error: betError } = await supabaseClient
      .from('bets')
      .insert([{
        guest_id: currentGuest.id,
        selection_id: selection.id,
        stake: stake,
        odds_at_bet: selection.odds
      }]);

    if (betError) {
      alert('Could not place bet: ' + betError.message);
      return;
    }

    const { data: updatedGuest, error: updateError } = await supabaseClient
      .from('guests')
      .update({ current_balance: newBalance })
      .eq('id', currentGuest.id)
      .select()
      .single();

    if (updateError) {
      alert('Balance update failed: ' + updateError.message);
      return;
    }

    currentGuest = updatedGuest;
    balanceDisplay.textContent = `${currentGuest.current_balance} K-Max Credits`;

    alert('Bet placed!');
    await loadMarkets();
    await loadMyBets();
    await loadLeaderboard();
  } catch (err) {
    alert('Unexpected betting error: ' + err.message);
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
        label
      )
    `)
    .eq('guest_id', currentGuest.id)
    .order('created_at', { ascending: false });

  if (error) {
    myBetsList.innerHTML = 'Could not load bets: ' + error.message;
    return;
  }

  if (!data.length) {
    myBetsList.innerHTML = '<div class="small">No bets placed yet.</div>';
    return;
  }

  myBetsList.innerHTML = data.map(bet => `
    <div class="bet-item">
      <strong>${bet.selections.label}</strong><br>
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
    return;
  }

  leaderboardList.innerHTML = data.map((guest, index) => `
    <div class="lb-item">
      <strong>#${index + 1} ${guest.name}</strong><br>
      ${guest.current_balance} K-Max Credits
    </div>
  `).join('');
}

debug('App script loaded');
restoreGuest();
