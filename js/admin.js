/**
 * Bible Explorer: admin page
 * Gated by Supabase Auth (magic link, same as the forum) + the
 * is_admin() Postgres function, which checks the signed-in user's
 * email against the `admins` table. See /supabase/schema.sql.
 *
 * Two tabs once signed in as an admin:
 *  - Volumes: add/edit/delete cards backed by the `volumes` table,
 *    including uploading a thumbnail image and an e-copy download
 *    file to Supabase Storage.
 *  - Moderation: hide/unhide or delete any forum post.
 *  - Shared Requests: readers can share a volume with a friend from
 *    the Buy page once signed in; this tab lists those requests so an
 *    admin can email the friend by hand and mark it Sent.
 */
document.addEventListener("DOMContentLoaded", function () {
  const notReadyEl = document.getElementById("admin-not-ready");
  const gateEl = document.getElementById("admin-gate");
  const errorEl = document.getElementById("admin-error");
  const errorDetailEl = document.getElementById("admin-error-detail");
  const deniedEl = document.getElementById("admin-denied");
  const contentEl = document.getElementById("admin-content");
  const userBar = document.getElementById("admin-user-bar");

  if (!window.bibleExplorerSupabaseReady) {
    if (notReadyEl) notReadyEl.style.display = "block";
    if (gateEl) gateEl.style.display = "none";
    return;
  }

  const sb = window.bibleExplorerSupabase;

  // =========================================================
  // Toast helper (replaces browser alert() for a nicer feel)
  // =========================================================
  const toastEl = document.getElementById("admin-toast");
  let toastTimer = null;

  function toast(message, type) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = "admin-toast show " + (type || "success");
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 4000);
  }

  // =========================================================
  // Auth
  // =========================================================
  const loginForm = document.getElementById("admin-login-form");
  const loginMessage = document.getElementById("admin-login-message");
  const signedInAs = document.getElementById("admin-signed-in-as");
  const signOutBtn = document.getElementById("admin-sign-out-btn");
  const signOutBtnDenied = document.getElementById("admin-sign-out-btn-denied");
  const signOutBtnError = document.getElementById("admin-sign-out-btn-error");

  function showOnly(section) {
    [gateEl, errorEl, deniedEl, contentEl].forEach(function (el) {
      if (el) el.style.display = "none";
    });
    if (section) section.style.display = section === contentEl ? "block" : "block";
    if (userBar) userBar.style.display = section === contentEl ? "flex" : "none";
  }

  async function checkAdminAndRender() {
    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData && sessionData.session;

    if (!session) {
      showOnly(gateEl);
      return;
    }

    const { data: isAdmin, error } = await sb.rpc("is_admin");

    if (error) {
      // Signed in fine, but the admin check itself failed (most likely
      // is_admin()/admins don't exist yet because schema.sql hasn't been
      // run). Show this distinctly rather than silently reverting to
      // the sign-in form, which looks like the magic link never worked.
      console.error(error);
      if (errorDetailEl) errorDetailEl.textContent = "Error: " + (error.message || error);
      showOnly(errorEl);
      return;
    }

    if (!isAdmin) {
      showOnly(deniedEl);
      return;
    }

    signedInAs.textContent = session.user.email;
    showOnly(contentEl);
    loadVolumes();
    loadPosts();
    loadShares();
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

  [signOutBtn, signOutBtnDenied, signOutBtnError].forEach(function (btn) {
    if (!btn) return;
    btn.addEventListener("click", async function () {
      await sb.auth.signOut();
      checkAdminAndRender();
    });
  });

  sb.auth.onAuthStateChange(function () {
    checkAdminAndRender();
  });

  // =========================================================
  // Tabs
  // =========================================================
  const tabButtons = document.querySelectorAll(".admin-tab");
  const tabPanels = {
    volumes: document.getElementById("tab-volumes"),
    moderation: document.getElementById("tab-moderation"),
    shares: document.getElementById("tab-shares"),
  };

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabButtons.forEach(function (b) { b.classList.remove("active"); });
      Object.values(tabPanels).forEach(function (p) { if (p) p.classList.remove("active"); });
      btn.classList.add("active");
      const panel = tabPanels[btn.dataset.tab];
      if (panel) panel.classList.add("active");
    });
  });

  // =========================================================
  // Stats
  // =========================================================
  const statVolumes = document.getElementById("stat-volumes");
  const statVisible = document.getElementById("stat-visible-posts");
  const statHidden = document.getElementById("stat-hidden-posts");
  const statPendingShares = document.getElementById("stat-pending-shares");

  // =========================================================
  // Volumes tab
  // =========================================================
  const volumesGrid = document.getElementById("volumes-grid");
  const addVolumeToggle = document.getElementById("add-volume-toggle");
  const addVolumePanel = document.getElementById("add-volume-panel");
  const addVolumeForm = document.getElementById("add-volume-form");
  const addVolumeMessage = document.getElementById("add-volume-message");

  if (addVolumeToggle) {
    addVolumeToggle.addEventListener("click", function () {
      const open = addVolumePanel.classList.toggle("open");
      addVolumeToggle.textContent = open ? "Cancel" : "+ Add Volume";
    });
  }

  function slugFile(name) {
    return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  }

  async function uploadVolumeAsset(bucket, volumeNumber, file) {
    const path = "v" + volumeNumber + "-" + Date.now() + "-" + slugFile(file.name);
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  function wireFileButton(fileInput, labelEl, defaultLabel) {
    fileInput.addEventListener("change", function () {
      const file = fileInput.files[0];
      if (file) {
        labelEl.textContent = "📎 " + (file.name.length > 18 ? file.name.slice(0, 15) + "…" : file.name);
        labelEl.parentElement.classList.add("has-file");
      } else {
        labelEl.textContent = defaultLabel;
        labelEl.parentElement.classList.remove("has-file");
      }
    });
  }

  function renderVolumeCard(v) {
    const card = document.createElement("div");
    card.className = "volume-card";
    card.dataset.id = v.id;

    const esc = function (s) { return (s || "").replace(/"/g, "&quot;"); };

    card.innerHTML =
      '<div class="volume-card-top">' +
        '<div class="volume-card-thumb">' +
          (v.thumbnail_url ? '<img src="' + v.thumbnail_url + '" alt="">' : "📘") +
        "</div>" +
        "<div>" +
          "<h3>Volume " + v.volume_number + "</h3>" +
          '<div class="vol-days">' + (v.days_label || "") + "</div>" +
        "</div>" +
      "</div>" +

      '<div class="field"><label>Volume #</label><input type="number" class="v-number" value="' + v.volume_number + '"></div>' +
      '<div class="field"><label>Day range</label><input type="text" class="v-days" value="' + esc(v.days_label) + '"></div>' +
      '<div class="field"><label>Amazon URL</label><input type="text" class="v-amazon" value="' + esc(v.amazon_url) + '" placeholder="https://amazon.ca/dp/..."></div>' +
      '<div class="field"><label>Download URL</label><input type="text" class="v-download" value="' + esc(v.download_url) + '" placeholder="download URL"></div>' +

      '<div class="file-btn-row">' +
        '<label class="file-btn"><span class="v-thumb-label">🖼️ Thumbnail</span><input type="file" class="v-thumb-file" accept="image/*"></label>' +
        '<label class="file-btn"><span class="v-download-label">📄 PDF</span><input type="file" class="v-download-file" accept="application/pdf"></label>' +
      "</div>" +

      '<div class="volume-card-actions">' +
        '<button type="button" class="btn btn-primary btn-sm btn-block v-save">Save</button>' +
        '<button type="button" class="btn btn-danger btn-sm v-delete">Delete</button>' +
      "</div>";

    wireFileButton(card.querySelector(".v-thumb-file"), card.querySelector(".v-thumb-label"), "🖼️ Thumbnail");
    wireFileButton(card.querySelector(".v-download-file"), card.querySelector(".v-download-label"), "📄 PDF");

    card.querySelector(".v-save").addEventListener("click", async function () {
      const btn = card.querySelector(".v-save");
      btn.disabled = true;
      btn.textContent = "Saving…";

      try {
        const update = {
          volume_number: parseInt(card.querySelector(".v-number").value, 10),
          days_label: card.querySelector(".v-days").value.trim(),
          amazon_url: card.querySelector(".v-amazon").value.trim() || null,
          download_url: card.querySelector(".v-download").value.trim() || null,
        };

        const thumbFile = card.querySelector(".v-thumb-file").files[0];
        const downloadFile = card.querySelector(".v-download-file").files[0];

        if (thumbFile) {
          update.thumbnail_url = await uploadVolumeAsset("volume-thumbnails", update.volume_number, thumbFile);
        }
        if (downloadFile) {
          update.download_url = await uploadVolumeAsset("volume-downloads", update.volume_number, downloadFile);
        }

        update.updated_at = new Date().toISOString();

        const { error } = await sb.from("volumes").update(update).eq("id", v.id);
        if (error) throw error;

        toast("Volume " + update.volume_number + " saved.", "success");
        loadVolumes();
      } catch (err) {
        console.error(err);
        toast("Couldn't save that volume: " + (err.message || err), "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Save";
      }
    });

    card.querySelector(".v-delete").addEventListener("click", async function () {
      if (!confirm("Delete Volume " + v.volume_number + "? This can't be undone.")) return;
      const { error } = await sb.from("volumes").delete().eq("id", v.id);
      if (error) {
        console.error(error);
        toast("Couldn't delete that volume: " + error.message, "error");
        return;
      }
      toast("Volume " + v.volume_number + " deleted.", "success");
      loadVolumes();
    });

    return card;
  }

  async function loadVolumes() {
    volumesGrid.innerHTML = '<p class="empty-state">Loading volumes…</p>';
    const { data, error } = await sb
      .from("volumes")
      .select("id, volume_number, days_label, amazon_url, thumbnail_url, download_url")
      .order("sort_order", { ascending: true })
      .order("volume_number", { ascending: true });

    if (error) {
      console.error(error);
      volumesGrid.innerHTML = '<p class="empty-state">Couldn\'t load volumes.</p>';
      return;
    }

    if (statVolumes) statVolumes.textContent = data ? data.length : "0";

    if (!data || data.length === 0) {
      volumesGrid.innerHTML = '<p class="empty-state">No volumes yet. Add the first one below.</p>';
      return;
    }

    volumesGrid.innerHTML = "";
    data.forEach(function (v) {
      volumesGrid.appendChild(renderVolumeCard(v));
    });
  }

  if (addVolumeForm) {
    addVolumeForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      addVolumeMessage.className = "form-message";

      const volumeNumber = parseInt(addVolumeForm.elements["volume_number"].value, 10);
      const daysLabel = addVolumeForm.elements["days_label"].value.trim();
      const amazonUrl = addVolumeForm.elements["amazon_url"].value.trim();
      const thumbFile = addVolumeForm.elements["thumbnail_file"].files[0];
      const downloadFile = addVolumeForm.elements["download_file"].files[0];

      if (!volumeNumber || !daysLabel) {
        addVolumeMessage.className = "form-message error";
        addVolumeMessage.textContent = "Volume number and day range are required.";
        return;
      }

      const btn = addVolumeForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Adding…";

      try {
        const insertRow = {
          volume_number: volumeNumber,
          days_label: daysLabel,
          amazon_url: amazonUrl || null,
          sort_order: volumeNumber,
        };

        if (thumbFile) {
          insertRow.thumbnail_url = await uploadVolumeAsset("volume-thumbnails", volumeNumber, thumbFile);
        }
        if (downloadFile) {
          insertRow.download_url = await uploadVolumeAsset("volume-downloads", volumeNumber, downloadFile);
        }

        const { error } = await sb.from("volumes").insert(insertRow);
        if (error) throw error;

        addVolumeForm.reset();
        addVolumePanel.classList.remove("open");
        addVolumeToggle.textContent = "+ Add Volume";
        addVolumeMessage.textContent = "";
        toast("Volume " + volumeNumber + " added.", "success");
        loadVolumes();
      } catch (err) {
        console.error(err);
        addVolumeMessage.className = "form-message error";
        addVolumeMessage.textContent = "Couldn't add that volume: " + (err.message || err);
      } finally {
        btn.disabled = false;
        btn.textContent = "Add Volume";
      }
    });
  }

  // =========================================================
  // Moderation tab
  // =========================================================
  const postsTableBody = document.getElementById("posts-table-body");

  function initials(name) {
    const parts = (name || "A reader").trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function renderPostRow(p) {
    const tr = document.createElement("tr");
    const date = new Date(p.created_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const toggleLabel = p.status === "visible" ? "Hide" : "Unhide";
    const name = p.display_name || "A reader";

    tr.innerHTML =
      '<td><div class="post-author-cell"><span class="post-avatar">' + initials(name) + '</span>' + name + "</div></td>" +
      '<td class="post-content-cell">' + p.content.replace(/</g, "&lt;") + "</td>" +
      '<td>' + date + "</td>" +
      '<td><span class="status-pill ' + p.status + '">' + p.status + "</span></td>" +
      '<td class="admin-actions">' +
      '<button type="button" class="btn btn-outline btn-sm p-toggle">' + toggleLabel + "</button>" +
      '<button type="button" class="btn btn-danger btn-sm p-delete">Delete</button>' +
      "</td>";

    tr.querySelector(".p-toggle").addEventListener("click", async function () {
      const newStatus = p.status === "visible" ? "hidden" : "visible";
      const { error } = await sb.from("posts").update({ status: newStatus }).eq("id", p.id);
      if (error) {
        console.error(error);
        toast("Couldn't update that post: " + error.message, "error");
        return;
      }
      toast(newStatus === "hidden" ? "Post hidden." : "Post is visible again.", "success");
      loadPosts();
    });

    tr.querySelector(".p-delete").addEventListener("click", async function () {
      if (!confirm("Delete this post permanently?")) return;
      const { error } = await sb.from("posts").delete().eq("id", p.id);
      if (error) {
        console.error(error);
        toast("Couldn't delete that post: " + error.message, "error");
        return;
      }
      toast("Post deleted.", "success");
      loadPosts();
    });

    return tr;
  }

  async function loadPosts() {
    postsTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading posts…</td></tr>';
    const { data, error } = await sb
      .from("posts")
      .select("id, display_name, content, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error(error);
      postsTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Couldn\'t load posts.</td></tr>';
      return;
    }

    if (statVisible) statVisible.textContent = data ? data.filter(function (p) { return p.status === "visible"; }).length : "0";
    if (statHidden) statHidden.textContent = data ? data.filter(function (p) { return p.status === "hidden"; }).length : "0";

    if (!data || data.length === 0) {
      postsTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No posts yet.</td></tr>';
      return;
    }

    postsTableBody.innerHTML = "";
    data.forEach(function (p) {
      postsTableBody.appendChild(renderPostRow(p));
    });
  }

  // =========================================================
  // Shared Requests tab
  // =========================================================
  const sharesTableBody = document.getElementById("shares-table-body");

  function renderShareRow(s) {
    const tr = document.createElement("tr");
    const date = new Date(s.created_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const toggleLabel = s.status === "pending" ? "Mark Sent" : "Mark Pending";
    const esc = function (str) { return (str || "").replace(/</g, "&lt;"); };

    tr.innerHTML =
      '<td>' + esc(s.recipient_name) + '<br><span class="field-hint mb-0">' + esc(s.recipient_email) + "</span></td>" +
      "<td>Volume " + s.volume_number + '<br><span class="field-hint mb-0">' + esc(s.volume_label) + "</span></td>" +
      "<td>" + esc(s.shared_by_email) + "</td>" +
      "<td>" + date + "</td>" +
      '<td><span class="status-pill ' + s.status + '">' + s.status + "</span></td>" +
      '<td class="admin-actions">' +
      '<button type="button" class="btn btn-outline btn-sm s-toggle">' + toggleLabel + "</button>" +
      '<button type="button" class="btn btn-danger btn-sm s-delete">Delete</button>' +
      "</td>";

    tr.querySelector(".s-toggle").addEventListener("click", async function () {
      const newStatus = s.status === "pending" ? "sent" : "pending";
      const { error } = await sb.from("volume_shares").update({ status: newStatus }).eq("id", s.id);
      if (error) {
        console.error(error);
        toast("Couldn't update that share request: " + error.message, "error");
        return;
      }
      toast(newStatus === "sent" ? "Marked as sent." : "Marked as pending.", "success");
      loadShares();
    });

    tr.querySelector(".s-delete").addEventListener("click", async function () {
      if (!confirm("Delete this share request?")) return;
      const { error } = await sb.from("volume_shares").delete().eq("id", s.id);
      if (error) {
        console.error(error);
        toast("Couldn't delete that share request: " + error.message, "error");
        return;
      }
      toast("Share request deleted.", "success");
      loadShares();
    });

    return tr;
  }

  async function loadShares() {
    sharesTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading share requests…</td></tr>';
    const { data, error } = await sb
      .from("volume_shares")
      .select("id, volume_number, volume_label, shared_by_email, recipient_name, recipient_email, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error(error);
      sharesTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Couldn\'t load share requests.</td></tr>';
      return;
    }

    if (statPendingShares) {
      statPendingShares.textContent = data ? data.filter(function (s) { return s.status === "pending"; }).length : "0";
    }

    if (!data || data.length === 0) {
      sharesTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No share requests yet.</td></tr>';
      return;
    }

    sharesTableBody.innerHTML = "";
    data.forEach(function (s) {
      sharesTableBody.appendChild(renderShareRow(s));
    });
  }

  checkAdminAndRender();
});
