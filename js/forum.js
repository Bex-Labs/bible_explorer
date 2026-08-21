/**
 * Bible Explorer: community forum (micro-blog of lesson reflections)
 * Uses Supabase Auth (magic link email) so posts are tied to a real
 * signed-in reader, and Row Level Security so anyone can read posts
 * but only the author can create/delete their own.
 * See /supabase/schema.sql for table + policy definitions.
 */
document.addEventListener("DOMContentLoaded", function () {
  const authBox = document.getElementById("auth-box");
  const composerBox = document.getElementById("composer-box");
  const feedEl = document.getElementById("forum-feed");
  const notReadyEl = document.getElementById("forum-not-ready");

  if (!window.bibleExplorerSupabaseReady) {
    if (notReadyEl) notReadyEl.style.display = "block";
    if (authBox) authBox.style.display = "none";
    if (composerBox) composerBox.style.display = "none";
    return;
  }

  const sb = window.bibleExplorerSupabase;

  const loginForm = document.getElementById("login-form");
  const loginMessage = document.getElementById("login-message");
  const signedInAs = document.getElementById("signed-in-as");
  const signOutBtn = document.getElementById("sign-out-btn");
  const postForm = document.getElementById("post-form");
  const postMessage = document.getElementById("post-message");
  const postContent = document.getElementById("post-content");
  const charCount = document.getElementById("char-count");
  const displayNameField = document.getElementById("display-name");

  const MAX_LEN = 500;

  function renderPost(post) {
    const wrap = document.createElement("div");
    wrap.className = "post";
    const date = new Date(post.created_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    wrap.innerHTML =
      '<div class="post-meta">' +
      '<span class="post-author"></span>' +
      "<span></span>" +
      "</div>" +
      '<p class="post-content"></p>';
    wrap.querySelector(".post-author").textContent = post.display_name || "A reader";
    wrap.querySelector(".post-meta span:last-child").textContent = date;
    wrap.querySelector(".post-content").textContent = post.content;
    return wrap;
  }

  async function loadFeed() {
    feedEl.innerHTML = '<p class="empty-state">Loading reflections…</p>';
    const { data, error } = await sb
      .from("posts")
      .select("id, display_name, content, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      feedEl.innerHTML = '<p class="empty-state">Couldn\'t load posts right now.</p>';
      return;
    }

    if (!data || data.length === 0) {
      feedEl.innerHTML =
        '<p class="empty-state">No reflections yet. Be the first to share what you\'re learning!</p>';
      return;
    }

    feedEl.innerHTML = "";
    data.forEach(function (post) {
      feedEl.appendChild(renderPost(post));
    });
  }

  async function refreshAuthUI() {
    const { data } = await sb.auth.getSession();
    const session = data && data.session;

    if (session) {
      authBox.style.display = "none";
      composerBox.style.display = "block";
      signedInAs.textContent = "Signed in as " + session.user.email;
    } else {
      authBox.style.display = "block";
      composerBox.style.display = "none";
    }
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

  if (postContent && charCount) {
    postContent.addEventListener("input", function () {
      charCount.textContent = postContent.value.length + " / " + MAX_LEN;
    });
  }

  if (postForm) {
    postForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const content = postContent.value.trim();
      const displayName = displayNameField.value.trim() || "A reader";

      if (!content) return;

      postMessage.className = "form-message";
      const btn = postForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Posting…";

      const { data: sessionData } = await sb.auth.getSession();
      const user = sessionData && sessionData.session && sessionData.session.user;

      if (!user) {
        postMessage.className = "form-message error";
        postMessage.textContent = "Please sign in first.";
        btn.disabled = false;
        btn.textContent = "Share Reflection";
        return;
      }

      const { error } = await sb.from("posts").insert({
        user_id: user.id,
        display_name: displayName,
        content,
      });

      btn.disabled = false;
      btn.textContent = "Share Reflection";

      if (error) {
        console.error(error);
        postMessage.className = "form-message error";
        postMessage.textContent = "Something went wrong posting your reflection.";
        return;
      }

      postForm.reset();
      charCount.textContent = "0 / " + MAX_LEN;
      postMessage.className = "form-message success";
      postMessage.textContent = "Posted! Thanks for sharing.";
      loadFeed();
    });
  }

  sb.auth.onAuthStateChange(function () {
    refreshAuthUI();
  });

  refreshAuthUI();
  loadFeed();
});
