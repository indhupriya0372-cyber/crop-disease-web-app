/*
  AgriCare AI — Authentication
  Farmer and Admin login using MongoDB and JWT
*/

(function () {
  "use strict";

  const API_BASE = "http://127.0.0.1:5001";

  const TOKEN_KEY = "agricare_jwt";

  let cachedUser = null;

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function saveToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    cachedUser = null;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(
      /[&<>"']/g,
      function (char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[char];
      }
    );
  }

  async function api(url, options = {}) {
    const headers = {
      ...(options.headers || {})
    };

    if (options.body &&
        typeof options.body === "object" &&
        !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }

    const token = getToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const endpoint = url.startsWith("http")
      ? url
      : API_BASE + url;

    const response = await fetch(endpoint, {
      ...options,
      headers
    });

    const json = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      json
    };
  }

  async function me() {
    if (cachedUser) {
      return cachedUser;
    }

    if (!getToken()) {
      return null;
    }

    try {
      const result = await api("/api/auth/me");

      if (result.ok && result.json.user) {
        cachedUser = result.json.user;
        return cachedUser;
      }

      if (result.status === 401) {
        clearToken();
      }

      return null;
    } catch (error) {
      console.error("Authentication check failed:", error);
      return null;
    }
  }

  function homeFor(role) {
    return role === "admin"
      ? "admin.html"
      : "diagnose.html";
  }

  function logout() {
    clearToken();
    window.location.href = "index.html";
  }

  function renderNav(user) {
    const navInner = document.querySelector(".nav-inner");

    const navLinks = document.getElementById("navLinks");

    if (!navInner || navInner.querySelector(".nav-auth")) {
      return;
    }

    const box = document.createElement("div");
    box.className = "nav-auth";

    if (user) {
      if (navLinks) {
        const link = document.createElement("a");

        link.href = homeFor(user.role);

        link.textContent = user.role === "admin"
          ? "Admin Panel"
          : "Diagnose Leaf";

        navLinks.appendChild(link);
      }

      const who = document.createElement("span");

      who.className = "nav-user";

      const firstName = String(user.name || "User")
        .split(" ")[0];

      who.innerHTML =
        "👋 <strong>" +
        escapeHtml(firstName) +
        "</strong>" +
        '<span class="nav-role">' +
        escapeHtml(user.role) +
        "</span>";

      const button = document.createElement("button");

      button.className = "btn btn-ghost btn-small";

      button.id = "navLogout";

      button.textContent = "Logout";

      button.addEventListener("click", logout);

      box.appendChild(who);
      box.appendChild(button);
    } else {
      const login = document.createElement("a");

      login.className = "btn btn-primary btn-small";

      login.href = "login.html";

      login.textContent = "🔐 Login";

      box.appendChild(login);
    }

    const toggle = navInner.querySelector(".nav-toggle");

    navInner.insertBefore(box, toggle || null);
  }

  function initAuthPage(user) {
    const form = document.getElementById("loginForm");

    // This function only drives the login/register page. The admin and
    // diagnose pages have their own role guards, so redirecting here as
    // well caused an endless reload loop (the page kept flickering).
    if (!form) {
      return;
    }

    if (user) {
      window.location.href = homeFor(user.role);
      return;
    }

    const tabLogin = document.getElementById("tabLogin");

    const tabRegister = document.getElementById("tabRegister");

    const roleSelect = document.getElementById("roleSelect");

    const submit = document.getElementById("authSubmit");

    const status = document.getElementById("authStatus");

    const nameInput = document.getElementById("authName");

    const emailInput = document.getElementById("authEmail");

    const passwordInput = document.getElementById("authPassword");

    let mode = "login";
    let role = "farmer";
    let submitting = false;

    function showStatus(message, type) {
      status.textContent = message;

      status.className = "form-status " + (type || "");
    }

    function applyMode() {
      tabLogin.classList.toggle(
        "active",
        mode === "login"
      );

      tabRegister.classList.toggle(
        "active",
        mode === "register"
      );

      document.querySelectorAll(".reg-only").forEach(
        function (element) {
          element.classList.toggle(
            "hidden",
            mode !== "register"
          );
        }
      );

      if (roleSelect) {
        roleSelect.style.display =
          mode === "login" ? "flex" : "none";
      }

      submit.textContent = mode === "login"
        ? "🔐 Login"
        : "🌱 Create account";

      passwordInput.autocomplete = mode === "login"
        ? "current-password"
        : "new-password";

      showStatus("", "");
    }

    tabLogin.addEventListener("click", function () {
      mode = "login";
      applyMode();
    });

    tabRegister.addEventListener("click", function () {
      mode = "register";
      applyMode();
    });

    document.querySelectorAll(".role-pill").forEach(
      function (pill) {
        pill.addEventListener("click", function () {
          document.querySelectorAll(".role-pill").forEach(
            function (item) {
              item.classList.remove("active");
            }
          );

          pill.classList.add("active");

          role = pill.getAttribute("data-role");
        });
      }
    );

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (submitting) {
        return;
      }

      const name = nameInput.value.trim();

      const email = emailInput.value.trim();

      const password = passwordInput.value;

      if (
        !email ||
        !password ||
        (mode === "register" && !name)
      ) {
        showStatus(
          "Please fill in all required fields.",
          "err"
        );
        return;
      }

      if (mode === "register" && password.length < 8) {
        showStatus(
          "Password must contain at least 8 characters.",
          "err"
        );
        return;
      }

      const endpoint = mode === "login"
        ? "/api/auth/login"
        : "/api/auth/register";

      const body = mode === "login"
        ? { email, password }
        : { name, email, password };

      submitting = true;
      submit.disabled = true;
      submit.textContent = "Please wait…";

      try {
        const result = await api(endpoint, {
          method: "POST",
          body
        });

        if (!result.ok) {
          showStatus(
            result.json.message ||
            result.json.error ||
            "Authentication failed. Please try again.",
            "err"
          );
          return;
        }

        const user = result.json.user;
        const token = result.json.token;

        if (!user || !token) {
          showStatus(
            "Invalid authentication response.",
            "err"
          );
          return;
        }

        if (mode === "login" && user.role !== role) {
          showStatus(
            "This account does not match the selected role.",
            "err"
          );
          return;
        }

        saveToken(token);
        cachedUser = user;

        showStatus(
          "✅ Success! Redirecting…",
          "ok"
        );

        const next = new URLSearchParams(
          window.location.search
        ).get("next");

        const allowed = {
          farmer: ["diagnose.html"],
          admin: ["admin.html"]
        }[user.role] || [];

        window.location.href =
          next && allowed.includes(next)
            ? next
            : homeFor(user.role);
      } catch (error) {
        console.error("Authentication error:", error);

        showStatus(
          "Unable to connect to the Node.js backend. Check that port 5001 is running.",
          "err"
        );
      } finally {
        submitting = false;
        submit.disabled = false;

        if (!cachedUser) {
          applyMode();
        }
      }
    });

    applyMode();
  }

  async function checkConnection() {
    const banner = document.getElementById("connBanner");

    if (!banner) {
      return;
    }

    try {
      const response = await fetch(
        API_BASE + "/api/health"
      );

      if (!response.ok) {
        throw new Error("Backend unavailable");
      }

      const data = await response.json();

      banner.hidden = data.database === "connected";

      if (!banner.hidden) {
        banner.textContent =
          "MongoDB is not connected. Check your backend.";
      }
    } catch (error) {
      banner.hidden = false;

      banner.textContent =
        "Cannot connect to the Node.js server on port 5001.";
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const footerLogout = document.getElementById(
      "footerLogout"
    );

    if (footerLogout) {
      footerLogout.addEventListener(
        "click",
        function (event) {
          event.preventDefault();
          logout();
        }
      );
    }

    checkConnection();

    const user = await me();

    renderNav(user);
    initAuthPage(user);
  });

  window.AgriCareAuth = {
    api,
    me,
    logout,
    getToken,
    API_BASE
  };
})();