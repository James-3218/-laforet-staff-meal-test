/* ============================================
   LAFORÊT — admin_script.js
   Admin meal list page
   ============================================ */

/* ════════════════════════════════════════════
   LOCAL STAFF MANAGEMENT (extra/deleted)
   Still uses localStorage for the staff list
   itself — only meal *choices* go to Sheets.
   ════════════════════════════════════════════ */

function normalizeName(value) {
  return value.toLowerCase().replace(/\s+/g, '').trim();
}

/* All active staff = base staffNames + extra from Sheets, minus deleted */
function getActiveStaffNames() {
  // staffNames and staffDepartments are already updated by loadExtraStaff()
  // which runs in initAdminPage → they already exclude deleted and include extra
  return [...staffNames];
}

function getAllDepartments() {
  return { ...staffDepartments };
}

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */

async function initAdminPage() {
  // Load staff list from Sheets (merges extra/deleted into live arrays)
  await loadExtraStaff();

  const { sat, sun } = getWeekendDates();
  document.getElementById('adminSatDate').textContent  = sat;
  document.getElementById('adminSunDate').textContent  = sun;
  document.getElementById('adminDatesBadge').textContent = `${sat} — ${sun}`;

  await renderAdminLists();
}

/* ════════════════════════════════════════════
   MEAL APPLICATIONS — fetched from Sheets
   ════════════════════════════════════════════ */

// Cache so print doesn't need a second fetch
let _cachedApps = null;

async function getMealApplications() {
  const depts   = getAllDepartments();
  const deleted = []; // already excluded by loadExtraStaff

  let sheetsPrefs = [];
  try {
    const res = await gasRequest('getPrefs');
    sheetsPrefs = res.prefs || [];
  } catch(e) {
    console.warn('Laforêt admin: Could not fetch prefs:', e.message);
  }

  // Build map: normalizedName → pref
  const prefMap = {};
  sheetsPrefs.forEach(p => {
    prefMap[normalizeName(p.name)] = p;
  });

  // Build full list from active staff
  const apps = staffNames.map(name => {
    const p = prefMap[normalizeName(name)];
    return {
      name,
      dept: depts[name] || (p ? p.dept : '') || '',
      sat:  p ? p.sat  : null,
      sun:  p ? p.sun  : null,
      note: p ? (p.note || '') : ''
    };
  });

  apps.sort((a, b) => a.name.localeCompare(b.name));
  _cachedApps = apps;
  return apps;
}

async function renderAdminLists() {
  // Show loading state
  ['satList','sunList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="admin-empty">Loading…</div>';
  });

  const apps        = await getMealApplications();
  const satAttending = apps.filter(a => a.sat === true);
  const sunAttending = apps.filter(a => a.sun === true);

  renderDayList('sat', satAttending);
  renderDayList('sun', sunAttending);
  document.getElementById('satCountBadge').textContent = `${satAttending.length} attending`;
  document.getElementById('sunCountBadge').textContent = `${sunAttending.length} attending`;
}

