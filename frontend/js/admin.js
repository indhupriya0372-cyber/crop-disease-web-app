/* ============================================================
   AgriCare AI — Admin panel
   Admins see every farmer's leaf photo + result, can review /
   annotate / correct a record, and manage user accounts.
   ============================================================ */

(function () {
  'use strict';

  var Auth = window.AgriCareAuth;
  var API_BASE = (Auth && Auth.API_BASE) || 'http://127.0.0.1:5001';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function assetUrl(path) {
    if (!path) return path;
    var base = path.startsWith('http') ? path : API_BASE + path;
    var token = Auth && Auth.getToken();
    if (!token) return base;
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(token);
  }

  async function get(url) {
    var result = await Auth.api(url);
    if (result.status === 401 || result.status === 403) {
      window.location.href = 'login.html';
    }
    return result.json;
  }

  async function send(url, method, body) {
    var result = await Auth.api(url, {
      method: method,
      body: body == null ? undefined : body
    });
    if (result.status === 401 || result.status === 403) {
      window.location.href = 'login.html';
    }
    return result.json;
  }

  var post = function (url, body) { return send(url, 'POST', body); };

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString();
  }

  function levelPill(level) {
    return '<span class="pill ' + (level === 'healthy' ? 'healthy' : level === 'severe' ? 'severe' : 'warning') + '">' + esc(level || '') + '</span>';
  }

  /* ---------- Stats ---------- */
  function loadStats() {
    get('/api/admin/stats').then(function (s) {
      if (!s || s.error) return;
      document.getElementById('admUsers').textContent = s.users;
      document.getElementById('admFarmers').textContent = s.farmers;
      document.getElementById('admPredictions').textContent = s.predictions;
      document.getElementById('admConf').textContent = s.avg_confidence != null ? Math.round(s.avg_confidence * 100) + '%' : '—';
      renderCrops(s.by_crop || [], s.predictions);
    });
  }

  function renderCrops(crops, total) {
    var box = document.getElementById('cropBreakdown');
    if (!crops.length) { box.innerHTML = '<p class="table-empty">No predictions recorded yet.</p>'; return; }
    box.innerHTML = crops.map(function (c) {
      var pct = total ? Math.round((c.count / total) * 100) : 0;
      return '<div class="crop-row">' +
        '<span class="crop-name">' + esc(c.crop || 'Unknown') + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="crop-count">' + c.count + '</span>' +
        '</div>';
    }).join('');
  }

  /* ---------- Predictions (with photo, review + edit) ---------- */
  var items = [];

  function loadPredictions() {
    get('/api/admin/predictions').then(function (data) {
      items = (data && data.predictions) || [];
      var body = document.getElementById('adminPredBody');
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="8" class="table-empty">No predictions yet.</td></tr>';
        return;
      }
      body.innerHTML = items.map(function (i) {
        var photo = i.image_url
          ? '<img class="adm-thumb" src="' + esc(assetUrl(i.image_url)) + '" alt="leaf uploaded by ' + esc(i.user_name || 'farmer') + '" loading="lazy">'
          : '<span class="adm-thumb adm-thumb-empty">no photo</span>';
        var diseaseCell = i.reviewed
          ? '<strong>' + esc(i.disease || '—') + '</strong>'
          : '<span class="adm-unverified">' + esc(i.disease || '—') + '</span>';
        return '<tr data-id="' + i.id + '">' +
          '<td class="adm-photo-cell">' + photo + '</td>' +
          '<td>' + esc(fmtDate(i.created_at)) + '</td>' +
          '<td>' + esc(i.user_name || 'Guest') + '<br><span class="adm-muted">' + esc(i.user_email || '') + '</span></td>' +
          '<td>' + esc(i.crop || '—') + '</td>' +
          '<td>' + diseaseCell + '</td>' +
          '<td>' + levelPill(i.level) + '</td>' +
          '<td><strong>' + Math.round((i.confidence || 0) * 100) + '%</strong></td>' +
          '<td class="adm-actions">' +
            '<button class="link-btn" data-review="' + i.id + '" title="Toggle reviewed">' + (i.reviewed ? '✅' : '⬜') + '</button>' +
            '<button class="link-btn" data-note="' + i.id + '" title="Add note">✎</button>' +
            '<button class="link-btn link-danger" data-del="' + i.id + '" title="Delete record">🗑</button>' +
          '</td>' +
          '</tr>' +
          (i.notes ? '<tr class="adm-note-row"><td colspan="8">📝 ' + esc(i.notes) + '</td></tr>' : '');
      }).join('');
      bindRowActions();
    });
  }

  function bindRowActions() {
    document.querySelectorAll('[data-review]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-review');
        var item = items.filter(function (x) { return String(x.id) === id; })[0];
        if (!item) return;
        send('/api/admin/predictions/' + id, 'PATCH', { reviewed: !item.reviewed })
          .then(loadPredictions);
      });
    });

    document.querySelectorAll('[data-note]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-note');
        var item = items.filter(function (x) { return String(x.id) === id; })[0];
        if (!item) return;
        var note = window.prompt('Admin note for #' + id + ' (' + (item.disease || 'record') + '):', item.notes || '');
        if (note === null) return;
        send('/api/admin/predictions/' + id, 'PATCH', { notes: note }).then(loadPredictions);
      });
    });

    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del');
        if (!window.confirm('Delete record #' + id + ' and its photo?')) return;
        send('/api/admin/predictions/' + id, 'DELETE')
          .then(function () { loadPredictions(); loadStats(); });
      });
    });
  }

  /* ---------- Users ---------- */
  function loadUsers() {
    get('/api/admin/users').then(function (data) {
      var list = (data && data.users) || [];
      var body = document.getElementById('adminUsersBody');
      body.innerHTML = list.map(function (u) {
        return '<tr>' +
          '<td>' + u.id + '</td>' +
          '<td>' + esc(u.name) + '</td>' +
          '<td>' + esc(u.email) + '</td>' +
          '<td><span class="pill ' + (u.role === 'admin' ? 'severe' : 'healthy') + '">' + esc(u.role) + '</span></td>' +
          '<td>' + u.predictions + '</td>' +
          '<td>' + esc(fmtDate(u.created_at)) + '</td>' +
          '<td><button class="link-danger" data-del="' + u.id + '">Delete</button></td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="7" class="table-empty">No users.</td></tr>';

      body.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-del');
          if (!window.confirm('Delete this user and all their predictions?')) return;
          send('/api/admin/users/' + id, 'DELETE')
            .then(function () { loadUsers(); loadStats(); loadPredictions(); });
        });
      });
    });
  }

  function initCreateUser() {
    var form = document.getElementById('createUserForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = document.getElementById('cuStatus');
      var body = {
        name: document.getElementById('cuName').value.trim(),
        email: document.getElementById('cuEmail').value.trim(),
        password: document.getElementById('cuPassword').value,
        role: document.getElementById('cuRole').value
      };
      post('/api/admin/users', body).then(function (r) {
        if (r.error) {
          status.textContent = r.error;
          status.className = 'form-status err';
          return;
        }
        status.textContent = '✅ User created.';
        status.className = 'form-status ok';
        form.reset();
        loadUsers();
        loadStats();
      });
    });
  }

  /* ---------- Tabs ---------- */
  function initTabs() {
    document.querySelectorAll('.admin-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.admin-panel').forEach(function (p) { p.classList.add('hidden'); });
        tab.classList.add('active');
        document.getElementById(tab.getAttribute('data-panel')).classList.remove('hidden');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.AgriCareAuth) return;
    window.AgriCareAuth.me().then(function (u) {
      if (!u || u.role !== 'admin') {
        window.location.href = 'login.html';
        return;
      }
      initTabs();
      initCreateUser();
      loadStats();
      loadPredictions();
      loadUsers();
      var refresh = document.getElementById('refreshAdmin');
      if (refresh) refresh.addEventListener('click', function () {
        loadStats(); loadPredictions(); loadUsers();
      });
    });
  });
})();
