/**
 * Bible Explorer: admin page
 * Gated by Supabase Auth (magic link, same as the forum) + the
 * is_admin() Postgres function, which checks the signed-in user's
 * email against the `admins` table. See /supabase/schema.sql.
 *
 * Two panels once signed in as an admin:
 *  - Volumes: add/edit/delete rows in the `volumes` table, including
 *    uploading a thumbnail image and an e-copy download file to
 *    Supabase Storage.
 *  - Moderation: hide/unhide or delete any forum post.
 */
document.addEventListener("DOMContentLoaded", function () {
  const notReadyEl = document.getElementById("admin-not-ready");
  const gateEl = document.getElementById("admin-gate");
  const deniedEl = document.getElementById("admin-denied");
  const contentEl = document.getElementById("admin-content");

  if (!window.bibleExplorerSupabaseReady) {
    if (notReadyEl) notReadyEl.style.display = "block";
    if (gateEl) gateEl.style.display = "none";
    return;
  }

  const sb = window.bibleExplorerSupabase;

  const loginForm = document.getElementById("admin-login-form");
  const loginMessage = document.getElementById("admin-login-message");
  const signedInAs = document.getElementById("admin-signed-in-as");
  const signOutBtn = document.getElementById("admin-sign-out-btn");
  const signOutBtnDenied = document.getElementById("admin-sign-out-btn-denied");

  function showOnly(section) {
    [gateEl, deniedEl, contentEl].forEach(function (el) {
      if (el) el.style.display = "none";
    });
    if (section) section.style.display = "block";
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
      console.error(error);
      showOnly(gateEl);
      return;
    }

    if (!isAdmin) {
      showOnly(deniedEl);
      return;
    }

    signedInAs.textContent = "Signed in as " + session.user.email;
    showOnly(contentEl);
    loadVolumes();
    loadPosts();
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

  [signOutBtn, signOutBtnDenied].forEach(function (btn) {
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
  // Volumes panel
  // =========================================================
  const volumesTableBody = document.getElementById("volumes-table-body");
  const addVolumeForm = document.getElementById("add-volume-form");
  const addVolumeMessage = document.getElementById("add-volume-message");

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

  function renderVolumeRow(v) {
    const tr = document.createElement("tr");
    tr.dataset.id = v.id;

    tr.innerHTML =
      '<td>' +
      (v.thumbnail_url
        ? '<img class="admin-thumb" src="' + v.thumbnail_url + '" alt="">'
        : '<div class="admin-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;">📘</div>') +
      "</td>" +
      '<td><input type="number" class="v-number" value="' + v.volume_number + '" style="width:70px; padding:0.4em;"></td>' +
      '<td><input type="text" class="v-days" value="' + (v.days_label || "").replace(/"/g, "&quot;") + '" style="width:120px; padding:0.4em;"></td>' +
      '<td><input type="text" class="v-amazon" value="' + (v.amazon_url || "").replace(/"/g, "&quot;") + '" placeholder="https://amazon.ca/dp/..." style="width:180px; padding:0.4em;"></td>' +
      '<td><input type="text" class="v-download" value="' + (v.download_url || "").replace(/"/g, "&quot;") + '" placeholder="download URL" style="width:180px; padding:0.4em;"></td>' +
      '<td>' +
      '<input type="file" class="v-thumb-file" accept="image/*" style="max-width:130px; font-size:0.78rem;">' +
      "</td>" +
      '<td>' +
      '<input type="file" class="v-download-file" accept="application/pdf" style="max-width:130px; font-size:0.78rem;">' +
      "</td>" +
      '<td class="admin-actions">' +
      '<button type="button" class="btn btn-primary btn-sm v-save">Save</button>' +
      '<button type="button" class="btn btn-danger btn-sm v-delete">Delete</button>' +
      "</td>";

    tr.querySelector(".v-save").addEventListener("click", async function () {
      const btn = tr.querySelector(".v-save");
      btn.disabled = true;
      btn.textContent = "Saving…";

      try {
        const update = {
          volume_number: parseInt(tr.querySelector(".v-number").value, 10),
          days_label: tr.querySelector(".v-days").value.trim(),
          amazon_url: tr.querySelector(".v-amazon").value.trim() || null,
          download_url: tr.querySelector(".v-download").value.trim() || null,
        };

        const thumbFile = tr.querySelector(".v-thumb-file").files[0];
        const downloadFile = tr.querySelector(".v-download-file").files[0];

        if (thumbFile) {
          update.thumbnail_url = await uploadVolumeAsset("volume-thumbnails", update.volume_number, thumbFile);
        }
        if (downloadFile) {
          update.download_url = await uploadVolumeAsset("volume-downloads", update.volume_number, downloadFile);
        }

        update.updated_at = new Date().toISOString();

        const { error } = await sb.from("volumes").update(update).eq("id", v.id);
        if (error) throw error;

        loadVolumes();
      } catch (err) {
        console.error(err);
        alert("Couldn't save that volume: " + (err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = "Save";
      }
    });

    tr.querySelector(".v-delete").addEventListener("click", async function () {
      if (!confirm("Delete Volume " + v.volume_number + "? This can't be undone.")) return;
      const { error } = await sb.from("volumes").delete().eq("id", v.id);
      if (error) {
        console.error(error);
        alert("Couldn't delete that volume: " + error.message);
        return;
      }
      loadVolumes();
    });

    return tr;
  }

  async function loadVolumes() {
    volumesTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Loading volumes…</td></tr>';
    const { data, error } = await sb
      .from("volumes")
      .select("id, volume_number, days_label, amazon_url, thumbnail_url, download_url")
      .order("sort_order", { ascending: true })
      .order("volume_number", { ascending: true });

    if (error) {
      console.error(error);
      volumesTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Couldn\'t load volumes.</td></tr>';
      return;
    }

    if (!data || data.length === 0) {
      volumesTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">No volumes yet. Add the first one below.</td></tr>';
      return;
    }

    volumesTableBody.innerHTML = "";
    data.forEach(function (v) {
      volumesTableBody.appendChild(renderVolumeRow(v));
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
        addVolumeMessage.className = "form-message success";
        addVolumeMessage.textContent = "Volume " + volumeNumber + " added.";
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
  // Moderation panel
  // =========================================================
  const postsTableBody = document.getElementById("posts-table-body");

  function renderPostRow(p) {
    const tr = document.createElement("tr");
    const date = new Date(p.created_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const toggleLabel = p.status === "visible" ? "Hide" : "Unhide";

    tr.innerHTML =
      '<td>' + (p.display_name || "A reader") + "</td>" +
      '<td style="max-width:320px; white-space:normal;">' + p.content.replace(/</g, "&lt;") + "</td>" +
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
        alert("Couldn't update that post: " + error.message);
        return;
      }
      loadPosts();
    });

    tr.querySelector(".p-delete").addEventListener("click", async function () {
      if (!confirm("Delete this post permanently?")) return;
      const { error } = await sb.from("posts").delete().eq("id", p.id);
      if (error) {
        console.error(error);
        alert("Couldn't delete that post: " + error.message);
        return;
      }
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

    if (!data || data.length === 0) {
      postsTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No posts yet.</td></tr>';
      return;
    }

    postsTableBody.innerHTML = "";
    data.forEach(function (p) {
      postsTableBody.appendChild(renderPostRow(p));
    });
  }

  checkAdminAndRender();
});