function renderDayList(day, attendees) {
  const listEl = document.getElementById(`${day}List`);
  if (!listEl) return;
  if (!attendees.length) {
    listEl.innerHTML = '<div class="admin-empty">No responses yet</div>';
    return;
  }
  listEl.innerHTML = attendees.map((person, idx) => {
    const initials     = person.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const allergyLabel = person.note && person.note.trim() ? person.note.trim() : 'No allergy noted';
    const subLine      = `${person.dept || ''}${person.dept ? ' — ' : ''}Allergy: ${allergyLabel}`;
    return `
      <div class="admin-staff-row" style="animation-delay:${idx * 0.05}s;">
        <div class="admin-staff-num">${idx + 1}</div>
        <div class="admin-staff-avatar">${initials}</div>
        <div class="admin-staff-info">
          <div class="admin-staff-name">${person.name}</div>
          <div class="admin-staff-note">${subLine}</div>
        </div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════════
   STAFF LIST MODAL
   ════════════════════════════════════════════ */

// Holds all staff rows for client-side filtering
let _slAllStaff = [];

function openStaffListModal() {
  document.getElementById('staffListOverlay').classList.add('open');
  document.getElementById('slNameInput').value   = '';
  document.getElementById('slDeptInput').value   = '';
  document.getElementById('slSearchInput').value = '';
  _slShowMsg('', '');
  slBuildList();
  setTimeout(() => document.getElementById('slNameInput').focus(), 80);
}

function closeStaffListModal(event) {
  if (event && event.target !== document.getElementById('staffListOverlay')) return;
  document.getElementById('staffListOverlay').classList.remove('open');
}

/* Build the staff list from current live arrays */
function slBuildList() {
  const deptMap = getAllDepartments();
  _slAllStaff = getActiveStaffNames()
    .map(name => ({ name, dept: deptMap[name] || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  slRenderList(_slAllStaff);
}

/* Render rows (accepts filtered array) */
function slRenderList(staff) {
  const listEl  = document.getElementById('slList');
  const countEl = document.getElementById('slCount');
  if (!listEl) return;

  countEl.textContent = staff.length + ' staff member' + (staff.length !== 1 ? 's' : '');

  if (!staff.length) {
    listEl.innerHTML = '<div class="admin-empty">No staff found</div>';
    return;
  }

  listEl.innerHTML = staff.map(function(s, idx) {
    const initials = s.name.split(' ').map(function(w){ return w[0]; }).join('').slice(0, 2).toUpperCase();
    const safeName = s.name.replace(/'/g, "\\'");
    return '<div class="sl-staff-row" style="animation-delay:' + (idx * 0.03) + 's;">' +
      '<div class="sl-avatar">' + initials + '</div>' +
      '<div class="sl-info">' +
        '<div class="sl-name">' + s.name + '</div>' +
        '<div class="sl-dept">' + (s.dept || '—') + '</div>' +
      '</div>' +
      '<button class="sl-delete-btn" title="Remove ' + s.name + '" onclick="slDeleteStaff('' + safeName + '')">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
        '</svg>' +
      '</button>' +
    '</div>';
  }).join('');
}

/* Filter list by search input */
function slFilterList() {
  const val = (document.getElementById('slSearchInput').value || '').trim().toLowerCase();
  if (!val) { slRenderList(_slAllStaff); return; }
  const filtered = _slAllStaff.filter(function(s) {
    return s.name.toLowerCase().includes(val) || s.dept.toLowerCase().includes(val);
  });
  slRenderList(filtered);
}

/* Add staff */
async function slAddStaff() {
  const nameInput = document.getElementById('slNameInput');
  const deptInput = document.getElementById('slDeptInput');
  const name = nameInput.value.trim();
  const dept = deptInput.value.trim();

  if (!name) { _slShowMsg('Please enter a staff name', 'err'); nameInput.focus(); return; }
  if (!dept) { _slShowMsg('Please select a department', 'err'); deptInput.focus(); return; }

  const dupe = staffNames.find(function(n){ return normalizeName(n) === normalizeName(name); });
  if (dupe) { _slShowMsg('Staff already exists', 'err'); return; }

  try {
    await gasRequest('addStaff', { name, dept });
    staffNames.push(name);
    staffDepartments[name] = dept;
    nameInput.value = '';
    deptInput.value = '';
    _slShowMsg(name + ' added successfully', 'ok');
    slBuildList();
    await renderAdminLists();
  } catch(e) {
    _slShowMsg('Error: ' + e.message, 'err');
  }
}

/* Delete staff (called from row button) */
async function slDeleteStaff(name) {
  if (!confirm('Remove ' + name + ' from the staff list?\nTheir meal choices will also be deleted.')) return;

  const normalizedName = normalizeName(name);
  try {
    await gasRequest('deleteStaff', { name });
    const idx = staffNames.findIndex(function(n){ return normalizeName(n) === normalizedName; });
    if (idx >= 0) staffNames.splice(idx, 1);
    const deptKey = Object.keys(staffDepartments).find(function(k){ return normalizeName(k) === normalizedName; });
    if (deptKey) delete staffDepartments[deptKey];
    _slShowMsg(name + ' removed', 'ok');
    slBuildList();
    await renderAdminLists();
  } catch(e) {
    _slShowMsg('Error: ' + e.message, 'err');
  }
}

function _slShowMsg(text, type) {
  const el = document.getElementById('slMsg');
  if (!el) return;
  el.textContent = text;
  el.className = 'sl-msg' + (type === 'ok' ? ' visible-ok' : type === 'err' ? ' visible-err' : '');
  if (text) setTimeout(function(){ el.className = 'sl-msg'; }, 3500);
}

/* ════════════════════════════════════════════
   TEST RESET (admin button)
   ════════════════════════════════════════════ */

async function testWeeklyReset() {
  if (!confirm('Reset all Saturday/Sunday choices now?\nNotes, staff names, and departments will not be affected.')) return;
  try {
    await forceResetPreferences(); // defined in script.js
    await renderAdminLists();
    const { sat, sun } = getWeekendDates();
    document.getElementById('adminSatDate').textContent  = sat;
    document.getElementById('adminSunDate').textContent  = sun;
    document.getElementById('adminDatesBadge').textContent = `${sat} — ${sun}`;
    alert('Reset complete. All Saturday/Sunday meal choices have been cleared.');
  } catch(e) {
    alert('Reset failed: ' + e.message);
  }
}

/* ════════════════════════════════════════════
   PRINT
   ════════════════════════════════════════════ */

function printMealList(day) {
  // Use cached apps if available, otherwise fetch
  const doprint = (apps) => {
    const { sat, sun } = getWeekendDates();
    const sections = [];
    if (day === 'sat' || day === 'both') sections.push(buildPrintSection('Saturday', sat, apps.filter(a => a.sat === true)));
    if (day === 'sun' || day === 'both') sections.push(buildPrintSection('Sunday',   sun, apps.filter(a => a.sun === true)));
    const today = new Date().toLocaleDateString('en-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    document.getElementById('printSection').innerHTML = `
      <div class="print-doc-header">
        <div class="print-restaurant">La Forêt</div>
        <div class="print-title">Staff Meal List</div>
        <div class="print-date-line">Generated ${today}</div>
      </div>
      ${sections.join('')}
      <div class="print-footer">Laforêt · Staff Access Only · Confidential</div>`;
    window.print();
  };

  if (_cachedApps) {
    doprint(_cachedApps);
  } else {
    getMealApplications().then(doprint).catch(e => alert('Could not load data for printing: ' + e.message));
  }
}

function buildPrintSection(dayName, dateStr, people) {
  const rows = people.length
    ? people.map((p, i) => {
        const allergyText = p.note && p.note.trim() ? p.note.trim() : 'No allergy noted';
        const infoText    = `${p.dept || ''}${p.dept ? ' — ' : ''}Allergy: ${allergyText}`;
        return `<div class="print-staff-row">
          <div class="print-num">${i+1}.</div>
          <div class="print-line">
            <span class="print-name">${p.name}</span>
            <span class="print-dash"> — </span>
            <span class="print-note">${infoText}</span>
          </div>
        </div>`;
      }).join('')
    : '<div class="print-empty">No staff attending</div>';
  return `<div class="print-day-section">
    <div class="print-day-heading"><span>${dayName}</span><span class="print-day-count">${dateStr} · ${people.length} attending</span></div>
    ${rows}
  </div>`;
}
