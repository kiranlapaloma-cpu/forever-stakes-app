const SUPABASE_URL = 'https://szdhfauofsjpfavwxyyw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zrvSGEOZlIa7wtdqjMzR6A_pxSN1JpT';
const ADMIN_PASSWORD = 'forever2026';
const STARTING_BALANCE = 150;

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentGuest = null;
let selectedOptions = {};
let adminUnlocked = false;
let adminWinningSelections = {};

const loginCard = document.getElementById('loginCard');
const appSection = document.getElementById('appSection');
const guestNameInput = document.getElementById('guestName');
const balanceDisplay = document.getElementById('balanceDisplay');
const marketsList = document.getElementById('marketsList');
const myBetsList = document.getElementById('myBetsList');
const leaderboardList = document.getElementById('leaderboardList');
const debugBox = document.getElementById('debugBox');
const adminLoginCard = document.getElementById('adminLoginCard');
const adminPanel = document.getElementById('adminPanel');
const adminMarketsList = document.getElementById('adminMarketsList');

function debug(msg) {
  console.log(msg);
  if (debugBox) debugBox.textContent = msg;
}

function oddsToDecimal(odds) {
  const parts = String(odds).split('/');
  if (parts.length !== 2) return 1;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!a || !b) return 1;
  return (a / b) + 1;
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'myBetsTab') loadMyBets();
    if (btn.dataset.tab === 'leaderboardTab') loadLeaderboard();
    if (btn.dataset.tab === 'adminTab' && adminUnlocked) loadAdminMarkets();
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
      settled,
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
        <div class="small" style="margin-bottom:8px;">
          ${market.settled ? 'Settled' : 'Open'}
        </div>
        <div class="options">
          ${orderedSelections.map(sel => `
            <button
              class="option-btn ${selectedOptions[market.id] === sel.id ? 'selected' : ''}"
              onclick="selectOption(${market.id}, ${sel.id})"
              ${market.settled ? 'disabled' : ''}>
              ${sel.label} — ${sel.odds}
            </button>
          `).join('')}
        </div>
        <div class="bet-row">
          <input
            type="number"
            min="1"
            max="${currentGuest ? currentGuest.current_balance : STARTING_BALANCE}"
            id="stake_${market.id}"
            placeholder="Stake"
            ${market.settled ? 'disabled' : ''} />
          <button
            class="place-btn"
            onclick="placeBet(${market.id})"
            ${market.settled ? 'disabled' : ''}>
            Place Bet
          </button>
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
      Payout: ${bet.payout} K-Max Credits<br>
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
    .limit(50);

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

window.adminLogin = function () {
  const entered = document.getElementById('adminPassword').value;

  if (entered !== ADMIN_PASSWORD) {
    alert('Wrong password');
    return;
  }

  adminUnlocked = true;
  adminLoginCard.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  loadAdminMarkets();
};

async function loadAdminMarkets() {
  const { data, error } = await supabaseClient
    .from('markets')
    .select(`
      id,
      title,
      settled,
      selections (
        id,
        label,
        odds,
        sort_order,
        result
      )
    `)
    .order('id', { ascending: true });

  if (error) {
    adminMarketsList.innerHTML = `Could not load admin markets: ${error.message}`;
    return;
  }

  adminMarketsList.innerHTML = data.map(market => {
    const orderedSelections = [...market.selections].sort((a, b) => a.sort_order - b.sort_order);

    return `
      <div class="market-card">
        <h3>${market.title}</h3>
        <div class="small" style="margin-bottom:8px;">
          ${market.settled ? 'Already settled' : 'Not settled'}
        </div>

        <div class="options">
          ${orderedSelections.map(sel => `
            <button
              class="option-btn ${adminWinningSelections[market.id] === sel.id ? 'selected' : ''}"
              onclick="adminPickWinner(${market.id}, ${sel.id})"
              ${market.settled ? 'disabled' : ''}>
              ${sel.label} — ${sel.odds}
            </button>
          `).join('')}
        </div>

        <button
          class="place-btn"
          onclick="settleMarket(${market.id})"
          ${market.settled ? 'disabled' : ''}>
          Settle Market
        </button>
      </div>
    `;
  }).join('');
}

window.adminPickWinner = function (marketId, selectionId) {
  adminWinningSelections[marketId] = selectionId;
  loadAdminMarkets();
};

