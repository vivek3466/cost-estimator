// Centralized Application State
let state = {
  employees: [],
  teams: [],
  hours: {}, // Stores active hour inputs as { employeeId: hoursValue }
  profitMargin: 30, // Custom profit percentage
  profitModel: 'markup', // 'markup' | 'margin'
  activeFilter: 'team-all', // 'team-all' | 'all' | 'team-{id}'
  activeTab: 'calculator', // 'calculator' | 'employees' | 'teams'
  monthlyBaselineHours: 160 // Global setting for monthly baseline working hours
};

// Preset colors for employee avatars
const PRESET_COLORS = ['#4facde', '#b48af7', '#5dd6a8', '#f7a05d', '#ff6b6b', '#f06292', '#aed581', '#4db6ac'];

// Default database templates on clean load (using Monthly Salary instead of Hourly Rate)
// Vivek: ₹12,000/mo (₹75/hr derived)
// Dhruv: ₹30,000/mo (₹187.50/hr derived)
// Mitisha: ₹12,000/mo (₹75/hr derived)
// Shweta: ₹24,800/mo (₹155/hr derived)
const DEFAULT_EMPLOYEES = [
  { id: 'emp-vivek', name: 'Vivek', role: 'Handling', salary: 12000, color: '#4facde', initials: 'VK' },
  { id: 'emp-dhruv', name: 'Dhruv', role: 'Senior dev', salary: 30000, color: '#b48af7', initials: 'DH' },
  { id: 'emp-mitisha', name: 'Mitisha', role: 'Junior dev', salary: 12000, color: '#5dd6a8', initials: 'MT' },
  { id: 'emp-shweta', name: 'Shweta', role: 'UI/UX designer', salary: 24800, color: '#f7a05d', initials: 'SW' }
];

const DEFAULT_TEAMS = [
  { id: 'team-all', name: 'Full Team', memberIds: ['emp-vivek', 'emp-dhruv', 'emp-mitisha', 'emp-shweta'] }
];

// Initialize application on load
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initListeners();
  renderAll();
});

// Load state from localStorage or populate default data
function loadState() {
  const local = localStorage.getItem('cost_estimator_dashboard_state');
  if (local) {
    try {
      state = JSON.parse(local);
      // Ensure defaults if keys are missing
      if (!state.employees) state.employees = [];
      if (!state.teams) state.teams = [];
      if (!state.hours) state.hours = {};
      if (state.profitMargin === undefined) state.profitMargin = 30;
      if (!state.profitModel) state.profitModel = 'markup';
      if (!state.activeFilter) state.activeFilter = 'all';
      if (!state.activeTab) state.activeTab = 'calculator';
      if (state.monthlyBaselineHours === undefined) state.monthlyBaselineHours = 160;
    } catch (e) {
      console.error('Failed parsing state, resetting to defaults.', e);
      loadDefaults();
    }
  } else {
    loadDefaults();
  }
}

function loadDefaults() {
  state.employees = [...DEFAULT_EMPLOYEES];
  state.teams = [...DEFAULT_TEAMS];
  state.hours = {};
  state.profitMargin = 30;
  state.profitModel = 'markup';
  state.activeFilter = 'team-all';
  state.activeTab = 'calculator';
  state.monthlyBaselineHours = 160;
  saveState();
}

function saveState() {
  localStorage.setItem('cost_estimator_dashboard_state', JSON.stringify(state));
}

// Derived hourly rate calculation helper
function getHourlyRate(emp) {
  const baseline = parseInt(state.monthlyBaselineHours) || 160;
  return emp.salary / baseline;
}

// Global Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚡'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  // Slide out after 3.2 seconds
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, 3200);
}

