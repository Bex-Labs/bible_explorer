/**
 * Bible Explorer: Buy page
 * Buying on Amazon is fully public, no sign-in needed. Downloading the
 * free e-copy now requires signing in with a magic link (the same
 * mechanism as the Community forum and admin.html), so only a real
 * signed-in reader ever sees a Download E-Copy button.
 *
 * A signed-in reader can also share a volume with a friend by name +
 * email. That request is saved to the `volume_shares` table for an
 * admin to follow up on by hand (see admin.html's Shared Requests
 * tab); nothing is emailed automatically yet. See /supabase/schema.sql.
 */
document.addEventListener("DOMContentLoaded", async function () {
  const grid = document.getElementById("volume-grid");
  const notReadyEl = document.getElementById("buy-not-ready");
  const authBox = document.getElementById("buy-auth-box");
  const signedInBox = document.getElementById("buy-signed-in-box");
  const signedInAs = document.getElementById("buy-signed-in-as");
  const signOutBtn = document.getElementById("buy-sign-out-btn");
  const loginForm = document.getElementById("buy-login-form");
  const loginMessage = document.getElementById("buy-login-message");

  const ready = window.bibleExplorerSupabaseReady;
  const sb = window.bibleExplorerSupabase;

  if (!ready) {
    if (notReadyEl) notReadyEl.style.display = "block";
    if (authBox) authBox.style.display = "none";
    if (signedInBox) signedInBox.style.display = "none";
  }

  let volumes = [];
  try {
    volumes = await window.bibleExplorerLoadVolumes();
  } catch (e) {
    console.error(e);
  }

  let session = null;

  function buildCard(v) {
    const card = document.createElement("div");
    card.className = "region-card";

    const thumb = v.thumbnailUrl
      ? '<img src="' + v.thumbnailUrl + '" alt="Volume ' + v.volume + ' cover" style="width:100%; max-width:140px; border-radius:8px; margin:0 auto 0.75rem; box-shadow:var(--shadow-soft);">'
      : '<div class="flag">📘</div>';

    const buyBtn = v.amazonUrl
      ? '<a class="btn btn-primary btn-block mt-2" target="_blank" rel="noopener" style="margin-top:1rem;" href="' + v.amazonUrl + '">Buy on Amazon</a>'
      : "";

    card.innerHTML =
      thumb +
      "<h3>Volume " + v.volume + "</h3>" +
      '<p class="field-hint mb-0">' + v.days + "</p>" +
      buyBtn;

    if (v.downloadUrl) {
      const downloadArea = document.createElement("div");
      downloadArea.style.marginTop = "0.6rem";

      if (session) {
        downloadArea.innerHTML =
          '<a class="btn btn-outline btn-block" target="_blank" rel="noopener" href="' + v.downloadUrl + '">Download E-Copy</a>' +
          '<button type="button" class="btn btn-outline btn-block btn-sm share-toggle" style="margin-top:0.5rem;">✉️ Share This Volume</button>' +
          '<div class="share-box"></div>';
      } else {
        downloadArea.innerHTML =
          '<p class="field-hint" style="margin-top:0.6rem;">🔒 <a href="#buy-auth-box">Sign in above</a> to download the free e-copy.</p>';
      }

      card.appendChild(downloadArea);

      if (session) {
        wireShareBox(downloadArea.querySelector(".share-toggle"), downloadArea.querySelector(".share-box"), v);
      }
    }

    return card;
  }

  function wireShareBox(toggleBtn, shareBox, v) {
    let open = false;

    toggleBtn.addEventListener("click", function () {
      open = !open;

      if (!open) {
        shareBox.innerHTML = "";
        toggleBtn.textContent = "✉️ Share This Volume";
        return;
      }

      toggleBtn.textContent = "✕ Cancel";
      shareBox.innerHTML =
        '<div class="share-form">' +
        '<div class="field"><label>Friend\'s name</label><input type="text" class="share-name"></div>' +
        '<div class="field"><label>Friend\'s email</label><input type="email" class="share-email"></div>' +
        '<button type="button" class="btn btn-primary btn-sm btn-block share-send">Send Share Request</button>' +
        '<div class="form-message share-message" role="status"></div>' +
        "</div>";

      shareBox.querySelector(".share-send").addEventListener("click", async function () {
        const nameField = shareBox.querySelector(".share-name");
        const emailField = shareBox.querySelector(".share-email");
        const messageEl = shareBox.querySelector(".share-message");
        const name = nameField.value.trim();
        const email = emailField.value.trim();

        if (!name || !email) {
          messageEl.className = "form-message error share-message";
          messageEl.textContent = "Please add both a name and an email.";
          return;
        }

        const sendBtn = shareBox.querySelector(".share-send");
        sendBtn.disabled = true;
        sendBtn.textContent = "Sending…";

        const { error } = await sb.from("volume_shares").insert({
          volume_number: v.volume,
          volume_label: v.days,
          shared_by_email: session ? session.user.email : null,
          recipient_name: name,
          recipient_email: email,
        });

        sendBtn.disabled = false;
        sendBtn.textContent = "Send Share Request";

        if (error) {
          console.error(error);
          messageEl.className = "form-message error share-message";
          messageEl.textContent = "Something went wrong. Please try again.";
          return;
        }

        shareBox.innerHTML =
          '<p class="form-message success share-message" style="display:block;">Thanks! We\'ll get Volume ' +
          v.volume +
          " over to " +
          name.replace(/</g, "&lt;") +
          ".</p>";
        toggleBtn.textContent = "✉️ Share Another Friend";
        open = false;
      });
    });
  }

  function renderGrid() {
    if (!volumes.length) {
      grid.innerHTML = '<p class="empty-state">Volumes aren\'t configured yet. Check back soon.</p>';
      return;
    }

    grid.innerHTML = "";
    volumes.forEach(function (v) {
      grid.appendChild(buildCard(v));
    });
  }

  async function refreshAuthUI() {
    if (ready) {
      const { data } = await sb.auth.getSession();
      session = data && data.session;

      if (session) {
        authBox.style.display = "none";
        signedInBox.style.display = "block";
        signedInAs.textContent = "Signed in as " + session.user.email;
      } else {
        authBox.style.display = "block";
        signedInBox.style.display = "none";
      }
    }

    renderGrid();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const email = loginForm.elements["email"].value.trim();
      if (!email) return;

      loginMessage.className = "form-message";
      const btn = loginForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Sending…";

      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href },
      });

      btn.disabled = false;
      btn.textContent = "Email Me a Login Link";

      if (error) {
        loginMessage.className = "form-message error";
        loginMessage.textContent = error.message;
      } else {
        loginMessage.className = "form-message success";
        loginMessage.textContent = "Check your email for a magic sign-in link!";
        loginForm.reset();
      }
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener("click", async function () {
      await sb.auth.signOut();
      refreshAuthUI();
    });
  }

  if (ready) {
    sb.auth.onAuthStateChange(function () {
      refreshAuthUI();
    });
  }

  refreshAuthUI();
});