window.settleMarket = async function (marketId) {
  try {
    const winningSelectionId = adminWinningSelections[marketId];

    if (!winningSelectionId) {
      alert('Choose a winning selection first.');
      return;
    }

    const { data: market, error: marketError } = await supabaseClient
      .from('markets')
      .select(`
        id,
        title,
        settled,
        selections (
          id,
          label,
          odds
        )
      `)
      .eq('id', marketId)
      .single();

    if (marketError) {
      alert('Could not load market.');
      return;
    }

    if (market.settled) {
      alert('This market is already settled.');
      return;
    }

    const winningSelection = market.selections.find(s => s.id === winningSelectionId);
    if (!winningSelection) {
      alert('Winning selection not found.');
      return;
    }

    const selectionIds = market.selections.map(s => s.id);

    const { data: bets, error: betsError } = await supabaseClient
      .from('bets')
      .select('*')
      .in('selection_id', selectionIds)
      .eq('status', 'open');

    if (betsError) {
      alert('Could not load bets for this market.');
      return;
    }

    const losingBets = bets.filter(b => b.selection_id !== winningSelectionId);
    const winningBets = bets.filter(b => b.selection_id === winningSelectionId);

    for (const bet of losingBets) {
      const { error } = await supabaseClient
        .from('bets')
        .update({
          status: 'lost',
          payout: 0
        })
        .eq('id', bet.id);

      if (error) {
        alert('Failed updating a losing bet.');
        return;
      }
    }

    for (const bet of winningBets) {
      const payout = Math.round(bet.stake * oddsToDecimal(bet.odds_at_bet));

      const { error: betWinError } = await supabaseClient
        .from('bets')
        .update({
          status: 'won',
          payout: payout
        })
        .eq('id', bet.id);

      if (betWinError) {
        alert('Failed updating a winning bet.');
        return;
      }

      const { data: guest, error: guestError } = await supabaseClient
        .from('guests')
        .select('*')
        .eq('id', bet.guest_id)
        .single();

      if (guestError) {
        alert('Failed loading guest balance.');
        return;
      }

      const { error: balanceError } = await supabaseClient
        .from('guests')
        .update({
          current_balance: guest.current_balance + payout
        })
        .eq('id', guest.id);

      if (balanceError) {
        alert('Failed updating guest balance.');
        return;
      }
    }

    for (const selection of market.selections) {
      const resultValue = selection.id === winningSelectionId ? 'won' : 'lost';

      const { error } = await supabaseClient
        .from('selections')
        .update({ result: resultValue })
        .eq('id', selection.id);

      if (error) {
        alert('Failed updating selection results.');
        return;
      }
    }

    const { error: settleError } = await supabaseClient
      .from('markets')
      .update({ settled: true, is_open: false })
      .eq('id', marketId);

    if (settleError) {
      alert('Failed marking market as settled.');
      return;
    }

    alert(`Market settled: ${market.title}`);

    adminWinningSelections[marketId] = null;

    await loadMarkets();
    await loadMyBets();
    await loadLeaderboard();
    await loadAdminMarkets();

    if (currentGuest) {
      const { data: refreshedGuest } = await supabaseClient
        .from('guests')
        .select('*')
        .eq('id', currentGuest.id)
        .single();

      if (refreshedGuest) {
        currentGuest = refreshedGuest;
        balanceDisplay.textContent = `${currentGuest.current_balance} K-Max Credits`;
      }
    }
  } catch (err) {
    alert('Unexpected settle error: ' + err.message);
  }
};

window.resetAllData = async function () {
  try {
    const confirmed = confirm(
      'Are you sure you want to reset everything? This will delete all bets, reset all balances to 150, and reopen all markets.'
    );
    if (!confirmed) return;

    const confirmedAgain = confirm(
      'Final confirmation: this cannot be undone. Reset all data?'
    );
    if (!confirmedAgain) return;

    const { error: deleteBetsError } = await supabaseClient
      .from('bets')
      .delete()
      .neq('id', 0);

    if (deleteBetsError) {
      alert('Failed to delete bets: ' + deleteBetsError.message);
      return;
    }

    const { error: resetGuestsError } = await supabaseClient
      .from('guests')
      .update({
        starting_balance: STARTING_BALANCE,
        current_balance: STARTING_BALANCE
      })
      .neq('id', 0);

    if (resetGuestsError) {
      alert('Failed to reset guest balances: ' + resetGuestsError.message);
      return;
    }

    const { error: resetSelectionsError } = await supabaseClient
      .from('selections')
      .update({
        result: 'pending'
      })
      .neq('id', 0);

    if (resetSelectionsError) {
      alert('Failed to reset selections: ' + resetSelectionsError.message);
      return;
    }

    const { error: resetMarketsError } = await supabaseClient
      .from('markets')
      .update({
        settled: false,
        is_open: true
      })
      .neq('id', 0);

    if (resetMarketsError) {
      alert('Failed to reset markets: ' + resetMarketsError.message);
      return;
    }

    if (currentGuest) {
      const { data: refreshedGuest } = await supabaseClient
        .from('guests')
        .select('*')
        .eq('id', currentGuest.id)
        .single();

      if (refreshedGuest) {
        currentGuest = refreshedGuest;
        balanceDisplay.textContent = `${currentGuest.current_balance} K-Max Credits`;
      }
    }

    adminWinningSelections = {};
    selectedOptions = {};

    alert('All data has been reset.');

    await loadMarkets();
    await loadMyBets();
    await loadLeaderboard();
    await loadAdminMarkets();
  } catch (err) {
    alert('Unexpected reset error: ' + err.message);
  }
};

debug('App script loaded');
restoreGuest();