// Hook up DOM listeners
function initListeners() {
  // Navigation Tabs switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });

  // Profit Margin Slider & Input Sync
  const slider = document.getElementById('profit-slider');
  const numInput = document.getElementById('profit-input');

  slider.addEventListener('input', (e) => {
    state.profitMargin = parseInt(e.target.value) || 0;
    numInput.value = state.profitMargin;
    calc();
    saveState();
  });

  numInput.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 100 && state.profitModel === 'margin') val = 99; // Cap margin model at 99% to avoid division by zero
    state.profitMargin = val;
    slider.value = val;
    calc();
    saveState();
  });

  // Math toggler (Markup vs Margin)
  document.querySelectorAll('.math-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.math-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.profitModel = btn.dataset.model;
      
      // Safety limit check
      if (state.profitModel === 'margin' && state.profitMargin >= 100) {
        state.profitMargin = 95;
        document.getElementById('profit-slider').value = 95;
        document.getElementById('profit-input').value = 95;
      }
      
      calc();
      saveState();
    });
  });

  // Dynamic selector event for cost estimation filters
  document.getElementById('team-filter-select').addEventListener('change', (e) => {
    state.activeFilter = e.target.value;
    renderEstimatorInputs();
    calc();
    saveState();
  });

  // Baseline hours setting sync
  const baselineInput = document.getElementById('baseline-hours');
  if (baselineInput) {
    baselineInput.addEventListener('input', (e) => {
      let val = parseInt(e.target.value);
      if (isNaN(val) || val <= 0) val = 160;
      state.monthlyBaselineHours = val;
      saveState();
      calc();
      renderEstimatorInputs();
    });
  }

  // Employee Salary Input Real-time Preview Listener
  const salaryInput = document.getElementById('emp-salary');
  const previewEl = document.getElementById('salary-preview-label');
  if (salaryInput && previewEl) {
    salaryInput.addEventListener('input', (e) => {
      const salary = parseFloat(e.target.value) || 0;
      const baseline = parseInt(state.monthlyBaselineHours) || 160;
      const derived = salary / baseline;
      previewEl.textContent = `(Derived hourly rate: ${fmt(derived)}/hr)`;
    });
  }

  // Backup Trigger
  document.getElementById('btn-export').addEventListener('click', exportBackup);
  
  // Restore Trigger
  const fileInput = document.getElementById('restore-file-input');
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', importBackup);
}

// Switch between dashboard view tabs
function switchTab(tabName) {
  state.activeTab = tabName;
  
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
  
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`${tabName}-panel`).classList.add('active');
  
  saveState();
  renderTabContent(tabName);
}

function renderAll() {
  // Sync active Navigation items
  switchTab(state.activeTab);
  
  // Set mathematical toggle state
  document.querySelectorAll('.math-toggle-btn').forEach(b => {
    if (b.dataset.model === state.profitModel) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Populates selector dropdown options based on latest team lists
  syncTeamFilterDropdown();

  // Populate numeric controls
  document.getElementById('profit-slider').value = state.profitMargin;
  document.getElementById('profit-input').value = state.profitMargin;
  
  // Populate baseline hours input
  const baselineInput = document.getElementById('baseline-hours');
  if (baselineInput) {
    baselineInput.value = state.monthlyBaselineHours || 160;
  }
}

function renderTabContent(tabName) {
  if (tabName === 'calculator') {
    syncTeamFilterDropdown();
    renderEstimatorInputs();
    calc();
  } else if (tabName === 'employees') {
    renderEmployeesTab();
  } else if (tabName === 'teams') {
    renderTeamsTab();
  }
}

// Sync the dropdown selectors on Estimator view
function syncTeamFilterDropdown() {
  const select = document.getElementById('team-filter-select');
  const prevVal = state.activeFilter;
  
  select.innerHTML = `
    <option value="all">Individual selection (All)</option>
  `;
  
  state.teams.forEach(team => {
    select.innerHTML += `
      <option value="team-${team.id}">Team: ${team.name}</option>
    `;
  });

  // Check if previous selected filter still exists, otherwise default to all
  if ([...state.teams.map(t => 'team-' + t.id), 'all'].includes(prevVal)) {
    select.value = prevVal;
    state.activeFilter = prevVal;
  } else {
    select.value = 'all';
    state.activeFilter = 'all';
  }
}

// Helper: Format Rupee currencies with commas
function fmt(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

// Render dynamic user cards for estimator hour input
function renderEstimatorInputs() {
  const container = document.getElementById('estimator-cards-container');
  container.innerHTML = '';

  let activeEmployees = [];

  if (state.activeFilter === 'all') {
    activeEmployees = state.employees;
  } else if (state.activeFilter.startsWith('team-')) {
    const teamId = state.activeFilter.replace('team-', '');
    const team = state.teams.find(t => t.id === teamId);
    if (team) {
      activeEmployees = state.employees.filter(emp => team.memberIds.includes(emp.id));
    } else {
      activeEmployees = state.employees;
    }
  }

  if (activeEmployees.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">👥</div>
        <h3>No active team members</h3>
        <p>Go to the Employees Directory tab to register members or select another team filter.</p>
      </div>
    `;
    return;
  }

  activeEmployees.forEach(emp => {
    const card = document.createElement('div');
    card.className = 'member-card';
    card.style.borderLeft = `4px solid ${emp.color}`;
    
    // Check if hours were input previously
    const hrsVal = state.hours[emp.id] !== undefined ? state.hours[emp.id] : '';
    const derivedRate = getHourlyRate(emp);

    card.innerHTML = `
      <div class="avatar" style="background: ${emp.color}15; color: ${emp.color}; border: 1px solid ${emp.color}25">
        ${emp.initials || getInitials(emp.name)}
      </div>
      <div class="member-info">
        <div class="member-name">${emp.name}</div>
        <div class="member-role">${emp.role} · ${fmt(emp.salary)}/mo (${fmt(derivedRate)}/hr)</div>
      </div>
      <div class="input-wrap">
        <input type="number" id="h-${emp.id}" min="0" placeholder="0" value="${hrsVal}" oninput="updateMemberHours('${emp.id}', this.value)" />
        <span class="hrs-lbl">hrs</span>
      </div>
      <div class="member-cost" id="c-${emp.id}">₹0</div>
    `;
    container.appendChild(card);
  });
}

// Handle inputs dynamic states inside inputs
window.updateMemberHours = function(empId, value) {
  const hrs = parseFloat(value);
  if (isNaN(hrs) || hrs < 0) {
    delete state.hours[empId];
  } else {
    state.hours[empId] = hrs;
  }
  saveState();
  calc();
};

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Main Calculator Engine
function calc() {
  let rawTotal = 0;
  let totalHours = 0;
  const activeCosts = {};
  
  // Calculate raw team costs based on hours
  state.employees.forEach(emp => {
    const hrs = state.hours[emp.id] || 0;
    const rate = getHourlyRate(emp);
    const cost = hrs * rate;
    activeCosts[emp.id] = cost;
    rawTotal += cost;
    totalHours += hrs;

    // Live update individual card displays if present in estimator
    const costEl = document.getElementById(`c-${emp.id}`);
    if (costEl) costEl.textContent = fmt(cost);
  });

  // Calculate Profit + Client Quote based on model selection
  let profit = 0;
  let clientQuote = 0;

  if (state.profitModel === 'markup') {
    profit = rawTotal * (state.profitMargin / 100);
    clientQuote = rawTotal + profit;
  } else if (state.profitModel === 'margin') {
    const pct = state.profitMargin / 100;
    if (pct >= 1) {
      clientQuote = rawTotal; // Safety fallback
      profit = 0;
    } else {
      clientQuote = rawTotal / (1 - pct);
      profit = clientQuote - rawTotal;
    }
  }

  // Update DOM summaries
  document.getElementById('s-hours').textContent = `${totalHours} hrs`;
  document.getElementById('s-raw').textContent = fmt(rawTotal);
  document.getElementById('s-profit').textContent = fmt(profit);
  document.getElementById('s-total').textContent = fmt(clientQuote);

  // Rebuild the dynamic Flex progress segments
  updateBreakdownBar(rawTotal, profit, activeCosts);
}

// Update the progress breakdown flex segment nodes
function updateBreakdownBar(rawTotal, profit, activeCosts) {
  const bar = document.getElementById('breakdown-bar');
  const legend = document.getElementById('bar-legend');
  
  bar.innerHTML = '';
  legend.innerHTML = '';

  const grandTotal = rawTotal + profit;
  if (grandTotal === 0) {
    bar.style.display = 'none';
    legend.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  legend.style.display = 'flex';

  // Render Employee cost blocks
  state.employees.forEach(emp => {
    const cost = activeCosts[emp.id] || 0;
    if (cost > 0) {
      const seg = document.createElement('div');
      seg.className = 'bar-seg';
      seg.style.flex = cost;
      seg.style.backgroundColor = emp.color;
      seg.title = `${emp.name}: ${fmt(cost)} (${Math.round((cost / grandTotal) * 100)}%)`;
      bar.appendChild(seg);

      // Append legend
      const legItem = document.createElement('div');
      legItem.className = 'legend-item';
      legItem.innerHTML = `
        <div class="legend-dot" style="background: ${emp.color}"></div>
        <span>${emp.name} (${Math.round((cost / grandTotal) * 100)}%)</span>
      `;
      legend.appendChild(legItem);
    }
  });

  // Render Profit block
  if (profit > 0) {
    const seg = document.createElement('div');
    seg.className = 'bar-seg profit';
    seg.style.flex = profit;
    seg.style.backgroundColor = 'var(--accent)';
    seg.title = `Profit Margin: ${fmt(profit)} (${Math.round((profit / grandTotal) * 100)}%)`;
    bar.appendChild(seg);

    // Append profit legend item
    const legItem = document.createElement('div');
    legItem.className = 'legend-item';
    legItem.innerHTML = `
      <div class="legend-dot" style="background: var(--accent)"></div>
      <span>Profit (${Math.round((profit / grandTotal) * 100)}%)</span>
    `;
    legend.appendChild(legItem);
  }
}

// Dynamic reset calculator hours (resets active scope/estimate hours only)
window.resetCalculator = function() {
  let activeEmployees = [];
  if (state.activeFilter === 'all') {
    activeEmployees = state.employees;
  } else if (state.activeFilter.startsWith('team-')) {
    const teamId = state.activeFilter.replace('team-', '');
    const team = state.teams.find(t => t.id === teamId);
    if (team) {
      activeEmployees = state.employees.filter(emp => team.memberIds.includes(emp.id));
    } else {
      activeEmployees = state.employees;
    }
  }

  activeEmployees.forEach(emp => {
    delete state.hours[emp.id];
  });

  saveState();
  renderEstimatorInputs();
  calc();
  showToast('Cleared hours for current active estimate!');
};

// Factory database reset (restores original 4 employees & team)
window.resetDatabase = function() {
  if (confirm('Are you sure you want to reset the database to factory defaults? This will delete all custom employees and teams, and restore the default team.')) {
    loadDefaults();
    renderAll();
    showToast('Database reset to factory defaults!');
  }
};


// Clipboard Quote generator
window.copyQuoteSummary = function() {
  const activeEmployees = state.activeFilter === 'all' 
    ? state.employees 
    : state.employees.filter(emp => {
        const teamId = state.activeFilter.replace('team-', '');
        const team = state.teams.find(t => t.id === teamId);
        return team ? team.memberIds.includes(emp.id) : false;
      });

  const memberLines = activeEmployees.map(emp => {
    const hrs = state.hours[emp.id] || 0;
    if (hrs === 0) return null;
    const rate = getHourlyRate(emp);
    return `  ${emp.name} (${emp.role}): ${hrs} hrs @ ${fmt(rate)}/hr (Derived from ${fmt(emp.salary)}/mo) → ${fmt(hrs * rate)}`;
  }).filter(Boolean);

  if (memberLines.length === 0) {
    showToast('Add hours to generate a quote preview!', 'error');
    return;
  }

  const raw = document.getElementById('s-raw').textContent;
  const profit = document.getElementById('s-profit').textContent;
  const total = document.getElementById('s-total').textContent;
  const hours = document.getElementById('s-hours').textContent;
  const modeLabel = state.profitModel === 'margin' ? 'True Margin' : 'Markup';

  const text = [
    '── PROJECT COST ESTIMATE ──',
    ...memberLines,
    '',
    `Total Work Hours  : ${hours}`,
    `Raw Resource Cost : ${raw}`,
    `Profit (${state.profitMargin}% ${modeLabel}) : ${profit}`,
    `─────────────────────────`,
    `Client Quote      : ${total}`,
    `─────────────────────────`,
    `Generated via Cost Estimator Dashboard`
  ].join('\n');

  function showMsg() {
    const msg = document.getElementById('copied-msg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2500);
    showToast('Quote copied to clipboard!');
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(showMsg).catch(() => fallbackCopy(text, showMsg));
  } else {
    fallbackCopy(text, showMsg);
  }
};

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    cb();
  } catch(e) {
    alert(text);
  }
  document.body.removeChild(ta);
}


/* ==========================================================================
   👥 Tab 2: Employees Directory Actions
   ========================================================================== */

function renderEmployeesTab() {
  const container = document.getElementById('employees-list-container');
  container.innerHTML = '';

  if (state.employees.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">👤</div>
        <h3>No registered employees</h3>
        <p>Click "Add Employee" above to start populating your directory.</p>
      </div>
    `;
    return;
  }

  state.employees.forEach(emp => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.style.borderLeft = `4px solid ${emp.color}`;
    
    const derivedRate = getHourlyRate(emp);

    div.innerHTML = `
      <div class="list-item-left">
        <div class="avatar" style="background: ${emp.color}15; color: ${emp.color}; border: 1px solid ${emp.color}25">
          ${emp.initials || getInitials(emp.name)}
        </div>
        <div>
          <div class="member-name">${emp.name}</div>
          <div class="member-role">${emp.role}</div>
        </div>
      </div>
      <div class="list-item-right">
        <span class="badge">${fmt(emp.salary)}/mo (${fmt(derivedRate)}/hr)</span>
        <button class="btn-icon" onclick="openEditEmployeeForm('${emp.id}')" title="Edit Employee">✏️</button>
        <button class="btn-icon delete" onclick="deleteEmployee('${emp.id}')" title="Delete Employee">🗑️</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// Toggle visible Add employee form panel
window.toggleAddEmployeeForm = function() {
  const panel = document.getElementById('employee-form-panel');
  const title = document.getElementById('emp-form-title');
  const btn = document.getElementById('btn-add-emp-trigger');
  const previewEl = document.getElementById('salary-preview-label');
  
  if (panel.classList.contains('active') && !panel.dataset.editId) {
    panel.classList.remove('active');
    btn.textContent = '+ Add Employee';
  } else {
    // Reset inputs for clean insert
    panel.classList.add('active');
    panel.dataset.editId = '';
    title.textContent = 'Add New Employee';
    btn.textContent = '✕ Close Panel';
    
    document.getElementById('emp-name').value = '';
    document.getElementById('emp-role').value = '';
    document.getElementById('emp-salary').value = '';
    if (previewEl) previewEl.textContent = '';
    
    // Choose first color preset
    renderPresetColorSelector(PRESET_COLORS[0]);
  }
};

function renderPresetColorSelector(selectedColor) {
  const wrap = document.getElementById('emp-color-wrap');
  wrap.innerHTML = '';
  PRESET_COLORS.forEach(color => {
    const dot = document.createElement('div');
    dot.className = `color-option ${color === selectedColor ? 'selected' : ''}`;
    dot.style.backgroundColor = color;
    dot.onclick = () => {
      document.querySelectorAll('.color-option').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
    };
    wrap.appendChild(dot);
  });
}

// Add/Save employee submission
window.submitEmployeeForm = function() {
  const name = document.getElementById('emp-name').value.trim();
  const role = document.getElementById('emp-role').value.trim();
  const salary = parseFloat(document.getElementById('emp-salary').value);
  
  const selectedDot = document.querySelector('.color-option.selected');
  const color = selectedDot ? selectedDot.style.backgroundColor : PRESET_COLORS[0];

  if (!name || !role || isNaN(salary) || salary <= 0) {
    showToast('Please fill all fields with correct values.', 'error');
    return;
  }

  const panel = document.getElementById('employee-form-panel');
  const editId = panel.dataset.editId;

  if (editId) {
    // EDIT MODE
    const emp = state.employees.find(e => e.id === editId);
    if (emp) {
      emp.name = name;
      emp.role = role;
      emp.salary = salary;
      emp.color = color;
      emp.initials = getInitials(name);
      showToast(`Updated employee details for ${name}!`);
    }
  } else {
    // CREATE MODE
    const newEmp = {
      id: 'emp-' + Date.now(),
      name,
      role,
      salary,
      color,
      initials: getInitials(name)
    };
    state.employees.push(newEmp);
    showToast(`Registered new employee ${name}!`);
  }

  saveState();
  toggleAddEmployeeForm();
  renderEmployeesTab();
};

window.openEditEmployeeForm = function(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  const panel = document.getElementById('employee-form-panel');
  const title = document.getElementById('emp-form-title');
  const btn = document.getElementById('btn-add-emp-trigger');
  const previewEl = document.getElementById('salary-preview-label');

  panel.classList.add('active');
  panel.dataset.editId = empId;
  title.textContent = `Edit Employee: ${emp.name}`;
  btn.textContent = '✕ Close Panel';

  document.getElementById('emp-name').value = emp.name;
  document.getElementById('emp-role').value = emp.role;
  document.getElementById('emp-salary').value = emp.salary;
  
  const baseline = parseInt(state.monthlyBaselineHours) || 160;
  const derived = emp.salary / baseline;
  if (previewEl) {
    previewEl.textContent = `(Derived hourly rate: ${fmt(derived)}/hr)`;
  }

  renderPresetColorSelector(emp.color);
};

window.deleteEmployee = function(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  if (confirm(`Are you sure you want to delete employee ${emp.name}? This will remove them from calculations and all created teams.`)) {
    // 1. Remove from employees list
    state.employees = state.employees.filter(e => e.id !== empId);
    
    // 2. Remove from teams members list
    state.teams.forEach(team => {
      team.memberIds = team.memberIds.filter(id => id !== empId);
    });

    // 3. Delete their hour records
    delete state.hours[empId];

    saveState();
    renderEmployeesTab();
    showToast(`Removed employee ${emp.name}.`);
  }
};


/* ==========================================================================
   👥 Tab 3: Teams Management Actions
   ========================================================================== */

function renderTeamsTab() {
  const container = document.getElementById('teams-list-container');
  container.innerHTML = '';

  if (state.teams.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">💼</div>
        <h3>No custom teams configured</h3>
        <p>Use the "Create Team" action panel above to group your employees together.</p>
      </div>
    `;
    return;
  }

  state.teams.forEach(team => {
    // Calculate Team stats (total members, average salary, average hourly rate)
    const membersCount = team.memberIds.length;
    const teamMembers = state.employees.filter(e => team.memberIds.includes(e.id));
    
    const avgSalary = membersCount > 0 
      ? teamMembers.reduce((acc, m) => acc + m.salary, 0) / membersCount 
      : 0;

    const avgRate = membersCount > 0 
      ? teamMembers.reduce((acc, m) => acc + getHourlyRate(m), 0) / membersCount 
      : 0;

    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class="list-item-left">
        <div>
          <div class="member-name">${team.name}</div>
          <div class="member-role">${membersCount} members assigned · Avg salary ${fmt(avgSalary)}/mo (${fmt(avgRate)}/hr)</div>
        </div>
      </div>
      <div class="list-item-right">
        <button class="btn-icon" onclick="openEditTeamForm('${team.id}')" title="Edit Team">✏️</button>
        <button class="btn-icon delete" onclick="deleteTeam('${team.id}')" title="Delete Team">🗑️</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// Add checkboxes for team creations based on active employee list
function renderTeamFormCheckboxes() {
  const container = document.getElementById('team-members-checkboxes');
  container.innerHTML = '';

  if (state.employees.length === 0) {
    container.innerHTML = '<span style="font-size:12px; color:var(--text-muted)">Register employees first in order to assign them.</span>';
    return;
  }

  state.employees.forEach(emp => {
    const lbl = document.createElement('label');
    lbl.className = 'checkbox-label';
    lbl.innerHTML = `
      <input type="checkbox" name="team-emp" value="${emp.id}" />
      <span>${emp.name} (${emp.role})</span>
    `;
    container.appendChild(lbl);
  });
}

window.toggleAddTeamForm = function() {
  const panel = document.getElementById('team-form-panel');
  const title = document.getElementById('team-form-title');
  const btn = document.getElementById('btn-add-team-trigger');
  
  if (panel.classList.contains('active') && !panel.dataset.editId) {
    panel.classList.remove('active');
    btn.textContent = '+ Create New Team';
  } else {
    panel.classList.add('active');
    panel.dataset.editId = '';
    title.textContent = 'Create New Team';
    btn.textContent = '✕ Close Panel';
    
    document.getElementById('team-name').value = '';
    renderTeamFormCheckboxes();
  }
};

window.submitTeamForm = function() {
  const name = document.getElementById('team-name').value.trim();
  const checkboxes = document.querySelectorAll('input[name="team-emp"]:checked');
  const memberIds = Array.from(checkboxes).map(cb => cb.value);

  if (!name) {
    showToast('Please enter a team name.', 'error');
    return;
  }

  if (memberIds.length === 0) {
    showToast('Please select at least one team member.', 'error');
    return;
  }

  const panel = document.getElementById('team-form-panel');
  const editId = panel.dataset.editId;

  if (editId) {
    // EDIT
    const team = state.teams.find(t => t.id === editId);
    if (team) {
      team.name = name;
      team.memberIds = memberIds;
      showToast(`Updated details for team: ${name}!`);
    }
  } else {
    // CREATE
    const newTeam = {
      id: 'team-' + Date.now(),
      name,
      memberIds
    };
    state.teams.push(newTeam);
    showToast(`Successfully created team: ${name}!`);
  }

  saveState();
  toggleAddTeamForm();
  renderTeamsTab();
};

window.openEditTeamForm = function(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;

  const panel = document.getElementById('team-form-panel');
  const title = document.getElementById('team-form-title');
  const btn = document.getElementById('btn-add-team-trigger');

  panel.classList.add('active');
  panel.dataset.editId = teamId;
  title.textContent = `Edit Team: ${team.name}`;
  btn.textContent = '✕ Close Panel';

  document.getElementById('team-name').value = team.name;

  // Build checkboxes, checking active members
  renderTeamFormCheckboxes();
  
  // Toggle checkmarks
  team.memberIds.forEach(id => {
    const cb = document.querySelector(`input[name="team-emp"][value="${id}"]`);
    if (cb) cb.checked = true;
  });
};

window.deleteTeam = function(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;

  if (confirm(`Are you sure you want to delete team: ${team.name}? Members will NOT be deleted, only the team grouping will be removed.`)) {
    state.teams = state.teams.filter(t => t.id !== teamId);
    
    // If the deleted team was the active calculator filter, reset filter
    if (state.activeFilter === 'team-' + teamId) {
      state.activeFilter = 'all';
    }

    saveState();
    renderTeamsTab();
    showToast(`Removed team configuration for: ${team.name}`);
  }
};


/* ==========================================================================
   📤 Backup Data & Portability (JSON System)
   ========================================================================== */

function exportBackup() {
  const blobData = JSON.stringify(state, null, 2);
  const blob = new Blob([blobData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  // Format Date for filename
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  const a = document.createElement('a');
  a.href = url;
  a.download = `cost-estimator-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  showToast('Database exported successfully as JSON file!');
  
  // Auto-open manual text backup as reliable fallback
  toggleManualBackup();
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      
      // Safety key validation checks to protect client database schema integrity
      if (!parsed.employees || !Array.isArray(parsed.employees)) {
        throw new Error('Missing or corrupt "employees" directory records.');
      }
      if (!parsed.teams || !Array.isArray(parsed.teams)) {
        throw new Error('Missing or corrupt custom "teams" array key.');
      }

      // Restructure successfully validated JSON back into global scope state
      state = parsed;
      if (!state.monthlyBaselineHours) state.monthlyBaselineHours = 160;

      saveState();
      renderAll();
      showToast('Database restored successfully from backup JSON!');
    } catch (err) {
      showToast(`Restore Failed: ${err.message}`, 'error');
      console.error('Backup recovery error:', err);
    }
    // Clean up input value
    e.target.value = '';
  };
  reader.readAsText(file);
}

// Fallback Manual Backup & Copy Paste Text Panel
window.toggleManualBackup = function() {
  const panel = document.getElementById('manual-backup-panel');
  panel.classList.toggle('active');
  if (panel.classList.contains('active')) {
    document.getElementById('manual-backup-text').value = JSON.stringify(state, null, 2);
  }
};

window.copyManualBackup = function() {
  const txt = document.getElementById('manual-backup-text');
  txt.select();
  try {
    document.execCommand('copy');
    showToast('Backup JSON copied to clipboard!');
  } catch (err) {
    showToast('Select text box content and copy manually.', 'error');
  }
};

window.restoreManualBackup = function() {
  const txt = document.getElementById('manual-backup-text').value.trim();
  if (!txt) {
    showToast('Please paste a valid JSON backup string first.', 'error');
    return;
  }
  try {
    const parsed = JSON.parse(txt);
    if (!parsed.employees || !Array.isArray(parsed.employees)) {
      throw new Error('Missing or corrupt "employees" directory records.');
    }
    if (!parsed.teams || !Array.isArray(parsed.teams)) {
      throw new Error('Missing or corrupt custom "teams" array key.');
    }

    state = parsed;
    if (!state.monthlyBaselineHours) state.monthlyBaselineHours = 160;

    saveState();
    renderAll();
    showToast('Database restored successfully from pasted JSON!');
    document.getElementById('manual-backup-panel').classList.remove('active');
  } catch (err) {
    showToast(`Restore Failed: ${err.message}`, 'error');
  }
};
