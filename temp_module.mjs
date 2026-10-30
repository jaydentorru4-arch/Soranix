
    import { 
      auth, 
      signInWithGoogle, 
      signOutUser, 
      syncUserProfile, 
      updateUserProfile, 
      testConnection 
    } from '/src/firebase.ts';
    import { onAuthStateChanged } from 'firebase/auth';

    // ----------------------------------------------------
    // ----------------------------------------------------
    // STORAGE KEYS & LOCAL DATABASE INITIALIZATION
    // ----------------------------------------------------
    const USERS_DB_KEY = 'soranix_users_db';
    const ACTIVE_SESSION_KEY = 'soranix_active_session';
    const NOTIFICATIONS_PREFIX = 'soranix_notifications_';
    const GLOBAL_CHAT_KEY = 'soranix_global_chat';
    const DM_THREADS_KEY = 'soranix_dm_threads';
    const HIDE_GLOBAL_CHAT_KEY = 'soranix_hide_global_chat';
    const ADMIN_CONFIG_KEY = 'soranix_admin_config';

    function getAdminConfig() {
      try {
        const raw = localStorage.getItem(ADMIN_CONFIG_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return {
        maintenanceMode: false,
        maintenanceReason: 'Soranix engineers are conducting scheduled upgrades across galactic relay nodes. Access will be restored shortly.',
        announcementBanner: null, // { text, type, active: true, time }
        watchMultiplier: 1.0
      };
    }

    function saveAdminConfig(cfg) {
      try {
        localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(cfg));
      } catch (e) {
        console.warn('Admin config save error:', e);
      }
    }

    // Administrator & Owner Clearance (Strictly jaydentorru4@gmail.com upon Google Login)
    const OWNER_EMAIL = 'jaydentorru4@gmail.com';

    function isOwner(u) {
      if (!u || AppState.isGuest) return false;
      const email = (u.email || '').trim().toLowerCase();
      return email === OWNER_EMAIL || u.isOwner === true;
    }

    function checkIsAdmin(u) {
      if (!u || AppState.isGuest) return false;
      if (isOwner(u)) return true;
      // Staff roles with administrative/staff powers assigned by the owner
      if (u.staffRole && ['developer', 'tester', 'moderator', 'admin'].includes(u.staffRole)) return true;
      if (u.isAdmin === true && u.email && u.email.trim().toLowerCase() === OWNER_EMAIL) return true;
      return false;
    }

    function getUsersDB() {
      try {
        const raw = localStorage.getItem(USERS_DB_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    }

    function saveUsersDB(db) {
      try {
        localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
    }

    function getActiveSession() {
      try {
        const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    function setActiveSession(session) {
      if (!session) {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      } else {
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
      }
    }

    function getNotifications(username) {
      if (!username || username === 'Guest Explorer') return [];
      try {
        const raw = localStorage.getItem(`${NOTIFICATIONS_PREFIX}${username.toLowerCase()}`);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function saveNotifications(username, list) {
      if (!username || username === 'Guest Explorer') return;
      try {
        localStorage.setItem(`${NOTIFICATIONS_PREFIX}${username.toLowerCase()}`, JSON.stringify(list));
      } catch (e) {
        console.warn('Notification save error:', e);
      }
    }

    function getGlobalChatMessages() {
      try {
        const raw = localStorage.getItem(GLOBAL_CHAT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Strictly filter out any mock/seeded dummy messages
            const filtered = parsed.filter(m => {
              if (!m) return false;
              if (m.id && String(m.id).startsWith('seed-')) return false;
              const sender = (m.sender || '').toLowerCase();
              if (['kaitox', 'ariastar', 'shadowrei', 'zenith', 'starlightvoyager', 'cyberronin_99'].includes(sender)) return false;
              return true;
            });
            if (filtered.length !== parsed.length) {
              localStorage.setItem(GLOBAL_CHAT_KEY, JSON.stringify(filtered));
            }
            return filtered;
          }
        }
      } catch (e) {}

      // Initial state is strictly empty - no fake or seeded users
      return [];
    }

    function saveGlobalChatMessages(msgs) {
      try {
        localStorage.setItem(GLOBAL_CHAT_KEY, JSON.stringify(msgs));
      } catch (e) {
        console.warn('Chat save error:', e);
      }
    }

    function getDMThreads() {
      try {
        const raw = localStorage.getItem(DM_THREADS_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    }

    function saveDMThreads(threads) {
      try {
        localStorage.setItem(DM_THREADS_KEY, JSON.stringify(threads));
      } catch (e) {
        console.warn('DM threads save error:', e);
      }
    }

    function getThreadKey(u1, u2) {
      return [u1.toLowerCase(), u2.toLowerCase()].sort().join('___');
    }

    // Rank titles according to Level
    function getTitleForLevel(lvl) {
      if (lvl <= 1) return 'Level 1 Novice Voyager';
      if (lvl === 2) return 'Level 2 Astral Scout';
      if (lvl === 3) return 'Level 3 Nebula Navigator';
      if (lvl === 4) return 'Level 4 Cosmic Pioneer';
      if (lvl === 5) return 'Level 5 Starlight Master';
      return `Level ${lvl} Galactic Champion`;
    }

    // Default Starting User Factory (Zeroed Initial State, Admin/Owner Support)
    function createInitialUser(username, email = '', password = '') {
      const isOwner = checkIsAdmin({ username, email });
      return {
        username: username,
        email: email,
        password: password,
        level: isOwner ? 999 : 1,
        xp: isOwner ? 99900 : 0,
        stardust: isOwner ? 999999 : 0,
        animeWatched: isOwner ? 150 : 0,
        episodesWatched: isOwner ? 1420 : 0,
        favouritesCount: 0,
        bio: isOwner ? 'System Administrator & Soranix Platform Owner. Overseeing deep space anime archives.' : 'Stargazing across infinite nebulae, collecting rare cyber soundtracks, and cataloging forgotten anime classics.',
        title: isOwner ? 'System Administrator / Owner' : 'Level 1 Novice Voyager',
        isAdmin: isOwner,
        isBanned: false,
        bannedReason: '',
        mutedUntil: 0,
        ipSessionLog: '192.168.1.104 • Linux Chrome • Active Session',
        equippedFrame: isOwner ? 'void' : 'galaxy',
        equippedBanner: null,
        equippedNameGlow: isOwner ? 'rainbow' : null,
        equippedChatBadge: isOwner ? 'badge_soranix_admin' : null,
        inventory: isOwner ? 
          ['frame_galaxy', 'frame_void', 'frame_crown', 'frame_cybergrid', 'theme_violet', 'audio_coin', 'badge_soranix_admin'] : 
          ['frame_galaxy', 'theme_violet', 'audio_coin'],
        avatarDataUrl: null,
        bannerDataUrl: null,
        watchSecondsTotal: 0,
        currentCycleSeconds: 0,
        theme: 'violet',
        friends: [],
        incomingRequests: [],
        outgoingRequests: []
      };
    }

    // Application Master State
    const AppState = {
      currentView: 'splash', // 'splash' or 'dashboard'
      currentTab: 'home',    // 'home', 'profile', 'friends', 'favorites', 'rewards', 'shop', 'admin'
      isGuest: true,
      currentUserKey: null,
      authModalMode: 'login', // 'login' or 'signup'
      theme: 'violet',
      layoutMode: 'cards',
      user: createInitialUser('Guest Explorer'),
      draft: {
        username: '',
        bio: '',
        equippedFrame: '',
        avatarDataUrl: null,
        bannerDataUrl: null,
      },
      currentFriendsSubTab: 'list',
      activeDMFriend: null,
      previewTargetUser: null,
      isGlobalChatOpen: false,
      hideGlobalChatSetting: localStorage.getItem('soranix_hide_global_chat') === 'true',
      // Cosmic Shop Filter State
      shopCategory: 'all',
      shopOwnership: 'all',
      shopSearch: '',
      // Admin Console State
      adminSubTab: 'users',
      adminUsersStatusFilter: 'all',
      adminSelectedEditorUserKey: null,
      // Watch-time Reward Engine State
      isWatchingAnime: false,
      watch: {
        active: true,
        multiplier: 1,
        intervalId: null
      }
    };

    function $(id) {
      return document.getElementById(id);
    }

    // ----------------------------------------------------
    // 1. AUTO-LOGIN & SESSION RESTORATION (Main Menu Preserved)
    // ----------------------------------------------------
    (function initAutoLogin() {
      const savedTheme = localStorage.getItem('soranix_theme') || 'violet';
      setCosmicTheme(savedTheme, false);

      // Cleanse any stale mock/seeded dummy messages from global chat
      getGlobalChatMessages();

      const users = getUsersDB();

      // Check active announcement banner & maintenance mode
      renderAnnouncementBannerUI();
      updateMaintenanceGuardUI();

      const activeSession = getActiveSession();

      if (activeSession && activeSession.username) {
        const userKey = activeSession.username.toLowerCase();

        if (activeSession.isGuest) {
          AppState.isGuest = true;
          AppState.currentUserKey = null;
          AppState.user = createInitialUser('Guest Explorer');
          updateViewableProfileUI();
        } else if (users[userKey]) {
          AppState.isGuest = false;
          AppState.currentUserKey = userKey;
          AppState.user = { ...createInitialUser(users[userKey].username), ...users[userKey] };
          
          if (checkIsAdmin(AppState.user)) {
            AppState.user.isAdmin = true;
            AppState.user.title = 'System Administrator / Owner';
          }

          if (AppState.user.theme) {
            setCosmicTheme(AppState.user.theme, false);
          }
          updateViewableProfileUI();
        }
      }

      // CRITICAL: Always stay on the Main Menu screen on initial boot!
      // NEVER automatically navigate away or remove the Main Menu screen!
      returnToSplash();
    })();

    // ----------------------------------------------------
    // 2. VIEW SWITCHING: SPLASH VS DASHBOARD
    // ----------------------------------------------------
    function enterDashboard(tabToOpen = 'home') {
      const splash = $('view-splash');
      const dash = $('view-dashboard');

      if (splash && dash) {
        splash.classList.add('hidden');
        dash.classList.remove('hidden');
        AppState.currentView = 'dashboard';
        switchDashboardTab(tabToOpen);
        startWatchTracker();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function returnToSplash() {
      const splash = $('view-splash');
      const dash = $('view-dashboard');

      if (splash && dash) {
        dash.classList.add('hidden');
        splash.classList.remove('hidden');
        AppState.currentView = 'splash';
        closeGearMenu();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function continueAsGuest() {
      AppState.isGuest = true;
      AppState.currentUserKey = null;
      AppState.user = createInitialUser('Guest Explorer');
      setActiveSession({ username: 'Guest Explorer', isGuest: true });
      updateViewableProfileUI();
      enterDashboard('home');
      showToast('Continuing as Guest Explorer. Level 1 with 0 coins.', 'info');
    }

    function handleLogout() {
      setActiveSession(null);
      AppState.isGuest = true;
      AppState.currentUserKey = null;
      AppState.user = createInitialUser('Guest Explorer');
      updateViewableProfileUI();
      returnToSplash();
      showToast('Logged out. Session cleared.', 'info');
    }

    // ----------------------------------------------------
    // 3. DASHBOARD TABS SWITCHER
    // ----------------------------------------------------
    function switchDashboardTab(tabName) {
      // Access Guard: protect admin tab
      if (tabName === 'admin' && (AppState.isGuest || !checkIsAdmin(AppState.user))) {
        openAdminTab();
        return;
      }

      AppState.currentTab = tabName;

      const tabs = [
        { name: 'home', el: $('tab-view-home') },
        { name: 'profile', el: $('tab-view-profile') },
        { name: 'friends', el: $('tab-view-friends') },
        { name: 'favorites', el: $('tab-view-favorites') },
        { name: 'rewards', el: $('tab-view-rewards') },
        { name: 'shop', el: $('tab-view-shop') },
        { name: 'admin', el: $('tab-view-admin') }
      ];

      tabs.forEach(t => {
        if (!t.el) return;
        if (t.name === tabName) {
          t.el.classList.remove('hidden');
        } else {
          t.el.classList.add('hidden');
        }
      });

      const breadcrumb = $('header-breadcrumb');
      if (breadcrumb) {
        const labels = {
          home: 'DASHBOARD HOME',
          profile: 'MY PROFILE HUB',
          friends: 'FRIENDS & TRANSMISSIONS',
          favorites: 'FAVOURITED ANIME',
          rewards: 'DAILY REWARDS TRACK',
          shop: 'COSMIC SHOP',
          admin: 'ADMIN & OWNER CONTROL CENTER'
        };
        breadcrumb.textContent = labels[tabName] || tabName.toUpperCase();
      }

      const btnMap = {
        home: $('nav-tab-btn-home'),
        profile: $('nav-tab-btn-profile'),
        friends: $('nav-tab-btn-friends'),
        favorites: $('nav-tab-btn-favorites'),
        rewards: $('nav-tab-btn-rewards'),
        shop: $('nav-tab-btn-shop'),
        admin: $('nav-tab-btn-admin')
      };

      Object.entries(btnMap).forEach(([k, btn]) => {
        if (!btn) return;
        if (k === tabName) {
          if (k === 'admin') {
            btn.className = 'sidebar-tab-btn w-11 h-11 rounded-2xl flex items-center justify-center text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all cursor-pointer relative';
          } else {
            btn.className = 'sidebar-tab-btn w-11 h-11 rounded-2xl flex items-center justify-center text-white bg-purple-600 shadow-accent-glow transition-all cursor-pointer relative';
          }
        } else {
          if (k === 'admin') {
            btn.className = 'sidebar-tab-btn w-11 h-11 rounded-2xl flex items-center justify-center text-red-400/70 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all cursor-pointer relative';
          } else {
            btn.className = 'sidebar-tab-btn w-11 h-11 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer relative';
          }
        }
      });

      if (tabName === 'profile') {
        updateViewableProfileUI();
      } else if (tabName === 'home') {
        if (!AppState.catalogInitialised) {
          fetchAniListCatalog();
        }
      } else if (tabName === 'favorites') {
        renderFavoritesUI();
      } else if (tabName === 'friends') {
        renderFriendsUI();
      } else if (tabName === 'rewards') {
        renderDailyRewardsUI();
      } else if (tabName === 'shop') {
        renderShopCatalog();
      } else if (tabName === 'admin') {
        renderAdminDashboard();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function openAdminTab() {
      if (AppState.isGuest || !checkIsAdmin(AppState.user)) {
        // Show Access Denied Guard Modal!
        const deniedModal = $('admin-access-denied-modal');
        const userLabel = $('access-denied-current-user');
        if (userLabel) {
          userLabel.textContent = AppState.isGuest ? 'Guest Explorer' : AppState.user.username;
        }
        if (deniedModal) {
          deniedModal.classList.remove('hidden');
          deniedModal.classList.add('flex');
        }
        SoranixAudio.play('sword');
        showToast('Access Denied: System Administrator privileges required.', 'error');
        return;
      }

      if (AppState.currentView === 'splash') {
        enterDashboard('admin');
      } else {
        switchDashboardTab('admin');
      }
      showToast('Admin Control Station active &bull; System Owner', 'success');
    }

    function closeAdminAccessDeniedModal() {
      const modal = $('admin-access-denied-modal');
      if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
      }
    }

    function quickLoginAsOwner() {
      closeAuthModal();
      closeAdminAccessDeniedModal();
      triggerFirebaseGoogleLogin();
    }

    function renderAnnouncementBannerUI() {
      const banner = $('global-admin-announcement-banner');
      const textEl = $('global-announcement-text');
      const badgeText = $('global-announcement-badge-text');
      const cfg = getAdminConfig();

      if (banner && textEl) {
        if (cfg.announcementBanner && cfg.announcementBanner.active && cfg.announcementBanner.text) {
          textEl.textContent = cfg.announcementBanner.text;
          if (badgeText) {
            const types = {
              alert: 'System Alert',
              event: 'Special Event',
              notice: 'Notice',
              update: 'Cosmic Update'
            };
            badgeText.textContent = types[cfg.announcementBanner.type] || 'System Alert';
          }
          banner.classList.remove('hidden');
        } else {
          banner.classList.add('hidden');
        }
      }
    }

    function dismissAnnouncementBanner() {
      const banner = $('global-admin-announcement-banner');
      if (banner) banner.classList.add('hidden');
    }

    function updateMaintenanceGuardUI() {
      const cfg = getAdminConfig();
      const guard = $('maintenance-mode-guard');
      const bypassBtn = $('maintenance-admin-bypass-btn');
      const reasonEl = $('maintenance-guard-reason');

      if (reasonEl && cfg.maintenanceReason) {
        reasonEl.textContent = cfg.maintenanceReason;
      }

      const isAdmin = !AppState.isGuest && checkIsAdmin(AppState.user);
      if (bypassBtn) {
        if (isAdmin) bypassBtn.classList.remove('hidden');
        else bypassBtn.classList.add('hidden');
      }

      if (guard) {
        if (cfg.maintenanceMode && !isAdmin) {
          guard.classList.remove('hidden');
          guard.classList.add('flex');
        } else {
          guard.classList.remove('flex');
          guard.classList.add('hidden');
        }
      }
    }

    function checkMaintenanceBypass() {
      const cfg = getAdminConfig();
      updateMaintenanceGuardUI();
      if (!cfg.maintenanceMode) {
        showToast('Maintenance completed. Platform online!', 'success');
      } else {
        showToast('Platform maintenance is still ongoing.', 'info');
      }
    }

    function bypassMaintenanceAsAdmin() {
      const guard = $('maintenance-mode-guard');
      if (guard) {
        guard.classList.remove('flex');
        guard.classList.add('hidden');
      }
      openAdminTab();
    }

    // ----------------------------------------------------
    // 4. GEAR MENU CONTROLS
    // ----------------------------------------------------
    function toggleGearMenu(e) {
      if (e) e.stopPropagation();
      const menu = $('gear-dropdown');
      if (!menu) return;
      menu.classList.toggle('hidden');
    }

    function closeGearMenu() {
      const menu = $('gear-dropdown');
      if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
      }
    }

    document.addEventListener('click', (event) => {
      const menu = $('gear-dropdown');
      const gearBtn = $('gear-btn');
      if (menu && !menu.classList.contains('hidden')) {
        if (!menu.contains(event.target) && !gearBtn?.contains(event.target)) {
          menu.classList.add('hidden');
        }
      }
    });

    // ----------------------------------------------------
    // 5. UNIQUE USERNAME VALIDATION & AUTHENTICATION
    // ----------------------------------------------------
    function checkUsernameAvailability(username, excludeCurrentKey = null) {
      const clean = username.trim();
      if (!clean || clean.length < 3) {
        return { valid: false, reason: 'Username must be at least 3 characters.' };
      }
      if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
        return { valid: false, reason: 'Only letters, numbers, and underscores allowed.' };
      }
      const key = clean.toLowerCase();
      if (excludeCurrentKey && key === excludeCurrentKey.toLowerCase()) {
        return { valid: true };
      }
      const users = getUsersDB();
      if (users[key]) {
        return { valid: false, reason: 'Username already taken. Please choose another.' };
      }
      return { valid: true };
    }

    function validateAuthUsernameRealtime() {
      const input = $('auth-username');
      const errorEl = $('auth-username-error');
      const successEl = $('auth-username-success');
      const iconEl = $('auth-username-status-icon');
      const submitBtn = $('auth-submit-btn');

      if (!input) return;
      const val = input.value.trim();

      if (!val) {
        if (errorEl) errorEl.classList.add('hidden');
        if (successEl) successEl.classList.add('hidden');
        if (iconEl) iconEl.innerHTML = '';
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      if (AppState.authModalMode === 'signup') {
        const check = checkUsernameAvailability(val);
        if (!check.valid) {
          if (errorEl) {
            errorEl.classList.remove('hidden');
            errorEl.querySelector('span').textContent = check.reason;
          }
          if (successEl) successEl.classList.add('hidden');
          if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark text-red-400 text-xs"></i>';
          if (submitBtn) submitBtn.disabled = true;
        } else {
          if (errorEl) errorEl.classList.add('hidden');
          if (successEl) successEl.classList.remove('hidden');
          if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400 text-xs"></i>';
          if (submitBtn) submitBtn.disabled = false;
        }
      } else {
        // In login mode, reset inline uniqueness warning
        if (errorEl) errorEl.classList.add('hidden');
        if (successEl) successEl.classList.add('hidden');
        if (iconEl) iconEl.innerHTML = '';
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    function handleAuthSubmit(event) {
      event.preventDefault();
      const usernameInput = $('auth-username')?.value.trim();
      const emailInput = $('auth-email')?.value.trim() || '';
      const passwordInput = $('auth-password')?.value;
      const confirmInput = $('auth-confirm-password')?.value;

      if (!usernameInput || !passwordInput) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      const users = getUsersDB();
      const userKey = usernameInput.toLowerCase();

      if (AppState.authModalMode === 'signup') {
        // 1. Validate Unique Username
        const check = checkUsernameAvailability(usernameInput);
        if (!check.valid) {
          showToast(check.reason, 'error');
          return;
        }

        // 2. Validate Password Match
        if (passwordInput !== confirmInput) {
          showToast('Passwords do not match. Please re-enter.', 'error');
          return;
        }

        // 3. Create Zeroed Account at Level 1
        const newUser = createInitialUser(usernameInput, emailInput, passwordInput);
        users[userKey] = newUser;
        saveUsersDB(users);

        // 4. Set Session
        AppState.isGuest = false;
        AppState.currentUserKey = userKey;
        AppState.user = newUser;
        setActiveSession({ username: usernameInput, isGuest: false });

        closeAuthModal();
        updateViewableProfileUI();
        enterDashboard('profile');
        showToast(`Account created! Welcome, ${usernameInput}! (Level 1 Novice Voyager)`, 'success');

      } else {
        // Log In Flow
        const existing = users[userKey];
        if (!existing) {
          showToast('No account found with this username. Please Sign Up.', 'error');
          return;
        }
        if (existing.isBanned) {
          showToast(`Account Suspended: This account has been banned by Administrator (${existing.bannedReason || 'Violation of terms'}).`, 'error');
          return;
        }
        if (existing.password && existing.password !== passwordInput) {
          showToast('Incorrect password for this account.', 'error');
          return;
        }

        if (checkIsAdmin(existing)) {
          existing.isAdmin = true;
          existing.title = 'System Administrator / Owner';
          existing.level = Math.max(existing.level || 1, 999);
          existing.stardust = Math.max(existing.stardust || 0, 999999);
        }

        AppState.isGuest = false;
        AppState.currentUserKey = userKey;
        AppState.user = { ...createInitialUser(existing.username), ...existing };
        setActiveSession({ username: existing.username, isGuest: false });

        if (AppState.user.theme) {
          setCosmicTheme(AppState.user.theme, false);
        }

        closeAuthModal();
        updateViewableProfileUI();
        enterDashboard('home');
        showToast(`Welcome back, ${existing.username}!`, 'success');
      }
    }

    function openAuthModal(mode = 'login') {
      AppState.authModalMode = mode;
      setAuthMode(mode);
      const modal = $('auth-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    }

    function closeAuthModal() {
      const modal = $('auth-modal');
      if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
      }
    }

    function setAuthMode(mode) {
      AppState.authModalMode = mode;
      const tabLogin = $('auth-tab-login');
      const tabSignUp = $('auth-tab-signup');
      const emailGroup = $('auth-email-group');
      const confirmGroup = $('auth-confirm-group');
      const submitBtn = $('auth-submit-btn');
      const modalTitle = $('auth-modal-title');

      validateAuthUsernameRealtime();

      if (mode === 'login') {
        if (tabLogin) tabLogin.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all bg-purple-600 text-white cursor-pointer';
        if (tabSignUp) tabSignUp.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer';
        if (emailGroup) emailGroup.classList.add('hidden');
        if (confirmGroup) confirmGroup.classList.add('hidden');
        if (submitBtn) submitBtn.textContent = 'Log In to Soranix';
        if (modalTitle) modalTitle.textContent = 'Log In to Soranix';
      } else {
        if (tabSignUp) tabSignUp.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all bg-purple-600 text-white cursor-pointer';
        if (tabLogin) tabLogin.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer';
        if (emailGroup) emailGroup.classList.remove('hidden');
        if (confirmGroup) confirmGroup.classList.remove('hidden');
        if (submitBtn) submitBtn.textContent = 'Create Cosmic Account';
        if (modalTitle) modalTitle.textContent = 'Join Soranix Galaxy';
      }
    }

    // ----------------------------------------------------
    // 6. WATCH-TIME REWARDS & LEVELING PROGRESSION ENGINE
    // (Only earn money & level up from watching anime, registered accounts only)
    // ----------------------------------------------------
    function startWatchTracker() {
      if (AppState.watch.intervalId) return;

      AppState.watch.intervalId = setInterval(() => {
        // Strict Constraint: Only level up and earn money from watching anime with an account
        if (AppState.isGuest || !AppState.isWatchingAnime) return;

        AppState.user.watchSecondsTotal = (AppState.user.watchSecondsTotal || 0) + 1;
        AppState.user.currentCycleSeconds = (AppState.user.currentCycleSeconds || 0) + 1;

        // Check 5-minute (300 seconds) payout threshold
        if (AppState.user.currentCycleSeconds >= 300) {
          AppState.user.currentCycleSeconds = 0;

          // Award Stardust Coins & XP per 5-minute block with Admin Multiplier support
          const cfg = getAdminConfig();
          const mult = cfg.watchMultiplier || 1.0;
          const earnedCoins = Math.round(50 * mult);
          const earnedXP = Math.round(50 * mult);

          AppState.user.stardust = (AppState.user.stardust || 0) + earnedCoins;
          AppState.user.xp = (AppState.user.xp || 0) + earnedXP;

          // Calculate Dynamic Leveling Up (100 XP per level)
          const oldLevel = AppState.user.level || 1;
          const newLevel = Math.floor(AppState.user.xp / 100) + 1;

          if (newLevel > oldLevel) {
            AppState.user.level = newLevel;
            AppState.user.title = getTitleForLevel(newLevel);
            SoranixAudio.play('level_up');
            addNotification(AppState.user.username, {
              type: 'level_up',
              title: `Level Up: Level ${newLevel}!`,
              body: `Congratulations, Voyager! You reached Level ${newLevel} (${AppState.user.title}) and earned +${earnedCoins} Stardust!`
            });
            showToast(`🎉 LEVEL UP! You reached Level ${newLevel} (${AppState.user.title})! +${earnedCoins} Stardust!`, 'success');
          } else {
            SoranixAudio.play('coin');
            showToast(`✨ +${earnedCoins} Stardust & +${earnedXP} XP earned for 5 mins of anime watched!`, 'success');
          }

          saveUserToLocalStorage();
          updateViewableProfileUI();
        }

        updateStreamTrackerUI();
      }, 1000);
    }

    function toggleAnimeWatchSession() {
      if (AppState.isGuest) {
        showToast('Account Required: Please Sign Up or Log In to watch anime and earn watch-time rewards.', 'info');
        openAuthModal('signup');
        return;
      }

      AppState.isWatchingAnime = !AppState.isWatchingAnime;
      const banner = $('active-anime-stream-banner');
      const actionText = $('btn-stream-action-text');
      const actionIcon = $('btn-stream-action-icon');

      if (AppState.isWatchingAnime) {
        if (banner) banner.classList.remove('hidden');
        if (actionText) actionText.textContent = 'Pause Anime Stream';
        if (actionIcon) actionIcon.className = 'fa-solid fa-pause';
        showToast('Anime stream started! Watching anime earns +50 Stardust & +50 XP every 5 mins.', 'success');
      } else {
        if (banner) banner.classList.add('hidden');
        if (actionText) actionText.textContent = 'Watch Anime';
        if (actionIcon) actionIcon.className = 'fa-solid fa-play';
        showToast('Anime stream paused.', 'info');
      }
    }

    function updateStreamTrackerUI() {
      const cycleSec = Math.floor(AppState.user.currentCycleSeconds || 0);
      const cyclePct = Math.min(100, Math.floor((cycleSec / 300) * 100));

      const secEl = $('stream-cycle-seconds');
      const pctEl = $('stream-cycle-percent');
      const barEl = $('stream-progress-bar');

      if (secEl) secEl.textContent = `${cycleSec}s`;
      if (pctEl) pctEl.textContent = `${cyclePct}%`;
      if (barEl) barEl.style.width = `${cyclePct}%`;

      updateStatsCounters();
    }

    function saveUserToLocalStorage() {
      if (AppState.isGuest || !AppState.currentUserKey) return;
      const users = getUsersDB();
      users[AppState.currentUserKey] = { ...AppState.user };
      saveUsersDB(users);
    }

    // ----------------------------------------------------
    // 7. VIEWABLE PROFILE UI UPDATER
    // ----------------------------------------------------
    function updateViewableProfileUI() {
      const u = AppState.user;

      // Handle Guest View vs Account View toggling for Home and Profile
      const homeGuestView = $('home-guest-view');
      const homeAccountView = $('home-account-view');
      const homeAccountUsername = $('home-account-username');
      const profileGuestLocked = $('profile-guest-locked');
      const profileUnlockedContent = $('profile-unlocked-content');

      if (AppState.isGuest) {
        if (homeGuestView) homeGuestView.classList.remove('hidden');
        if (homeAccountView) homeAccountView.classList.add('hidden');
        if (profileGuestLocked) profileGuestLocked.classList.remove('hidden');
        if (profileUnlockedContent) profileUnlockedContent.classList.add('hidden');
      } else {
        if (homeGuestView) homeGuestView.classList.add('hidden');
        if (homeAccountView) homeAccountView.classList.remove('hidden');
        if (homeAccountUsername) homeAccountUsername.textContent = u.username;
        if (profileGuestLocked) profileGuestLocked.classList.add('hidden');
        if (profileUnlockedContent) profileUnlockedContent.classList.remove('hidden');
      }

      // 1. Identity Display
      const nameEl = $('profile-display-name');
      const bioEl = $('profile-bio-display');
      const titleEl = $('profile-title-text');
      const headerDisplay = $('header-user-display');
      const flyoutName = $('flyout-username');
      const flyoutRank = $('flyout-rank');

      if (nameEl) nameEl.textContent = u.username;
      if (bioEl) bioEl.textContent = u.bio;
      if (titleEl) titleEl.textContent = AppState.isGuest ? 'Guest Explorer' : u.title;
      if (headerDisplay) headerDisplay.textContent = AppState.isGuest ? 'Guest Explorer' : u.username;
      if (flyoutName) flyoutName.textContent = u.username;
      if (flyoutRank) flyoutRank.textContent = AppState.isGuest ? 'Guest (Account Required)' : u.title;

      // 2. Avatar Display
      const sBadge = $('default-s-badge');
      const customImg = $('custom-avatar-img');
      const gearBtnS = $('gear-btn-s');
      const gearBtnImg = $('gear-btn-img');
      const flyoutS = $('flyout-s-badge');
      const flyoutImg = $('flyout-avatar-img');

      if (!AppState.isGuest && u.avatarDataUrl) {
        if (customImg) { customImg.src = u.avatarDataUrl; customImg.classList.remove('hidden'); }
        if (sBadge) sBadge.classList.add('hidden');
        if (gearBtnImg) { gearBtnImg.src = u.avatarDataUrl; gearBtnImg.classList.remove('hidden'); }
        if (gearBtnS) gearBtnS.classList.add('hidden');
        if (flyoutImg) { flyoutImg.src = u.avatarDataUrl; flyoutImg.classList.remove('hidden'); }
        if (flyoutS) flyoutS.classList.add('hidden');
      } else {
        if (customImg) customImg.classList.add('hidden');
        if (sBadge) sBadge.classList.remove('hidden');
        if (gearBtnImg) gearBtnImg.classList.add('hidden');
        if (gearBtnS) gearBtnS.classList.remove('hidden');
        if (flyoutImg) flyoutImg.classList.add('hidden');
        if (flyoutS) flyoutS.classList.remove('hidden');
      }

      // 3. Banner Image
      const bannerImg = $('profile-banner-img');
      if (bannerImg && u.bannerDataUrl && !AppState.isGuest) {
        bannerImg.src = u.bannerDataUrl;
      }

      // 4. Equipped Frame
      const frameWrapper = $('pfp-frame-wrapper');
      const flyoutFrameWrapper = $('flyout-frame-wrapper');
      if (frameWrapper) {
        frameWrapper.className = `pfp-frame-container frame-${AppState.isGuest ? 'default' : u.equippedFrame} p-1.5 transition-all duration-300`;
      }
      if (flyoutFrameWrapper) {
        flyoutFrameWrapper.className = `pfp-frame-container frame-${AppState.isGuest ? 'default' : u.equippedFrame} p-0.5 shrink-0 transition-all duration-300`;
      }

      // 5. XP Progress Bar & Level
      const currentXP = u.xp || 0;
      const currentLvl = u.level || 1;
      const xpInCurrentLvl = currentXP % 100;
      const xpPercent = xpInCurrentLvl;

      const xpText = $('xp-text-display');
      const xpBar = $('xp-progress-bar');
      const xpTarget = $('xp-target-level');

      if (xpText) xpText.textContent = `${xpInCurrentLvl} / 100 XP (${xpPercent}%)`;
      if (xpBar) xpBar.style.width = `${xpPercent}%`;
      if (xpTarget) xpTarget.textContent = `${currentLvl + 1}`;

      updateStatsCounters();
    }

    function updateStatsCounters() {
      const u = AppState.user;

      const headerStardust = $('header-stardust');
      const headerStreak = $('header-streak');
      const headerLevel = $('header-level');
      const statsLevel = $('stats-level-count');
      const statsAnime = $('stats-anime-count');
      const statsEpisodes = $('stats-episodes-count');
      const statsFav = $('stats-fav-count');
      const statsStardust = $('stats-stardust-count');
      const statsFriends = $('stats-friends-count');
      const shopStardust = $('shop-stardust-display');
      const viewFavCount = $('view-fav-count');
      const profileFavCount = $('profile-fav-tab-count');
      const sidebarFavBadge = $('sidebar-fav-badge');
      const flyoutFavBadge = $('flyout-fav-badge');

      const friendsPill = $('friends-count-pill');
      const subtabFriends = $('subtab-friends-count');
      const subtabIncoming = $('subtab-incoming-count');
      const subtabOutgoing = $('subtab-outgoing-count');
      const sidebarFriendsBadge = $('sidebar-friends-badge');
      const flyoutFriendsBadge = $('flyout-friends-badge');
      const headerNotifContainer = $('header-notification-container');
      const friendsGuestLocked = $('friends-guest-locked');
      const friendsUnlockedContent = $('friends-unlocked-content');

      const friendsCount = (u.friends || []).length;
      const incomingCount = (u.incomingRequests || []).length;
      const outgoingCount = (u.outgoingRequests || []).length;

      if (statsFriends) statsFriends.textContent = AppState.isGuest ? '0' : friendsCount;
      if (friendsPill) friendsPill.textContent = `${friendsCount} ${friendsCount === 1 ? 'Friend' : 'Friends'}`;
      if (subtabFriends) subtabFriends.textContent = friendsCount;
      if (subtabIncoming) subtabIncoming.textContent = incomingCount;
      if (subtabOutgoing) subtabOutgoing.textContent = outgoingCount;
      if (flyoutFriendsBadge) flyoutFriendsBadge.textContent = friendsCount;

      if (sidebarFriendsBadge) {
        if (!AppState.isGuest && incomingCount > 0) {
          sidebarFriendsBadge.textContent = incomingCount;
          sidebarFriendsBadge.classList.remove('hidden');
        } else {
          sidebarFriendsBadge.classList.add('hidden');
        }
      }

      if (AppState.isGuest) {
        // Strict gating: No access to levels, stardust, streak, or notifications without an account
        if (headerStardust) headerStardust.innerHTML = '<i class="fa-solid fa-lock text-[10px] opacity-70"></i> <span>Locked</span>';
        if (headerStreak) headerStreak.innerHTML = '<i class="fa-solid fa-lock text-[10px] opacity-70"></i> <span>Streak: Locked</span>';
        if (headerLevel) headerLevel.innerHTML = '<i class="fa-solid fa-lock text-[10px] opacity-70"></i> <span>Lv --</span>';
        if (statsLevel) statsLevel.textContent = '--';
        if (statsAnime) statsAnime.textContent = '0';
        if (statsEpisodes) statsEpisodes.textContent = '0';
        if (statsFav) statsFav.textContent = '0';
        if (statsStardust) statsStardust.textContent = '--';
        if (shopStardust) shopStardust.textContent = 'Account Required';
        if (headerNotifContainer) headerNotifContainer.classList.add('hidden');
        if (friendsGuestLocked) friendsGuestLocked.classList.remove('hidden');
        if (friendsUnlockedContent) friendsUnlockedContent.classList.add('hidden');
      } else {
        const stardustVal = u.stardust || 0;
        const levelVal = u.level || 1;
        const streakVal = u.streakDays || 0;

        if (headerStardust) headerStardust.textContent = `${stardustVal.toLocaleString()} Stardust`;
        if (headerStreak) headerStreak.textContent = `Streak: ${streakVal} ${streakVal === 1 ? 'Day' : 'Days'}`;
        if (headerLevel) headerLevel.textContent = `Lv ${levelVal}`;
        if (statsLevel) statsLevel.textContent = levelVal;
        if (statsAnime) statsAnime.textContent = u.animeWatched || 0;
        if (statsEpisodes) statsEpisodes.textContent = u.episodesWatched || 0;
        const favCount = AppState.isGuest ? 0 : (typeof getFavoritesList === 'function' ? getFavoritesList().length : 0);
        if (statsFav) statsFav.textContent = favCount;
        if (statsStardust) statsStardust.textContent = stardustVal.toLocaleString();
        if (shopStardust) shopStardust.textContent = `${stardustVal.toLocaleString()} Stardust Available`;
        if (headerNotifContainer) headerNotifContainer.classList.remove('hidden');
        if (friendsGuestLocked) friendsGuestLocked.classList.add('hidden');
        if (friendsUnlockedContent) friendsUnlockedContent.classList.remove('hidden');
      }

      const totalFavs = AppState.isGuest ? 0 : (typeof getFavoritesList === 'function' ? getFavoritesList().length : 0);
      if (viewFavCount) viewFavCount.textContent = totalFavs;
      if (profileFavCount) profileFavCount.textContent = totalFavs;
      if (sidebarFavBadge) {
        if (totalFavs > 0) {
          sidebarFavBadge.textContent = totalFavs;
          sidebarFavBadge.classList.remove('hidden');
        } else {
          sidebarFavBadge.classList.add('hidden');
        }
      }
      if (flyoutFavBadge) flyoutFavBadge.textContent = totalFavs;

      // Admin & Owner Authority Badges & Pulse (Strictly visible ONLY for owner / verified staff)
      const isAdmin = !AppState.isGuest && checkIsAdmin(AppState.user);
      const isPlatformOwner = !AppState.isGuest && isOwner(AppState.user);
      const navTabAdmin = $('nav-tab-btn-admin');
      const gearAdminBtn = $('gear-admin-btn');
      const headerAdminPill = $('header-admin-pill');
      const sidebarAdminPulse = $('sidebar-admin-pulse');
      const gearAdminBadge = $('gear-admin-badge');

      if (navTabAdmin) {
        if (isAdmin) {
          navTabAdmin.classList.remove('hidden');
          navTabAdmin.classList.add('flex');
        } else {
          navTabAdmin.classList.add('hidden');
          navTabAdmin.classList.remove('flex');
        }
      }

      if (gearAdminBtn) {
        if (isAdmin) {
          gearAdminBtn.classList.remove('hidden');
          gearAdminBtn.classList.add('flex');
        } else {
          gearAdminBtn.classList.add('hidden');
          gearAdminBtn.classList.remove('flex');
        }
      }

      if (headerAdminPill) {
        if (isAdmin) {
          headerAdminPill.classList.remove('hidden');
          headerAdminPill.classList.add('flex');
          const pillText = headerAdminPill.querySelector('span');
          if (pillText) pillText.textContent = isPlatformOwner ? 'Owner' : (AppState.user.staffRole ? AppState.user.staffRole.toUpperCase() : 'Staff');
        } else {
          headerAdminPill.classList.remove('flex');
          headerAdminPill.classList.add('hidden');
        }
      }

      if (sidebarAdminPulse) {
        if (isAdmin) {
          sidebarAdminPulse.classList.remove('hidden');
        } else {
          sidebarAdminPulse.classList.add('hidden');
        }
      }

      if (gearAdminBadge) {
        if (isAdmin) {
          gearAdminBadge.textContent = isPlatformOwner ? 'OWNER' : (AppState.user.staffRole ? AppState.user.staffRole.toUpperCase() : 'STAFF');
          gearAdminBadge.className = 'ml-auto text-[9px] px-2 py-0.5 rounded-full bg-red-950/80 text-red-300 border border-red-500/40 font-mono font-bold';
        } else {
          gearAdminBadge.textContent = 'LOCKED';
          gearAdminBadge.className = 'ml-auto text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-slate-400 font-mono';
        }
      }

      renderDailyRewardsUI();
      if (!AppState.isGuest) {
        renderNotificationsUI();
      }
    }

    // ----------------------------------------------------
    // 8. EDIT PROFILE MODAL LOGIC & USERNAME UNIQUENESS
    // (Customization strictly gated behind account)
    // ----------------------------------------------------
    function openEditProfileModal() {
      if (AppState.isGuest) {
        showToast('Customization Locked: Please Sign Up or Log In to customize your profile, avatar, frames, and themes.', 'error');
        openAuthModal('signup');
        return;
      }

      AppState.draft.username = AppState.user.username;
      AppState.draft.bio = AppState.user.bio;
      AppState.draft.equippedFrame = AppState.user.equippedFrame;
      AppState.draft.avatarDataUrl = AppState.user.avatarDataUrl;
      AppState.draft.bannerDataUrl = AppState.user.bannerDataUrl;

      const inputName = $('input-username');
      const inputBio = $('input-bio');
      if (inputName) inputName.value = AppState.draft.username;
      if (inputBio) inputBio.value = AppState.draft.bio;

      handleEditUsernameInput();
      highlightSelectedFrameCard(AppState.draft.equippedFrame);
      updateLivePreview();

      const modal = $('edit-profile-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeEditProfileModal() {
      const modal = $('edit-profile-modal');
      if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    }

    function handleEditUsernameInput() {
      const input = $('input-username');
      const errorEl = $('edit-username-error');
      const successEl = $('edit-username-success');
      const iconEl = $('edit-username-status-icon');
      const saveBtn = $('btn-save-profile');

      if (!input) return;
      const val = input.value.trim();

      AppState.draft.username = val;
      updateLivePreview();

      // Check uniqueness against current user key
      const check = checkUsernameAvailability(val, AppState.user.username);

      if (!check.valid) {
        if (errorEl) {
          errorEl.classList.remove('hidden');
          errorEl.querySelector('span').textContent = check.reason;
        }
        if (successEl) successEl.classList.add('hidden');
        if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark text-red-400 text-xs"></i>';
        if (saveBtn) saveBtn.disabled = true;
      } else {
        if (errorEl) errorEl.classList.add('hidden');
        if (successEl) successEl.classList.remove('hidden');
        if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400 text-xs"></i>';
        if (saveBtn) saveBtn.disabled = false;
      }
    }

    function updateLivePreview() {
      const inputBio = $('input-bio');
      const nameVal = AppState.draft.username || AppState.user.username;
      const bioVal = inputBio?.value.trim() || AppState.draft.bio;

      const previewName = $('preview-username');
      const previewBio = $('preview-bio');
      const previewFrame = $('preview-frame-wrapper');
      const previewS = $('preview-s-badge');
      const previewImg = $('preview-avatar-img');

      if (previewName) previewName.textContent = nameVal;
      if (previewBio) previewBio.textContent = bioVal;

      if (previewFrame) {
        previewFrame.className = `pfp-frame-container frame-${AppState.draft.equippedFrame} p-1 transition-all duration-300 shrink-0`;
      }

      if (AppState.draft.avatarDataUrl && previewImg && previewS) {
        previewImg.src = AppState.draft.avatarDataUrl;
        previewImg.classList.remove('hidden');
        previewS.classList.add('hidden');
      } else if (previewImg && previewS) {
        previewImg.classList.add('hidden');
        previewS.classList.remove('hidden');
      }
    }

    function selectFrame(frameName) {
      AppState.draft.equippedFrame = frameName;
      highlightSelectedFrameCard(frameName);
      updateLivePreview();
      showToast(`Selected ${frameName.toUpperCase()} Frame!`, 'info');
    }

    function highlightSelectedFrameCard(selectedName) {
      const cards = document.querySelectorAll('.frame-option-card');
      cards.forEach(card => {
        const frame = card.getAttribute('data-frame');
        if (frame === selectedName) {
          card.classList.add('border-purple-500', 'bg-purple-950/40', 'shadow-[0_0_15px_rgba(168,85,247,0.3)]');
          card.classList.remove('border-white/10');
        } else {
          card.classList.remove('border-purple-500', 'bg-purple-950/40', 'shadow-[0_0_15px_rgba(168,85,247,0.3)]');
          card.classList.add('border-white/10');
        }
      });
    }

    // Local Device Photo Pickers via FileReader API
    function handleModalAvatarUpload(event) {
      if (AppState.isGuest) {
        showToast('Customization Locked: Sign Up or Log In to upload custom photos.', 'error');
        openAuthModal('signup');
        return;
      }
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        AppState.draft.avatarDataUrl = e.target?.result;
        updateLivePreview();
        showToast('Avatar photo selected from device!', 'success');
      };
      reader.readAsDataURL(file);
    }

    function handleDirectAvatarUpload(event) {
      if (AppState.isGuest) {
        showToast('Customization Locked: Sign Up or Log In to upload custom photos.', 'error');
        openAuthModal('signup');
        return;
      }
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        const result = e.target?.result;
        AppState.user.avatarDataUrl = result;
        saveUserToLocalStorage();
        updateViewableProfileUI();
        showToast('Profile photo updated successfully!', 'success');
      };
      reader.readAsDataURL(file);
    }

    function resetAvatarToDefaultS() {
      if (AppState.isGuest) {
        showToast('Customization Locked: Sign Up or Log In to modify avatar.', 'error');
        openAuthModal('signup');
        return;
      }
      AppState.draft.avatarDataUrl = null;
      updateLivePreview();
      showToast('Avatar reset to default "S" badge.', 'info');
    }

    function handleModalBannerUpload(event) {
      if (AppState.isGuest) {
        showToast('Customization Locked: Sign Up or Log In to upload custom photos.', 'error');
        openAuthModal('signup');
        return;
      }
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        AppState.draft.bannerDataUrl = e.target?.result;
        showToast('Custom banner selected from device!', 'success');
      };
      reader.readAsDataURL(file);
    }

    function handleDirectBannerUpload(event) {
      if (AppState.isGuest) {
        showToast('Customization Locked: Sign Up or Log In to upload custom photos.', 'error');
        openAuthModal('signup');
        return;
      }
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        const result = e.target?.result;
        AppState.user.bannerDataUrl = result;
        saveUserToLocalStorage();
        updateViewableProfileUI();
        showToast('Banner updated successfully!', 'success');
      };
      reader.readAsDataURL(file);
    }

    // Save Profile Changes
    function saveProfileChanges() {
      const inputName = $('input-username');
      const inputBio = $('input-bio');
      const newName = inputName?.value.trim();

      if (!newName) {
        showToast('Username cannot be empty.', 'error');
        return;
      }

      // Check uniqueness if username changed
      if (newName.toLowerCase() !== AppState.user.username.toLowerCase()) {
        const check = checkUsernameAvailability(newName, AppState.user.username);
        if (!check.valid) {
          showToast(check.reason, 'error');
          return;
        }

        // Rename key in users db
        if (!AppState.isGuest && AppState.currentUserKey) {
          const users = getUsersDB();
          const oldData = users[AppState.currentUserKey];
          delete users[AppState.currentUserKey];
          const newKey = newName.toLowerCase();
          users[newKey] = { ...oldData, username: newName };
          saveUsersDB(users);
          AppState.currentUserKey = newKey;
          setActiveSession({ username: newName, isGuest: false });
        }
      }

      AppState.user.username = newName;
      if (inputBio) AppState.user.bio = inputBio.value.trim();
      if (AppState.draft.equippedFrame) AppState.user.equippedFrame = AppState.draft.equippedFrame;

      if (AppState.draft.avatarDataUrl !== undefined) {
        AppState.user.avatarDataUrl = AppState.draft.avatarDataUrl;
      }
      if (AppState.draft.bannerDataUrl) {
        AppState.user.bannerDataUrl = AppState.draft.bannerDataUrl;
      }

      saveUserToLocalStorage();
      updateViewableProfileUI();
      closeEditProfileModal();
      showToast('Profile configuration saved & updated immediately!', 'success');
    }

    // ----------------------------------------------------
    // 9. CONTENT TABS & DISPLAY MODE SWITCHER
    // ----------------------------------------------------
    function switchContentTab(tabName) {
      const historyTab = $('content-tab-history');
      const favTab = $('content-tab-favourites');
      const btnHistory = $('tab-btn-history');
      const btnFav = $('tab-btn-favourites');

      if (tabName === 'history') {
        if (historyTab) historyTab.classList.remove('hidden');
        if (favTab) favTab.classList.add('hidden');
        if (btnHistory) btnHistory.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-purple-600 text-white shadow-sm cursor-pointer';
        if (btnFav) btnFav.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer';
      } else {
        if (favTab) favTab.classList.remove('hidden');
        if (historyTab) historyTab.classList.add('hidden');
        if (btnFav) btnFav.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-purple-600 text-white shadow-sm cursor-pointer';
        if (btnHistory) btnHistory.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer';
      }
    }

    function setLayoutMode(mode) {
      AppState.layoutMode = mode;
      const historyGrid = $('content-tab-history');
      const favGrid = $('content-tab-favourites');
      const btnCards = $('layout-btn-cards');
      const btnList = $('layout-btn-list');

      const applyMode = (el) => {
        if (!el) return;
        if (mode === 'cards') {
          el.className = el.className.replace('view-list-grid', 'view-cards-grid');
        } else {
          el.className = el.className.replace('view-cards-grid', 'view-list-grid');
        }
      };

      applyMode(historyGrid);
      applyMode(favGrid);

      if (mode === 'cards') {
        if (btnCards) btnCards.className = 'px-2.5 py-1 rounded-lg text-white bg-white/10 transition-colors cursor-pointer';
        if (btnList) btnList.className = 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer';
        showToast('Switched to 3D Glass Cards View', 'info');
      } else {
        if (btnList) btnList.className = 'px-2.5 py-1 rounded-lg text-white bg-white/10 transition-colors cursor-pointer';
        if (btnCards) btnCards.className = 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer';
        showToast('Switched to Compact List View', 'info');
      }
    }

    // ----------------------------------------------------
    // 10. REAL-TIME THEME ACCENT SWITCHER
    // ----------------------------------------------------
    function toggleDashboardThemeMenu(event) {
      if (event) event.stopPropagation();
      const menu = $('dashboard-theme-dropdown');
      if (menu) {
        menu.classList.toggle('hidden');
      }
    }

    function closeDashboardThemeMenu() {
      const menu = $('dashboard-theme-dropdown');
      if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
      }
    }

    function setCosmicTheme(theme, notify = true) {
      AppState.theme = theme;
      if (AppState.user) {
        AppState.user.theme = theme;
      }
      localStorage.setItem('soranix_theme', theme);
      saveUserToLocalStorage();

      if (theme === 'violet') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }

      // Update checkmarks in dashboard theme dropdown
      document.querySelectorAll('[data-theme-check]').forEach(icon => {
        if (icon.getAttribute('data-theme-check') === theme) {
          icon.classList.remove('hidden');
        } else {
          icon.classList.add('hidden');
        }
      });

      if (notify) showToast(`Theme active: ${theme.toUpperCase()}`, 'info');
    }

    // ----------------------------------------------------
    // 11. DAILY REWARDS ENGINE (Starts at Day 1, Account Required)
    // ----------------------------------------------------
    function renderDailyRewardsUI() {
      const container = $('daily-rewards-container');
      const streakDisplay = $('rewards-streak-display');
      if (!container) return;

      const streakDays = AppState.user.streakDays || 0;
      if (streakDisplay) {
        streakDisplay.textContent = `Active Streak: ${streakDays} ${streakDays === 1 ? 'Day' : 'Days'}`;
      }

      if (AppState.isGuest) {
        if (streakDisplay) streakDisplay.innerHTML = '<i class="fa-solid fa-lock text-amber-400"></i> <span>Streak: Locked</span>';
        container.innerHTML = `
          <div class="glass-panel rounded-2xl p-8 sm:p-12 text-center border border-dashed border-amber-500/40 flex flex-col items-center justify-center space-y-4">
            <div class="w-14 h-14 rounded-2xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-solarGold text-3xl shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <i class="fa-solid fa-lock"></i>
            </div>
            <div class="space-y-1">
              <h3 class="text-xl font-display font-extrabold text-white">Daily Rewards Locked</h3>
              <p class="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
                You do not have access to daily rewards or login streaks without an account. Sign in or create an account to start your streak and claim Day 1 (+100 Stardust Coins).
              </p>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button onclick="openAuthModal('signup')" class="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-black shadow-md cursor-pointer transition-all flex items-center gap-2">
                <i class="fa-solid fa-user-plus"></i>
                <span>Sign Up to Unlock</span>
              </button>
              <button onclick="openAuthModal('login')" class="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer transition-all flex items-center gap-2">
                <i class="fa-solid fa-lock"></i>
                <span>Log In</span>
              </button>
              <button onclick="triggerFirebaseGoogleLogin()" class="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer transition-all flex items-center gap-2">
                <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Sign in with Google</span>
              </button>
            </div>
          </div>
        `;
      } else {
        const isDay1Claimed = AppState.user.day1Claimed;

        container.innerHTML = `
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <!-- Day 1 -->
            <div class="glass-card rounded-2xl p-3 text-center ${isDay1Claimed ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-amber-400 bg-amber-950/30 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse'}">
              <span class="text-[10px] uppercase font-bold ${isDay1Claimed ? 'text-emerald-400' : 'text-amber-300'}">Day 1 ${isDay1Claimed ? '&bull; Completed' : '&bull; Ready'}</span>
              <p class="text-base font-extrabold ${isDay1Claimed ? 'text-white' : 'text-amber-300'} mt-1">+100</p>
              ${isDay1Claimed ? '<i class="fa-solid fa-circle-check text-emerald-400 text-xs mt-2 block"></i>' : '<button onclick="claimDay1Reward(this)" class="mt-2 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-[10px] font-bold text-black cursor-pointer shadow-md">Claim</button>'}
            </div>

            <!-- Day 2 -->
            <div class="glass-card rounded-2xl p-3 text-center opacity-60">
              <span class="text-[10px] uppercase font-bold text-slate-400">Day 2</span>
              <p class="text-base font-extrabold text-slate-300 mt-1">+150</p>
              <i class="fa-solid fa-lock text-slate-500 text-xs mt-2"></i>
            </div>

            <!-- Day 3 -->
            <div class="glass-card rounded-2xl p-3 text-center opacity-60">
              <span class="text-[10px] uppercase font-bold text-slate-400">Day 3</span>
              <p class="text-base font-extrabold text-slate-300 mt-1">+200</p>
              <i class="fa-solid fa-lock text-slate-500 text-xs mt-2"></i>
            </div>

            <!-- Day 4 -->
            <div class="glass-card rounded-2xl p-3 text-center opacity-60">
              <span class="text-[10px] uppercase font-bold text-slate-400">Day 4</span>
              <p class="text-base font-extrabold text-slate-300 mt-1">+250</p>
              <i class="fa-solid fa-lock text-slate-500 text-xs mt-2"></i>
            </div>

            <!-- Day 5 (Locked) -->
            <div class="glass-card rounded-2xl p-3 text-center opacity-60">
              <span class="text-[10px] uppercase font-bold text-slate-400">Day 5</span>
              <p class="text-base font-extrabold text-slate-300 mt-1">+350</p>
              <i class="fa-solid fa-lock text-slate-500 text-xs mt-2"></i>
            </div>

            <!-- Day 6 (Locked) -->
            <div class="glass-card rounded-2xl p-3 text-center opacity-60">
              <span class="text-[10px] uppercase font-bold text-slate-400">Day 6</span>
              <p class="text-base font-extrabold text-slate-300 mt-1">+500</p>
              <i class="fa-solid fa-lock text-slate-500 text-xs mt-2"></i>
            </div>

            <!-- Day 7 Grand (Locked) -->
            <div class="glass-card rounded-2xl p-3 text-center opacity-60 border-purple-500/30">
              <span class="text-[10px] uppercase font-bold text-purple-300">Day 7 Grand</span>
              <p class="text-base font-extrabold text-purple-300 mt-1">+1,000</p>
              <i class="fa-solid fa-gift text-purple-400 text-xs mt-2"></i>
            </div>
          </div>
        `;
      }
    }

    function claimDay1Reward(btn) {
      if (AppState.isGuest) {
        showToast('Please log in or sign up to claim daily login rewards!', 'info');
        openAuthModal('signup');
        return;
      }
      AppState.user.day1Claimed = true;
      AppState.user.streakDays = 1;
      AppState.user.stardust = (AppState.user.stardust || 0) + 100;
      saveUserToLocalStorage();
      updateViewableProfileUI();
      renderDailyRewardsUI();
      showToast('🎉 Day 1 Streak Claimed! +100 Stardust Coins added to your vault!', 'success');
    }

    // ----------------------------------------------------
    // 12. BUG REPORT MODAL
    // ----------------------------------------------------
    function openBugReportModal() {
      const modal = $('bug-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    }

    function closeBugReportModal() {
      const modal = $('bug-modal');
      if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
      }
    }

    function handleBugSubmit(e) {
      e.preventDefault();
      closeBugReportModal();
      showToast('Transmission received! Bug report filed with Soranix telemetry.', 'success');
    }

    // ----------------------------------------------------
    // 13. FIREBASE GOOGLE AUTHENTICATION INTEGRATION
    // ----------------------------------------------------
    testConnection().then((connected) => {
      if (connected) {
        console.log('[Soranix] Cloud Firestore connection active.');
      }
    });

    async function triggerFirebaseGoogleLogin() {
      try {
        closeAuthModal();
        showToast('Connecting with Google...', 'info');
        const user = await signInWithGoogle();
        if (user) {
          const userEmail = (user.email || '').trim().toLowerCase();
          const isGoogleOwner = userEmail === OWNER_EMAIL;
          const googleUsername = user.displayName ? user.displayName.replace(/\s+/g, '') : (isGoogleOwner ? 'JaydenTorru' : `Voyager_${Math.floor(Math.random()*1000)}`);
          const users = getUsersDB();
          let finalUsername = googleUsername;
          let counter = 1;

          while (users[finalUsername.toLowerCase()] && users[finalUsername.toLowerCase()].email !== user.email) {
            finalUsername = `${googleUsername}${counter++}`;
          }

          let existingUser = users[finalUsername.toLowerCase()];
          if (!existingUser) {
            existingUser = createInitialUser(finalUsername, user.email || '');
          }

          existingUser.email = user.email || '';
          if (user.photoURL && !existingUser.avatarDataUrl) {
            existingUser.avatarDataUrl = user.photoURL;
          }

          // STRICT CHECK: IF LOGIN IS JAYDENTORRU4@GMAIL.COM -> GRANT OWNER ACCESS!
          if (isGoogleOwner) {
            existingUser.isOwner = true;
            existingUser.isAdmin = true;
            existingUser.staffRole = 'owner';
            existingUser.title = 'System Administrator / Owner';
            existingUser.level = Math.max(existingUser.level || 1, 999);
            existingUser.stardust = Math.max(existingUser.stardust || 0, 999999);
            existingUser.equippedFrame = 'cosmic';
          }

          users[finalUsername.toLowerCase()] = existingUser;
          saveUsersDB(users);

          AppState.isGuest = false;
          AppState.currentUserKey = finalUsername.toLowerCase();
          AppState.user = existingUser;
          setActiveSession({ username: finalUsername, isGuest: false });

          updateViewableProfileUI();
          enterDashboard('profile');
          if (isGoogleOwner) {
            SoranixAudio.play('power_up');
            showToast('👑 Owner Authenticated (jaydentorru4@gmail.com)! Administrator clearance granted.', 'success');
          } else {
            showToast(`Google Sign-In successful! Welcome, ${finalUsername}.`, 'success');
          }
        }
      } catch (err) {
        showToast('Google sign-in canceled or failed.', 'error');
      }
    }

    // Auto-sync Firebase Auth state
    onAuthStateChanged(auth, (user) => {
      if (user && user.email && user.email.trim().toLowerCase() === OWNER_EMAIL) {
        if (!AppState.isGuest && AppState.user) {
          AppState.user.email = OWNER_EMAIL;
          AppState.user.isOwner = true;
          AppState.user.isAdmin = true;
          AppState.user.title = 'System Administrator / Owner';
          saveUserToLocalStorage();
          updateViewableProfileUI();
        }
      }
    });

    // ----------------------------------------------------
    // 14. CANVAS STARFIELD ENGINE
    // ----------------------------------------------------
    (function initStarfield() {
      const canvas = $('galaxy-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let stars = [];
      let width = 0;
      let height = 0;

      function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        const count = Math.min(Math.max(Math.floor((width * height) / 5000), 120), 300);
        stars = [];
        for (let i = 0; i < count; i++) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.5 + 0.3,
            alpha: Math.random() * 0.8 + 0.2,
            twinkleSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
            driftY: Math.random() * 0.2 + 0.05
          });
        }
      }

      function render() {
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          s.alpha += s.twinkleSpeed;
          if (s.alpha > 0.95 || s.alpha < 0.15) {
            s.twinkleSpeed = -s.twinkleSpeed;
          }

          s.y += s.driftY;
          if (s.y > height) {
            s.y = 0;
            s.x = Math.random() * width;
          }

          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(235, 225, 255, ${Math.max(0.1, Math.min(1, s.alpha))})`;
          ctx.fill();
        }

        requestAnimationFrame(render);
      }

      window.addEventListener('resize', resize);
      resize();
      render();
    })();

    // ====================================================
    // 15. WEB AUDIO API SYNTHESIZER (ZERO-ASSET SOUND ENGINE)
    // ====================================================
    const SoranixAudio = {
      ctx: null,
      init() {
        if (!this.ctx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            this.ctx = new AudioContextClass();
          }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      },
      play(type) {
        try {
          this.init();
          if (!this.ctx) return;
          const ctx = this.ctx;
          const now = ctx.currentTime;

          if (type === 'coin') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(987.77, now);
            osc.frequency.setValueAtTime(1318.51, now + 0.08);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
          } else if (type === 'level_up') {
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(freq, now + i * 0.09);
              gain.gain.setValueAtTime(0.2, now + i * 0.09);
              gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.3);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(now + i * 0.09);
              osc.stop(now + i * 0.09 + 0.35);
            });
          } else if (type === 'sword') {
            const bufferSize = Math.floor(ctx.sampleRate * 0.2);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
              data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(3200, now);
            filter.frequency.exponentialRampToValueAtTime(600, now + 0.2);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            noise.start(now);
          } else if (type === 'power_up') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
          } else if (type === 'laser') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(120, now + 0.22);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.22);
          } else if (type === 'bell') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1760, now);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.8);
          } else {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.05);
          }
        } catch (e) {}
      }
    };

    // ====================================================
    // 16. EXPANDED COSMIC SHOP (105+ WELL-CRAFTED ANIME ITEMS)
    // ====================================================
    const COSMIC_SHOP_CATALOG = [
      // CATEGORY 1: PFP FRAMES (26 items)
      { id: 'frame_standard', name: 'Standard Voyager Frame', category: 'frame', cost: 0, frameClass: 'standard', icon: 'fa-regular fa-square', desc: 'Minimalist frosted border for cosmic apprentices.' },
      { id: 'frame_cyberpunk', name: 'Cyberpunk Neon Frame', category: 'frame', cost: 250, frameClass: 'cyberpunk', icon: 'fa-solid fa-bolt', desc: 'High-contrast cyan & magenta spinning dashed aura.' },
      { id: 'frame_galaxy', name: 'Galaxy Ring Frame', category: 'frame', cost: 300, frameClass: 'galaxy', icon: 'fa-solid fa-circle-notch', desc: 'Pulsing ultraviolet nebula orbit with rotating cosmic ring.' },
      { id: 'frame_flame', name: 'Flame Aura Frame', category: 'frame', cost: 350, frameClass: 'flame', icon: 'fa-solid fa-fire', desc: 'Blazing shonen energy radiating dynamic amber and crimson heat.' },
      { id: 'frame_crown', name: 'Golden Crown Frame', category: 'frame', cost: 500, frameClass: 'crown', icon: 'fa-solid fa-crown', desc: 'Regal golden crown crest for elite anime voyagers.' },
      { id: 'frame_void', name: 'Void Halo Frame', category: 'frame', cost: 450, frameClass: 'void', icon: 'fa-solid fa-atom', desc: 'Pulsing deep ultraviolet event horizon ring.' },
      { id: 'frame_supersaiyan', name: 'Super Saiyan Ki Frame', category: 'frame', cost: 600, frameClass: 'supersaiyan', icon: 'fa-solid fa-burst', desc: 'Intense golden ki aura vibrating with electric sparks.' },
      { id: 'frame_sharingan', name: 'Sharingan Eye Frame', category: 'frame', cost: 650, frameClass: 'sharingan', icon: 'fa-solid fa-eye', desc: 'Three-tomoe crimson eye border steeped in ancient shinobi power.' },
      { id: 'frame_waterdragon', name: 'Water Dragon Wave Frame', category: 'frame', cost: 550, frameClass: 'waterdragon', icon: 'fa-solid fa-water', desc: 'Flowing azure-teal breathing form with crashing surf glow.' },
      { id: 'frame_cursedenergy', name: 'Cursed Energy Frame', category: 'frame', cost: 600, frameClass: 'cursedenergy', icon: 'fa-solid fa-skull', desc: 'Deep indigo spirit mist pulsating with special-grade sorcery.' },
      { id: 'frame_sandevistan', name: 'Sandevistan Overdrive Frame', category: 'frame', cost: 700, frameClass: 'sandevistan', icon: 'fa-solid fa-gauge-high', desc: 'High-speed cyber yellow afterimage trail with optic matrix blur.' },
      { id: 'frame_sakura', name: 'Sakura Petals Frame', category: 'frame', cost: 350, frameClass: 'sakura', icon: 'fa-solid fa-spa', desc: 'Soft pastel pink aura adorned with floating cherry blossom petals.' },
      { id: 'frame_lightning', name: 'High-Voltage Lightning Frame', category: 'frame', cost: 500, frameClass: 'lightning', icon: 'fa-solid fa-bolt-lightning', desc: 'Crackling electric blue and yellow lightning storm perimeter.' },
      { id: 'frame_blooddemon', name: 'Blood Demon Crest Frame', category: 'frame', cost: 650, frameClass: 'blooddemon', icon: 'fa-solid fa-droplet', desc: 'Crimson and magenta demon art sigil glowing under blood moons.' },
      { id: 'frame_iceempress', name: 'Ice Empress Crystal Frame', category: 'frame', cost: 550, frameClass: 'iceempress', icon: 'fa-solid fa-snowflake', desc: 'Sub-zero crystalline frost ring forged from glacial spires.' },
      { id: 'frame_solarflare', name: 'Solar Flare Corona Frame', category: 'frame', cost: 600, frameClass: 'solarflare', icon: 'fa-solid fa-sun', desc: 'Blazing thermonuclear solar prominence erupting in plasma arcs.' },
      { id: 'frame_neondemon', name: 'Neon Demon Horns Frame', category: 'frame', cost: 750, frameClass: 'neondemon', icon: 'fa-solid fa-ghost', desc: 'Cyberpunk Oni mask geometry in ultraviolet neon violet.' },
      { id: 'frame_phoenix', name: 'Phoenix Rebirth Frame', category: 'frame', cost: 800, frameClass: 'phoenix', icon: 'fa-solid fa-dove', desc: 'Radiant eternal flame wings surging from golden embers.' },
      { id: 'frame_prism', name: 'Holo Prism Frame', category: 'frame', cost: 500, frameClass: 'prism', icon: 'fa-solid fa-cubes', desc: 'Chromatic aberration spectrum shifting across RGB facets.' },
      { id: 'frame_cybergrid', name: 'Retro Cyber Grid Frame', category: 'frame', cost: 400, frameClass: 'cybergrid', icon: 'fa-solid fa-terminal', desc: 'Phosphor green matrix terminal grid with animated scanlines.' },
      { id: 'frame_moonlight', name: 'Moonlight Crescent Frame', category: 'frame', cost: 450, frameClass: 'moonlight', icon: 'fa-solid fa-moon', desc: 'Silvery lunar crescent sheen bathed in celestial stardust.' },
      { id: 'frame_toxic', name: 'Biohazard Toxic Frame', category: 'frame', cost: 450, frameClass: 'toxic', icon: 'fa-solid fa-biohazard', desc: 'Radioactive neon lime acid wash with volatile bio-luminescence.' },
      { id: 'frame_angel', name: 'Archangel Halo Frame', category: 'frame', cost: 850, frameClass: 'angel', icon: 'fa-solid fa-feather', desc: 'Divine golden ring crowned with pure radiant luminescence.' },
      { id: 'frame_dragonslayer', name: 'Dragon Slayer Crest Frame', category: 'frame', cost: 900, frameClass: 'dragonslayer', icon: 'fa-solid fa-dragon', desc: 'Dark titanium scales etched with ancient dragon flame runes.' },
      { id: 'frame_titanarmor', name: 'Titan Armored Frame', category: 'frame', cost: 700, frameClass: 'titanarmor', icon: 'fa-solid fa-shield-halved', desc: 'Hardened battle plate forged to withstand wall-level impacts.' },
      { id: 'frame_ninetails', name: 'Nine Tails Chakra Frame', category: 'frame', cost: 950, frameClass: 'ninetails', icon: 'fa-solid fa-paw', desc: 'Legendary vermilion chakra beast shroud burning with raw fury.' },

      // CATEGORY 2: PROFILE BANNERS (15 items)
      { id: 'banner_nebula', name: 'Infinite Cosmic Nebula', category: 'banner', cost: 200, bannerUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-image', desc: 'Deep violet galactic cloud nursery swirling across dark void.' },
      { id: 'banner_tokyo_cyber', name: 'Neo-Tokyo Cyber City', category: 'banner', cost: 350, bannerUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-city', desc: 'Futuristic metropolis skyscrapers drenched in magenta rainfall.' },
      { id: 'banner_shinjuku', name: 'Midnight Shinjuku Alley', category: 'banner', cost: 400, bannerUrl: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-road', desc: 'Glowing lantern alleys reflecting neon lights after midnight.' },
      { id: 'banner_dragon_temple', name: 'Dragon Mountain Shrine', category: 'banner', cost: 450, bannerUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-torii-gate', desc: 'Historic mountain temple overlooking mist-covered bamboo peaks.' },
      { id: 'banner_supernova', name: 'Supernova Horizon', category: 'banner', cost: 500, bannerUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-meteor', desc: 'Cataclysmic star collapse shockwaves lighting up deep space.' },
      { id: 'banner_sakura_moon', name: 'Cherry Blossom Blood Moon', category: 'banner', cost: 400, bannerUrl: 'https://images.unsplash.com/photo-1528164344705-475426879c0d?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-moon', desc: 'Full crimson moon illuminating ancient blooming sakura trees.' },
      { id: 'banner_synthwave', name: 'Outrun Synthwave Sunset', category: 'banner', cost: 350, bannerUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-mountain', desc: 'Retrofuturistic wireframe grid sunset with digital palms.' },
      { id: 'banner_singularity', name: 'Void Singularity', category: 'banner', cost: 600, bannerUrl: 'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-circle', desc: 'Gravitational lensing ring bending spacetime around a black hole.' },
      { id: 'banner_coral_ruins', name: 'Abyssal Sunken Temple', category: 'banner', cost: 400, bannerUrl: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-water', desc: 'Bioluminescent deep-sea ruins humming with ancient forgotten mana.' },
      { id: 'banner_valhalla', name: 'Nordic Valhalla Aurora', category: 'banner', cost: 500, bannerUrl: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-wind', desc: 'Dancing green and violet northern lights across frozen glaciers.' },
      { id: 'banner_cyber_alley', name: 'Cyberpunk Rainy Alley', category: 'banner', cost: 350, bannerUrl: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-umbrella', desc: 'Holographic billboards illuminating reflective puddle ripples.' },
      { id: 'banner_stargate', name: 'Hyperdrive Stargate', category: 'banner', cost: 550, bannerUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-ring', desc: 'Colossal orbital accelerator ring bridging distant galactic clusters.' },
      { id: 'banner_solar_eruption', name: 'Solar Corona Eruption', category: 'banner', cost: 450, bannerUrl: 'https://images.unsplash.com/photo-1447433589675-4aaa569f3e05?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-sun', desc: 'Molten prominence arcs leaping millions of kilometers into space.' },
      { id: 'banner_astral_portal', name: 'Astral Realm Gateway', category: 'banner', cost: 650, bannerUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-archway', desc: 'Celestial stone archway opening into the infinite star corridor.' },
      { id: 'banner_mech_hangar', name: 'Mecha Orbital Hangar', category: 'banner', cost: 500, bannerUrl: 'https://images.unsplash.com/photo-1464802686167-b939a6910659?auto=format&fit=crop&w=1600&q=80', icon: 'fa-solid fa-robot', desc: 'Massive orbital dockyard preparing humanoid combat mechs.' },

      // CATEGORY 3: NAME GLOWS (12 items)
      { id: 'glow_cyan', name: 'Electric Cyan Glow', category: 'name_glow', cost: 300, glowClass: 'name-glow-cyan', icon: 'fa-solid fa-wand-magic-sparkles', desc: 'Neon cyan atmospheric luminescence across your username.' },
      { id: 'glow_gold', name: 'Solar Gold Glow', category: 'name_glow', cost: 400, glowClass: 'name-glow-gold', icon: 'fa-solid fa-star', desc: 'Rich golden shimmer denoting prestige and high watch-time.' },
      { id: 'glow_crimson', name: 'Blood Crimson Glow', category: 'name_glow', cost: 450, glowClass: 'name-glow-crimson', icon: 'fa-solid fa-fire-flame-curved', desc: 'Menacing blood-red aura radiating intense dark battle prowess.' },
      { id: 'glow_purple', name: 'Void Amethyst Glow', category: 'name_glow', cost: 350, glowClass: 'name-glow-purple', icon: 'fa-solid fa-gem', desc: 'Deep ultraviolet void energy humming around your tag.' },
      { id: 'glow_emerald', name: 'Emerald Plasma Glow', category: 'name_glow', cost: 300, glowClass: 'name-glow-emerald', icon: 'fa-solid fa-leaf', desc: 'Vibrant verdant green sheen infused with forest spirit aura.' },
      { id: 'glow_pink', name: 'Hyper Magenta Glow', category: 'name_glow', cost: 350, glowClass: 'name-glow-pink', icon: 'fa-solid fa-heart', desc: 'Vivid cyberpunk hot pink glow favored by elite otaku.' },
      { id: 'glow_rainbow', name: 'Chroma Rainbow Prism', category: 'name_glow', cost: 800, glowClass: 'name-glow-rainbow', icon: 'fa-solid fa-rainbow', desc: 'Animated spectrum wave constantly cycling prismatic rainbow hues.' },
      { id: 'glow_ice', name: 'Glacial Frost Glow', category: 'name_glow', cost: 400, glowClass: 'name-glow-ice', icon: 'fa-solid fa-icicles', desc: 'Sub-zero crystal light radiating icy mist.' },
      { id: 'glow_fire', name: 'Blazing Firestorm Glow', category: 'name_glow', cost: 450, glowClass: 'name-glow-fire', icon: 'fa-solid fa-fire', desc: 'Scorching orange corona radiating ember embers.' },
      { id: 'glow_white', name: 'Pure Starlight Radiance', category: 'name_glow', cost: 500, glowClass: 'name-glow-white', icon: 'fa-solid fa-certificate', desc: 'Blinding pure white starlight glow cutting through deep space.' },
      { id: 'glow_lime', name: 'Toxic Lime Bio Glow', category: 'name_glow', cost: 300, glowClass: 'name-glow-lime', icon: 'fa-solid fa-biohazard', desc: 'Radioactive green neon charge highlighting your gamer tag.' },
      { id: 'glow_lavender', name: 'Celestial Lavender Glow', category: 'name_glow', cost: 350, glowClass: 'name-glow-lavender', icon: 'fa-solid fa-cloud-moon', desc: 'Serene ethereal lavender mist for cosmic dreamers.' },

      // CATEGORY 4: CHAT BADGES (18 items)
      { id: 'badge_voyager', name: '[VIP Voyager] Badge', category: 'badge', cost: 200, badgeTitle: 'VIP Voyager', icon: 'fa-solid fa-user-astronaut', desc: 'Distinguished pioneer insignia displayed in Global Chat.' },
      { id: 'badge_anime_god', name: '[Anime God] Badge', category: 'badge', cost: 1000, badgeTitle: 'Anime God', icon: 'fa-solid fa-crown', desc: 'Supreme honor badge for voyagers who have seen it all.' },
      { id: 'badge_demon_king', name: '[Demon King] Badge', category: 'badge', cost: 800, badgeTitle: 'Demon King', icon: 'fa-solid fa-skull', desc: 'Menacing title claimed only by commanders of shadow realms.' },
      { id: 'badge_hokage', name: '[Hokage] Badge', category: 'badge', cost: 750, badgeTitle: 'Hokage', icon: 'fa-solid fa-leaf', desc: 'Supreme leader crest of the Hidden Leaf village.' },
      { id: 'badge_hunter_x', name: '[Hunter X] Badge', category: 'badge', cost: 600, badgeTitle: 'Hunter X', icon: 'fa-solid fa-crosshairs', desc: 'Triple-star Hunter license badge denoting elite hunter rank.' },
      { id: 'badge_titan_shifter', name: '[Titan Shifter] Badge', category: 'badge', cost: 700, badgeTitle: 'Titan Shifter', icon: 'fa-solid fa-hand-fist', desc: 'Inheritor badge of ancient titan power beyond the walls.' },
      { id: 'badge_sorcerer', name: '[Sorcerer Supreme] Badge', category: 'badge', cost: 850, badgeTitle: 'Sorcerer Supreme', icon: 'fa-solid fa-hat-wizard', desc: 'Mastery insignia of domain expansions and boundless cursed energy.' },
      { id: 'badge_captain', name: '[Space Captain] Badge', category: 'badge', cost: 500, badgeTitle: 'Space Captain', icon: 'fa-solid fa-compass', desc: 'Fleet commander authority badge on Soranix transmissions.' },
      { id: 'badge_otaku', name: '[Otaku Master] Badge', category: 'badge', cost: 400, badgeTitle: 'Otaku Master', icon: 'fa-solid fa-tv', desc: 'Certified encyclopedia of seasonal anime and classic OVAs.' },
      { id: 'badge_bankai', name: '[Bankai Master] Badge', category: 'badge', cost: 750, badgeTitle: 'Bankai Master', icon: 'fa-solid fa-kanda', desc: 'Soul Reaper captain status unleashing final blade release.' },
      { id: 'badge_cyber_ronin', name: '[Cyber Ronin] Badge', category: 'badge', cost: 600, badgeTitle: 'Cyber Ronin', icon: 'fa-solid fa-shield-virus', desc: 'Masterless mercenary roaming dystopian virtual networks.' },
      { id: 'badge_pirate_king', name: '[Pirate King] Badge', category: 'badge', cost: 900, badgeTitle: 'Pirate King', icon: 'fa-solid fa-anchor', desc: 'The freest traveler sailing toward the One Treasure.' },
      { id: 'badge_alchemist', name: '[Fullmetal] Badge', category: 'badge', cost: 700, badgeTitle: 'Fullmetal Alchemist', icon: 'fa-solid fa-circle-nodes', desc: 'Equivalent exchange state alchemist pocket watch emblem.' },
      { id: 'badge_ghost', name: '[Cyber Ghost] Badge', category: 'badge', cost: 650, badgeTitle: 'Cyber Ghost', icon: 'fa-solid fa-microchip', desc: 'Disembodied consciousness navigating the worldwide net.' },
      { id: 'badge_shadow_monarch', name: '[Shadow Monarch] Badge', category: 'badge', cost: 1200, badgeTitle: 'Shadow Monarch', icon: 'fa-solid fa-dungeon', desc: '"Arise" — Ruler of infinite shadow soldiers and monarch gates.' },
      { id: 'badge_stand_user', name: '[Stand User] Badge', category: 'badge', cost: 650, badgeTitle: 'Stand User', icon: 'fa-solid fa-arrow-trend-up', desc: 'Manifested fighting spirit visible only to fellow Stand users.' },
      { id: 'badge_saiyan_prince', name: '[Saiyan Prince] Badge', category: 'badge', cost: 800, badgeTitle: 'Saiyan Prince', icon: 'fa-solid fa-meteor', desc: 'Royal saiyan crest burning with unyielding proud warrior spirit.' },
      { id: 'badge_celestial', name: '[Celestial Being] Badge', category: 'badge', cost: 950, badgeTitle: 'Celestial Being', icon: 'fa-solid fa-satellite', desc: 'Transcendent star traveler existing beyond time and space.' },

      // CATEGORY 5: ANIME STICKERS (15 items)
      { id: 'pack_chibi', name: 'Chibi Expressions Pack', category: 'sticker', cost: 150, icon: 'fa-solid fa-face-smile-wink', desc: 'Adorable miniature emotes: 🍙, ✨, 🌸, ⚡, 🍡, 🍥' },
      { id: 'pack_kawaii', name: 'Kawaii Anime Sparks', category: 'sticker', cost: 150, icon: 'fa-solid fa-sparkles', desc: 'Heart sparkles and blushing cute anime reaction emotes.' },
      { id: 'pack_battle', name: 'Shonen Battle Shouts', category: 'sticker', cost: 200, icon: 'fa-solid fa-fire-burner', desc: 'Punchy battle typography: "ORA!", "MUDA!", "PLUS ULTRA!", "BANKAI!"' },
      { id: 'pack_food', name: 'Ramen & Bento Feast', category: 'sticker', cost: 150, icon: 'fa-solid fa-bowl-food', desc: 'Steaming hot anime dishes: tonkotsu ramen, gyoza, dango, matcha.' },
      { id: 'pack_magic', name: 'Magic Circle Emotes', category: 'sticker', cost: 200, icon: 'fa-solid fa-ring', desc: 'Glowing occult pentagrams, alchemy seals, and spell arrays.' },
      { id: 'pack_rage', name: 'Anime Rage Mode', category: 'sticker', cost: 150, icon: 'fa-solid fa-face-angry', desc: 'Popping forehead veins, crimson eye flashes, and steam clouds.' },
      { id: 'pack_nani', name: 'Nani?! Shock Emotes', category: 'sticker', cost: 150, icon: 'fa-solid fa-face-surprise', desc: 'Classic white eye hollow shocks and dramatic speedlines.' },
      { id: 'pack_senpai', name: 'Notice Me Senpai Pack', category: 'sticker', cost: 200, icon: 'fa-solid fa-heart-pulse', desc: 'Playful romance tropes and cherry blossom confessions.' },
      { id: 'pack_gg', name: 'Good Game Transmissions', category: 'sticker', cost: 150, icon: 'fa-solid fa-gamepad', desc: 'Retro arcade "GG WP", "Level Clear", and "Victory Royale" stamps.' },
      { id: 'pack_tea', name: 'Dramatic Tea Sips', category: 'sticker', cost: 150, icon: 'fa-solid fa-mug-hot', desc: 'Smug glasses push and calm teacup sipping during chaos.' },
      { id: 'pack_sweat', name: 'Sweatdrop Reactions', category: 'sticker', cost: 150, icon: 'fa-solid fa-droplet-slash', desc: 'Giant cartoon sweat drops and anime facepalms.' },
      { id: 'pack_hearts', name: 'Heart Eyes Anime', category: 'sticker', cost: 150, icon: 'fa-solid fa-heart', desc: 'Floating pink hearts and starry admiration eyes.' },
      { id: 'pack_ninja', name: 'Stealth Ninja Emotes', category: 'sticker', cost: 200, icon: 'fa-solid fa-mask', desc: 'Smoke bombs, shurikens, kunai blades, and shadow clones.' },
      { id: 'pack_power', name: 'Over 9000 Power Pack', category: 'sticker', cost: 250, icon: 'fa-solid fa-bolt', desc: 'Crushing scouters, energy charge flashes, and crater cracks.' },
      { id: 'pack_victory', name: 'Anime Victory Peace', category: 'sticker', cost: 150, icon: 'fa-solid fa-hand-peace', desc: 'Double peace sign, winks, and confetti celebration bursts.' },

      // CATEGORY 6: THEMES (10 items)
      { id: 'theme_violet', name: 'Cosmic Violet Theme', category: 'theme', cost: 0, themeId: 'violet', icon: 'fa-solid fa-palette', desc: 'Default deep ultraviolet abyss palette with glowing purple nebulae.' },
      { id: 'theme_pink', name: 'Neon Pink Theme', category: 'theme', cost: 200, themeId: 'pink', icon: 'fa-solid fa-palette', desc: 'Cyberpunk hot fuchsia and magenta glow across the dashboard.' },
      { id: 'theme_cyan', name: 'Electric Cyan Theme', category: 'theme', cost: 200, themeId: 'cyan', icon: 'fa-solid fa-palette', desc: 'High-tech luminous turquoise and cyan sci-fi aesthetic.' },
      { id: 'theme_gold', name: 'Solar Gold Theme', category: 'theme', cost: 250, themeId: 'gold', icon: 'fa-solid fa-palette', desc: 'Prestigious warm amber and regal gold glow accents.' },
      { id: 'theme_emerald', name: 'Emerald Green Theme', category: 'theme', cost: 200, themeId: 'emerald', icon: 'fa-solid fa-palette', desc: 'Matrix green and alien planet bioluminescent accents.' },
      { id: 'theme_crimson', name: 'Blood Crimson Theme', category: 'theme', cost: 350, themeId: 'pink', icon: 'fa-solid fa-palette', desc: 'Menacing dark crimson aesthetic with fiery neon flares.' },
      { id: 'theme_abyss', name: 'Abyssal Deep Blue Theme', category: 'theme', cost: 300, themeId: 'cyan', icon: 'fa-solid fa-palette', desc: 'Midnight ocean trench depth with cobalt crystal highlights.' },
      { id: 'theme_sunset', name: 'Retro Sunset Theme', category: 'theme', cost: 300, themeId: 'gold', icon: 'fa-solid fa-palette', desc: 'Warm 80s outrun gradient with orange and lavender tones.' },
      { id: 'theme_monochrome', name: 'Monochrome Void Theme', category: 'theme', cost: 250, themeId: 'violet', icon: 'fa-solid fa-palette', desc: 'Sleek titanium and pure silver stark minimalist contrasts.' },
      { id: 'theme_amethyst', name: 'Royal Amethyst Theme', category: 'theme', cost: 350, themeId: 'violet', icon: 'fa-solid fa-palette', desc: 'Lustrous imperial jewel purple tailored for galactic royalty.' },

      // CATEGORY 7: AUDIO SFX (9 items)
      { id: 'audio_coin', name: '8-Bit Stardust Coin SFX', category: 'audio', cost: 0, sfxType: 'coin', icon: 'fa-solid fa-volume-high', desc: 'Nostalgic dual-tone retro arcade chime on actions and claims.' },
      { id: 'audio_level_up', name: 'Level Up Grand Fanfare', category: 'audio', cost: 200, sfxType: 'level_up', icon: 'fa-solid fa-music', desc: 'Triumphant rising 4-note chord fanfare upon leveling up.' },
      { id: 'audio_sword', name: 'Katana Sword Slash', category: 'audio', cost: 250, sfxType: 'sword', icon: 'fa-solid fa-kanda', desc: 'Synthesized high-speed wind slicing blade strike.' },
      { id: 'audio_power_up', name: 'Saiyan Ki Blast SFX', category: 'audio', cost: 250, sfxType: 'power_up', icon: 'fa-solid fa-burst', desc: 'Surging frequency ramp of explosive inner martial power.' },
      { id: 'audio_laser', name: 'Sci-Fi Laser Cannon', category: 'audio', cost: 200, sfxType: 'laser', icon: 'fa-solid fa-crosshairs', desc: 'Sharp downward photon beam blast on sending transmissions.' },
      { id: 'audio_bell', name: 'Zen Lofi Temple Bell', category: 'audio', cost: 200, sfxType: 'bell', icon: 'fa-solid fa-bell', desc: 'Harmonic resonant bell chime echoing into peaceful quiet.' },
      { id: 'audio_click', name: 'Glass Crystal Tap SFX', category: 'audio', cost: 150, sfxType: 'click', icon: 'fa-solid fa-hand-pointer', desc: 'Soft satisfying haptic click on glass UI elements.' },
      { id: 'audio_warp', name: 'Hyperdrive Warp Pulse', category: 'audio', cost: 300, sfxType: 'power_up', icon: 'fa-solid fa-space-shuttle', desc: 'Resonant sub-bass warp distortion entering lightspeed.' },
      { id: 'audio_fanfare', name: 'Galactic Victory Chime', category: 'audio', cost: 350, sfxType: 'level_up', icon: 'fa-solid fa-trophy', desc: 'Glorious arpeggiated orchestral synthesizer triumph.' }
    ];
    const SHOP_CATALOG = COSMIC_SHOP_CATALOG;

    // Shop Catalog Rendering & Filtering
    function renderShopCatalog() {
      const grid = $('shop-catalog-grid');
      const ownedCountEl = $('shop-owned-count');
      if (!grid) return;

      const userInventory = AppState.user.inventory || ['frame_galaxy', 'theme_violet', 'audio_coin'];
      if (ownedCountEl) ownedCountEl.textContent = userInventory.length;

      const filterCat = AppState.shopCategory || 'all';
      const filterOwnership = AppState.shopOwnership || 'all';
      const search = (AppState.shopSearch || '').toLowerCase().trim();

      const filtered = COSMIC_SHOP_CATALOG.filter(item => {
        if (filterCat !== 'all' && item.category !== filterCat) return false;
        const isOwned = userInventory.includes(item.id);
        if (filterOwnership === 'owned' && !isOwned) return false;
        if (search) {
          const matchName = item.name.toLowerCase().includes(search);
          const matchDesc = item.desc.toLowerCase().includes(search);
          const matchCat = item.category.toLowerCase().includes(search);
          if (!matchName && !matchDesc && !matchCat) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="col-span-full py-16 text-center glass-panel rounded-3xl border border-dashed border-white/10 space-y-3">
            <i class="fa-solid fa-box-open text-3xl text-purple-400/50"></i>
            <h4 class="text-sm font-bold text-white">No Cosmic Items Found</h4>
            <p class="text-xs text-slate-400 max-w-sm mx-auto">
              ${filterOwnership === 'owned' ? 'You have not acquired any items in this category yet. Browse "All Items" to unlock cosmetics with Stardust!' : 'No items match your search filter.'}
            </p>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(item => {
        const isOwned = userInventory.includes(item.id);
        const canAfford = !AppState.isGuest && (AppState.user.stardust || 0) >= item.cost;
        let isEquipped = false;

        if (item.category === 'frame' && AppState.user.equippedFrame === item.frameClass) isEquipped = true;
        if (item.category === 'banner' && AppState.user.bannerDataUrl === item.bannerUrl) isEquipped = true;
        if (item.category === 'name_glow' && AppState.user.equippedNameGlow === item.glowClass) isEquipped = true;
        if (item.category === 'badge' && AppState.user.equippedChatBadge === item.badgeTitle) isEquipped = true;
        if (item.category === 'theme' && (AppState.theme === item.themeId || AppState.user.theme === item.themeId)) isEquipped = true;

        let badgeLabel = item.category.replace('_', ' ').toUpperCase();

        return `
          <div class="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-3 border ${isEquipped ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.3)] bg-purple-950/20' : 'border-white/10'} hover:border-purple-400/50 transition-all">
            <div class="space-y-3">
              <!-- Item Header & Preview (Circular) -->
              <div class="flex items-start justify-between gap-2">
                <div class="w-12 h-12 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0 ${item.category === 'frame' ? 'pfp-frame-container frame-' + item.frameClass : ''}">
                  <i class="${item.icon} text-lg text-accent"></i>
                </div>
                <div class="flex flex-col items-end gap-1">
                  <span class="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-300">
                    ${badgeLabel}
                  </span>
                  ${isEquipped ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">EQUIPPED</span>' : ''}
                </div>
              </div>

              <!-- Title & Description -->
              <div>
                <h4 class="text-sm font-bold text-white line-clamp-1 ${item.glowClass || ''}">${item.name}</h4>
                <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">${item.desc}</p>
              </div>
            </div>

            <!-- Price & Action Button (with Live Preview on Customisables) -->
            <div class="pt-3 border-t border-glassBorder flex items-center justify-between gap-2">
              <div class="flex items-center gap-1 text-xs font-bold ${isOwned ? 'text-slate-400' : 'text-amber-300'}">
                <i class="fa-solid fa-sparkles text-[10px] text-solarGold"></i>
                <span>${item.cost === 0 ? 'FREE' : `${item.cost} Stardust`}</span>
              </div>

              <div class="flex items-center gap-1.5">
                ${(item.category === 'frame' || item.category === 'banner' || item.category === 'name_glow' || item.category === 'badge' || item.category === 'theme' || item.category === 'audio') ? `
                  <button 
                    type="button"
                    onclick="openShopItemPreview('${item.id}')" 
                    class="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 shadow-sm" 
                    title="Live Preview Item"
                  >
                    <i class="${item.category === 'audio' ? 'fa-solid fa-volume-high text-amber-400' : 'fa-solid fa-eye text-cyan-400'} text-[10px]"></i>
                    <span>Preview</span>
                  </button>
                ` : ''}

                ${isEquipped ? `
                  <button disabled class="px-3 py-1.5 rounded-xl bg-white/10 text-slate-400 text-xs font-bold cursor-default">
                    Active
                  </button>
                ` : isOwned ? `
                  <button onclick="equipShopItem('${item.id}')" class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer transition-all shadow-sm">
                    Equip
                  </button>
                ` : `
                  <button onclick="buyShopItem('${item.id}')" class="px-3 py-1.5 rounded-xl ${canAfford ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-white/10 text-slate-400 hover:bg-white/20'} text-xs font-bold cursor-pointer transition-all shadow-sm flex items-center gap-1.5">
                    <i class="fa-solid fa-cart-shopping text-[10px]"></i>
                    <span>Unlock</span>
                  </button>
                `}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function filterShopCategory(cat) {
      AppState.shopCategory = cat;
      const cats = ['all', 'frame', 'banner', 'name_glow', 'badge', 'sticker', 'theme', 'audio'];
      cats.forEach(c => {
        const btn = $(`shop-cat-${c}`);
        if (!btn) return;
        if (c === cat) {
          btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-purple-600 text-white shadow-sm cursor-pointer whitespace-nowrap';
        } else {
          btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/10 cursor-pointer whitespace-nowrap';
        }
      });
      renderShopCatalog();
    }

    function setShopOwnershipFilter(ownership) {
      AppState.shopOwnership = ownership;
      const btnAll = $('shop-filter-all');
      const btnOwned = $('shop-filter-owned');

      if (ownership === 'all') {
        if (btnAll) btnAll.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white/15 text-white transition-all cursor-pointer';
        if (btnOwned) btnOwned.className = 'px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1.5';
      } else {
        if (btnOwned) btnOwned.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white/15 text-white transition-all cursor-pointer flex items-center gap-1.5';
        if (btnAll) btnAll.className = 'px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/10 transition-all cursor-pointer';
      }
      renderShopCatalog();
    }

    function handleShopSearchInput() {
      const input = $('shop-search-input');
      AppState.shopSearch = input ? input.value : '';
      renderShopCatalog();
    }

    function buyShopItem(itemId) {
      if (AppState.isGuest) {
        showToast('Account Required: Please Sign Up or Log In to buy cosmetics from the Cosmic Shop!', 'error');
        openAuthModal('signup');
        return;
      }

      const item = COSMIC_SHOP_CATALOG.find(i => i.id === itemId);
      if (!item) return;

      if (!AppState.user.inventory) {
        AppState.user.inventory = ['frame_galaxy', 'theme_violet', 'audio_coin'];
      }

      if (AppState.user.inventory.includes(itemId)) {
        equipShopItem(itemId);
        return;
      }

      const currentCoins = AppState.user.stardust || 0;
      if (currentCoins < item.cost) {
        showToast(`Insufficient Stardust! You have ${currentCoins} Stardust. Stream anime to earn +50 Stardust every 5 mins!`, 'error');
        return;
      }

      // Deduct coins & add to inventory
      AppState.user.stardust = currentCoins - item.cost;
      AppState.user.inventory.push(itemId);

      SoranixAudio.play('coin');

      // Auto-equip purchased item
      if (item.category === 'frame') AppState.user.equippedFrame = item.frameClass;
      if (item.category === 'banner') AppState.user.bannerDataUrl = item.bannerUrl;
      if (item.category === 'name_glow') AppState.user.equippedNameGlow = item.glowClass;
      if (item.category === 'badge') AppState.user.equippedChatBadge = item.badgeTitle;
      if (item.category === 'theme') setCosmicTheme(item.themeId, false);

      saveUserToLocalStorage();
      updateViewableProfileUI();
      renderShopCatalog();

      addNotification(AppState.user.username, {
        type: 'shop',
        title: 'Cosmic Item Unlocked!',
        body: `You acquired "${item.name}" for ${item.cost} Stardust. Item equipped!`
      });

      showToast(`🎉 Unlocked ${item.name}! Equipped to your cosmic profile.`, 'success');
    }

    function equipShopItem(itemId) {
      const item = COSMIC_SHOP_CATALOG.find(i => i.id === itemId);
      if (!item) return;

      if (item.category === 'frame') {
        AppState.user.equippedFrame = item.frameClass;
        showToast(`Equipped ${item.name}!`, 'info');
      } else if (item.category === 'banner') {
        AppState.user.bannerDataUrl = item.bannerUrl;
        showToast(`Equipped ${item.name}!`, 'info');
      } else if (item.category === 'name_glow') {
        AppState.user.equippedNameGlow = item.glowClass;
        showToast(`Equipped ${item.name}!`, 'info');
      } else if (item.category === 'badge') {
        AppState.user.equippedChatBadge = item.badgeTitle;
        showToast(`Equipped [${item.badgeTitle}] Chat Badge!`, 'info');
      } else if (item.category === 'theme') {
        setCosmicTheme(item.themeId, true);
      } else if (item.category === 'audio') {
        SoranixAudio.play(item.sfxType);
        showToast(`Previewed audio effect: ${item.name}`, 'info');
        return;
      } else if (item.category === 'sticker') {
        showToast(`Sticker pack ${item.name} active in Global & DM chat!`, 'info');
        return;
      }

      SoranixAudio.play('click');
      saveUserToLocalStorage();
      updateViewableProfileUI();
      renderShopCatalog();
    }

    // ----------------------------------------------------
    // LIVE PREVIEW ON CUSTOMISABLE SHOP ITEMS
    // ----------------------------------------------------
    function openShopItemPreview(itemId) {
      const item = COSMIC_SHOP_CATALOG.find(i => i.id === itemId);
      if (!item) return;

      // Audio SFX items play sound effect directly
      if (item.category === 'audio') {
        SoranixAudio.play(item.sfxType);
        showToast(`Sound Preview: Playing "${item.name}" effect 🎵`, 'info');
        return;
      }

      const modal = $('shop-item-preview-modal');
      const nameEl = $('shop-preview-item-name');
      const catEl = $('shop-preview-item-category');
      const descEl = $('shop-preview-item-desc');
      const iconEl = $('shop-preview-item-icon');
      
      if (nameEl) nameEl.textContent = item.name;
      if (catEl) catEl.textContent = item.category.replace('_', ' ');
      if (descEl) descEl.textContent = item.desc;
      if (iconEl) iconEl.className = item.icon || 'fa-solid fa-eye';

      // Current user baseline
      const u = AppState.user;
      const username = AppState.isGuest ? 'Guest Explorer' : u.username;
      const level = u.level || 1;
      const rankTitle = u.title || 'Level 1 Novice Voyager';

      // Computed preview styles
      let previewBanner = u.bannerDataUrl || 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1600&q=80';
      let previewFrame = u.equippedFrame || 'galaxy';
      let previewGlowClass = u.equippedNameGlow || '';
      let previewBadge = u.equippedChatBadge || rankTitle;

      if (item.category === 'banner') previewBanner = item.bannerUrl;
      if (item.category === 'frame') previewFrame = item.frameClass;
      if (item.category === 'name_glow') previewGlowClass = item.glowClass;
      if (item.category === 'badge') previewBadge = item.badgeTitle;

      // 1. Profile Appearance Simulation
      const bannerImg = $('shop-preview-banner-img');
      if (bannerImg) bannerImg.src = previewBanner;

      const frameWrapper = $('shop-preview-frame-wrapper');
      if (frameWrapper) {
        frameWrapper.className = `pfp-frame-container frame-${previewFrame} p-1 shrink-0 rounded-full bg-black/40`;
      }

      const sBadge = $('shop-preview-s-badge');
      const avatarImg = $('shop-preview-avatar-img');
      if (u.avatarDataUrl && avatarImg && sBadge) {
        avatarImg.src = u.avatarDataUrl;
        avatarImg.classList.remove('hidden');
        sBadge.classList.add('hidden');
      } else if (avatarImg && sBadge) {
        avatarImg.classList.add('hidden');
        sBadge.classList.remove('hidden');
        sBadge.textContent = username[0].toUpperCase();
      }

      const usernameEl = $('shop-preview-username');
      if (usernameEl) {
        usernameEl.textContent = username;
        usernameEl.className = `text-sm font-bold truncate ${previewGlowClass || 'text-white'}`;
      }

      const badgePill = $('shop-preview-badge-pill');
      if (badgePill) badgePill.textContent = previewBadge;

      const rankText = $('shop-preview-rank-text');
      if (rankText) rankText.textContent = `Level ${level} Cosmic Voyager`;

      // 2. Global Chat Broadcast Simulation
      const chatFrame = $('shop-preview-chat-frame');
      if (chatFrame) {
        chatFrame.className = `pfp-frame-container frame-${previewFrame} p-0.5 shrink-0 rounded-full`;
      }

      const chatS = $('shop-preview-chat-s');
      const chatImg = $('shop-preview-chat-img');
      if (u.avatarDataUrl && chatImg && chatS) {
        chatImg.src = u.avatarDataUrl;
        chatImg.classList.remove('hidden');
        chatS.classList.add('hidden');
      } else if (chatImg && chatS) {
        chatImg.classList.add('hidden');
        chatS.classList.remove('hidden');
        chatS.textContent = username[0].toUpperCase();
      }

      const chatName = $('shop-preview-chat-name');
      if (chatName) {
        chatName.textContent = username;
        chatName.className = `font-bold text-xs ${previewGlowClass || 'text-white'}`;
      }

      const chatBadge = $('shop-preview-chat-badge');
      if (chatBadge) chatBadge.textContent = previewBadge;

      // 3. Dynamic Action Button Inside Preview Modal
      const btnContainer = $('shop-preview-action-btn-container');
      if (btnContainer) {
        const userInventory = u.inventory || ['frame_galaxy', 'theme_violet', 'audio_coin'];
        const isOwned = userInventory.includes(item.id);
        const canAfford = !AppState.isGuest && (u.stardust || 0) >= item.cost;
        
        let isEquipped = false;
        if (item.category === 'frame' && u.equippedFrame === item.frameClass) isEquipped = true;
        if (item.category === 'banner' && u.bannerDataUrl === item.bannerUrl) isEquipped = true;
        if (item.category === 'name_glow' && u.equippedNameGlow === item.glowClass) isEquipped = true;
        if (item.category === 'badge' && u.equippedChatBadge === item.badgeTitle) isEquipped = true;
        if (item.category === 'theme' && (AppState.theme === item.themeId || u.theme === item.themeId)) isEquipped = true;

        if (isEquipped) {
          btnContainer.innerHTML = `
            <button disabled class="w-full py-2.5 rounded-xl bg-white/10 text-slate-400 text-xs font-bold cursor-default text-center">
              Currently Equipped
            </button>
          `;
        } else if (isOwned) {
          btnContainer.innerHTML = `
            <button onclick="equipShopItem('${item.id}'); closeShopItemPreview();" class="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-accent-glow cursor-pointer text-center">
              Equip Item Now
            </button>
          `;
        } else {
          btnContainer.innerHTML = `
            <button onclick="buyShopItem('${item.id}'); closeShopItemPreview();" class="w-full py-2.5 rounded-xl ${canAfford ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-purple-900/60 text-purple-200 border border-purple-500/40'} text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-2">
              <i class="fa-solid fa-cart-shopping text-xs"></i>
              <span>Unlock (${item.cost === 0 ? 'FREE' : `${item.cost} Stardust`})</span>
            </button>
          `;
        }
      }

      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeShopItemPreview() {
      const modal = $('shop-item-preview-modal');
      if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    }

    // ====================================================
    // 17. GLOBAL CHAT SYSTEM (REAL-TIME, PERSISTENT & CROSS-TAB)
    // ====================================================
    function toggleGlobalChatPanel() {
      const panel = $('global-chat-panel');
      if (!panel) return;

      if (panel.classList.contains('translate-x-full')) {
        panel.classList.remove('translate-x-full');
        AppState.isGlobalChatOpen = true;
        renderGlobalChatMessages();
      } else {
        panel.classList.add('translate-x-full');
        AppState.isGlobalChatOpen = false;
      }
    }

    function closeGlobalChatPanel() {
      const panel = $('global-chat-panel');
      if (panel) {
        panel.classList.add('translate-x-full');
        AppState.isGlobalChatOpen = false;
      }
    }

    function parseSpoilers(text) {
      if (!text) return '';
      return text.replace(/>!([\s\S]*?)!</g, '<span class="spoiler-text" onclick="this.classList.toggle(\'revealed\')">$1</span>');
    }

    function renderGlobalChatMessages() {
      const container = $('global-chat-messages');
      if (!container) return;

      const msgs = getGlobalChatMessages();

      if (msgs.length === 0) {
        container.innerHTML = `
          <div class="h-full min-h-[320px] flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-3">
            <div class="w-14 h-14 rounded-full bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-cyan-400 text-2xl shadow-[0_0_20px_rgba(6,182,212,0.25)]">
              <i class="fa-solid fa-satellite-dish animate-pulse"></i>
            </div>
            <div class="space-y-1">
              <h4 class="text-sm font-bold text-white">No Transmissions Yet</h4>
              <p class="text-xs text-slate-400 max-w-[240px] mx-auto leading-relaxed">
                The global frequency is quiet. Be the first voyager to transmit a message across the stars!
              </p>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = msgs.map(m => {
        const safeText = parseSpoilers(m.message);

        // Official System Broadcast Message
        if (m.isSystemAdmin || m.sender === 'SYSTEM BROADCAST') {
          return `
            <div class="glass-card rounded-2xl p-3.5 border-2 border-red-500/60 bg-gradient-to-r from-red-950/40 via-purple-950/40 to-indigo-950/40 shadow-[0_0_25px_rgba(239,68,68,0.25)] space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-red-400 shadow-[0_0_8px_#ef4444] animate-ping"></span>
                  <span class="font-extrabold text-xs text-red-200 font-display uppercase tracking-wider flex items-center gap-1.5">
                    <i class="fa-solid fa-crown text-solarGold text-[10px]"></i>
                    <span>SYSTEM BROADCAST</span>
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase bg-red-600/40 text-red-200 border border-red-500/60 shadow-sm">
                    ADMIN
                  </span>
                </div>
                <span class="text-[10px] text-red-300/70 font-mono shrink-0">${m.timestamp || ''}</span>
              </div>
              <p class="text-xs text-white font-medium pl-3 border-l-2 border-red-500 leading-relaxed break-words">
                ${safeText}
              </p>
            </div>
          `;
        }

        const isSelf = !AppState.isGuest && m.sender.toLowerCase() === AppState.user.username.toLowerCase();

        return `
          <div class="glass-card rounded-2xl p-3 border border-white/5 hover:border-purple-500/30 transition-all space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <div 
                onclick="openUserProfilePreviewModal('${m.sender}')" 
                class="flex items-center gap-2 cursor-pointer group"
                title="View Voyager Profile"
              >
                <!-- Avatar & Frame Preview (Circular) -->
                <div class="pfp-frame-container frame-${m.senderFrame || 'galaxy'} p-0.5 shrink-0 rounded-full">
                  <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden">
                    ${m.senderAvatar ? `<img src="${m.senderAvatar}" class="w-full h-full object-cover rounded-full" alt="User" />` : `<span>${m.sender[0].toUpperCase()}</span>`}
                  </div>
                </div>

                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-bold text-xs group-hover:underline ${m.senderGlow || 'text-white'}">
                    ${m.sender}
                  </span>
                  <span class="text-[9px] px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 font-mono font-semibold">
                    Lv ${m.senderLevel || 1}
                  </span>
                  ${m.senderTitle ? `
                    <span class="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950/80 text-cyan-300 font-semibold truncate max-w-[110px]">
                      ${m.senderTitle}
                    </span>
                  ` : ''}
                  ${m.isAdmin ? `
                    <span class="text-[9px] px-1.5 py-0.2 rounded bg-red-950/80 text-red-300 border border-red-500/30 font-bold font-mono">
                      ADMIN
                    </span>
                  ` : ''}
                  ${m.isMuted ? `
                    <span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-400 font-mono">
                      MUTED
                    </span>
                  ` : ''}
                </div>
              </div>

              <span class="text-[10px] text-slate-500 font-mono shrink-0">${m.timestamp || ''}</span>
            </div>

            <!-- Message Body -->
            <p class="text-xs text-slate-200 pl-8 leading-relaxed break-words">
              ${safeText}
            </p>
          </div>
        `;
      }).join('');

      container.scrollTop = container.scrollHeight;
    }

    function sendGlobalChatMessage() {
      if (AppState.isGuest) {
        showToast('Transmissions Locked: Sign Up or Log In to chat with fellow cosmic voyagers!', 'info');
        openAuthModal('signup');
        return;
      }

      if (AppState.user.isBanned) {
        showToast('Chat Blocked: Your account has been suspended by Administrator.', 'error');
        return;
      }

      if (AppState.user.mutedUntil && AppState.user.mutedUntil > Date.now()) {
        const remainingMin = Math.ceil((AppState.user.mutedUntil - Date.now()) / 60000);
        showToast(`Chat Muted: You are timed out by Administrator. (${remainingMin}m remaining)`, 'error');
        return;
      }

      const input = $('global-chat-input');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      const isOwner = checkIsAdmin(AppState.user);
      const msgs = getGlobalChatMessages();
      const newMsg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        sender: AppState.user.username,
        senderTitle: isOwner ? 'System Administrator / Owner' : (AppState.user.equippedChatBadge || AppState.user.title || 'Novice Voyager'),
        senderLevel: AppState.user.level || 1,
        senderAvatar: AppState.user.avatarDataUrl || null,
        senderFrame: AppState.user.equippedFrame || 'galaxy',
        senderGlow: AppState.user.equippedNameGlow || null,
        isAdmin: isOwner,
        message: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        time: Date.now()
      };

      msgs.push(newMsg);
      saveGlobalChatMessages(msgs);

      input.value = '';
      SoranixAudio.play('laser');
      renderGlobalChatMessages();
    }

    function insertGlobalEmoji(emoji) {
      const input = $('global-chat-input');
      if (!input) return;
      input.value = `${input.value} ${emoji} `;
      input.focus();
    }

    function toggleGlobalChatVisibilitySetting() {
      AppState.hideGlobalChatSetting = !AppState.hideGlobalChatSetting;
      localStorage.setItem('soranix_hide_global_chat', AppState.hideGlobalChatSetting ? 'true' : 'false');

      const icon = $('modal-chat-toggle-icon');
      const text = $('modal-chat-toggle-text');
      if (AppState.hideGlobalChatSetting) {
        if (icon) icon.className = 'fa-solid fa-eye-slash text-slate-400';
        if (text) text.textContent = 'Hidden';
        closeGlobalChatPanel();
        showToast('Cosmic Global Chat hidden in preference.', 'info');
      } else {
        if (icon) icon.className = 'fa-solid fa-eye text-emerald-400';
        if (text) text.textContent = 'Visible';
        showToast('Cosmic Global Chat enabled in preference.', 'info');
      }
    }

    // ====================================================
    // 18. MEMBER PROFILE PREVIEW MODAL
    // ====================================================
    function openUserProfilePreviewModal(targetUsername) {
      if (!targetUsername) return;
      AppState.previewTargetUser = targetUsername;

      const users = getUsersDB();
      const targetUser = users[targetUsername.toLowerCase()] || {
        username: targetUsername,
        title: 'Cosmic Voyager',
        level: 8,
        bio: 'Cruising through anime stargates, compiling stellar soundtracks.',
        animeWatched: 42,
        equippedFrame: 'galaxy'
      };

      const modal = $('user-profile-preview-modal');
      const nameEl = $('preview-modal-username');
      const titleEl = $('preview-modal-title');
      const bioEl = $('preview-modal-bio');
      const lvlEl = $('preview-modal-level');
      const animeEl = $('preview-modal-anime');
      const frameEl = $('preview-modal-frame');
      const sBadge = $('preview-modal-s');
      const imgEl = $('preview-modal-img');
      const btnFriendText = $('preview-modal-btn-friend-text');
      const btnFriend = $('preview-modal-btn-friend');

      if (nameEl) nameEl.textContent = targetUser.username;
      if (titleEl) titleEl.textContent = targetUser.title || 'Novice Voyager';
      if (bioEl) bioEl.textContent = targetUser.bio || 'Exploring the anime multiverse.';
      if (lvlEl) lvlEl.textContent = `Lv ${targetUser.level || 1}`;
      if (animeEl) animeEl.textContent = targetUser.animeWatched || 0;

      if (frameEl) {
        frameEl.className = `pfp-frame-container frame-${targetUser.equippedFrame || 'galaxy'} p-1 mb-3`;
      }

      if (targetUser.avatarDataUrl && imgEl && sBadge) {
        imgEl.src = targetUser.avatarDataUrl;
        imgEl.classList.remove('hidden');
        sBadge.classList.add('hidden');
      } else if (imgEl && sBadge) {
        imgEl.classList.add('hidden');
        sBadge.classList.remove('hidden');
        sBadge.textContent = targetUser.username[0].toUpperCase();
      }

      // Configure Friend Button State
      const isSelf = !AppState.isGuest && targetUser.username.toLowerCase() === AppState.user.username.toLowerCase();
      const isFriend = (AppState.user.friends || []).includes(targetUser.username);
      const isPending = (AppState.user.outgoingRequests || []).includes(targetUser.username);

      if (btnFriend && btnFriendText) {
        if (isSelf) {
          btnFriend.disabled = true;
          btnFriendText.textContent = 'Your Profile';
          btnFriend.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-400 bg-white/5 cursor-default flex items-center justify-center gap-2';
        } else if (isFriend) {
          btnFriend.disabled = true;
          btnFriendText.textContent = 'Already Friends';
          btnFriend.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 cursor-default flex items-center justify-center gap-2';
        } else if (isPending) {
          btnFriend.disabled = true;
          btnFriendText.textContent = 'Request Pending';
          btnFriend.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 cursor-default flex items-center justify-center gap-2';
        } else {
          btnFriend.disabled = false;
          btnFriendText.textContent = 'Add Friend';
          btnFriend.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 shadow-accent-glow transition-all cursor-pointer flex items-center justify-center gap-2';
        }
      }

      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    }

    function closeUserProfilePreviewModal() {
      const modal = $('user-profile-preview-modal');
      if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
      }
    }

    function handlePreviewModalFriendAction() {
      if (!AppState.previewTargetUser) return;
      const target = AppState.previewTargetUser;
      closeUserProfilePreviewModal();
      sendFriendRequestTo(target);
    }

    function handlePreviewModalDMAction() {
      if (AppState.isGuest) {
        showToast('Account Required: Sign Up or Log In to transmit direct messages!', 'error');
        openAuthModal('signup');
        return;
      }
      if (!AppState.previewTargetUser) return;
      const target = AppState.previewTargetUser;
      closeUserProfilePreviewModal();
      openDMChat(target);
    }

    // ====================================================
    // 19. FRIENDS HUB & DIRECT MESSAGING (DM) ENGINE
    // ====================================================
    function switchFriendsSubTab(subTab) {
      AppState.currentFriendsSubTab = subTab;
      const btnList = $('subtab-btn-friends-list');
      const btnIncoming = $('subtab-btn-friends-incoming');
      const btnOutgoing = $('subtab-btn-friends-outgoing');
      const tabList = $('friends-subtab-list');
      const tabIncoming = $('friends-subtab-incoming');
      const tabOutgoing = $('friends-subtab-outgoing');

      if (tabList) tabList.classList.toggle('hidden', subTab !== 'list');
      if (tabIncoming) tabIncoming.classList.toggle('hidden', subTab !== 'incoming');
      if (tabOutgoing) tabOutgoing.classList.toggle('hidden', subTab !== 'outgoing');

      if (btnList) {
        btnList.className = subTab === 'list' 
          ? 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-purple-600 text-white shadow-sm cursor-pointer flex items-center gap-2'
          : 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer flex items-center gap-2';
      }
      if (btnIncoming) {
        btnIncoming.className = subTab === 'incoming'
          ? 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-purple-600 text-white shadow-sm cursor-pointer flex items-center gap-2'
          : 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer flex items-center gap-2';
      }
      if (btnOutgoing) {
        btnOutgoing.className = subTab === 'outgoing'
          ? 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-purple-600 text-white shadow-sm cursor-pointer flex items-center gap-2'
          : 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer flex items-center gap-2';
      }

      renderFriendsUI();
    }

    function renderFriendsUI() {
      if (AppState.isGuest) return;

      const user = AppState.user;
      const friends = user.friends || [];
      const incoming = user.incomingRequests || [];
      const outgoing = user.outgoingRequests || [];
      const users = getUsersDB();

      const gridContainer = $('friends-grid-container');
      const incomingContainer = $('incoming-requests-list');
      const outgoingContainer = $('outgoing-requests-list');

      // 1. My Friends List Grid
      if (gridContainer) {
        if (friends.length === 0) {
          gridContainer.innerHTML = `
            <div class="col-span-full py-16 text-center glass-panel rounded-3xl border border-dashed border-white/10 space-y-3">
              <i class="fa-solid fa-user-astronaut text-3xl text-purple-400/40"></i>
              <h4 class="text-sm font-bold text-white">No Cosmic Friends Yet</h4>
              <p class="text-xs text-slate-400 max-w-sm mx-auto">
                Search for fellow anime voyagers using the input above, or connect with voyagers from Global Chat!
              </p>
            </div>
          `;
        } else {
          gridContainer.innerHTML = friends.map(fName => {
            const fData = users[fName.toLowerCase()] || { username: fName, level: 1, title: 'Novice Voyager', equippedFrame: 'galaxy' };
            return `
              <div class="glass-card rounded-2xl p-4 border border-white/10 hover:border-purple-400/50 transition-all flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="pfp-frame-container frame-${fData.equippedFrame || 'galaxy'} p-0.5 shrink-0 rounded-full">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                      ${fData.avatarDataUrl ? `<img src="${fData.avatarDataUrl}" class="w-full h-full object-cover rounded-full" alt="${fName}" />` : `<span>${fName[0].toUpperCase()}</span>`}
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <h4 class="text-xs font-bold text-white truncate">${fName}</h4>
                      <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] shrink-0" title="Online"></span>
                    </div>
                    <span class="text-[10px] text-accent font-semibold block truncate">Lv ${fData.level || 1} &bull; ${fData.title || 'Voyager'}</span>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <button 
                    onclick="openDMChat('${fName}')" 
                    class="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-sm cursor-pointer"
                    title="Open Direct Message"
                  >
                    <i class="fa-solid fa-message text-xs"></i>
                  </button>
                  <button 
                    onclick="openUserProfilePreviewModal('${fName}')" 
                    class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
                    title="View Profile"
                  >
                    <i class="fa-solid fa-user text-xs"></i>
                  </button>
                  <button 
                    onclick="removeFriend('${fName}')" 
                    class="p-2 rounded-xl bg-red-950/40 hover:bg-red-900 border border-red-500/30 text-red-300 transition-all cursor-pointer"
                    title="Remove Friend"
                  >
                    <i class="fa-solid fa-user-xmark text-xs"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // 2. Incoming Requests List
      if (incomingContainer) {
        if (incoming.length === 0) {
          incomingContainer.innerHTML = `
            <div class="py-12 text-center text-slate-400 space-y-2">
              <i class="fa-solid fa-inbox text-2xl text-purple-400/40"></i>
              <p class="text-xs">No pending incoming friend requests.</p>
            </div>
          `;
        } else {
          incomingContainer.innerHTML = incoming.map(reqName => {
            const reqData = users[reqName.toLowerCase()] || { username: reqName, level: 1, title: 'Novice Voyager' };
            return `
              <div class="glass-card rounded-2xl p-3 border border-purple-500/30 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    ${reqName[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 class="text-xs font-bold text-white">${reqName}</h4>
                    <span class="text-[10px] text-slate-400">Lv ${reqData.level || 1} &bull; Wants to connect</span>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button 
                    onclick="acceptFriendRequest('${reqName}')" 
                    class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    <i class="fa-solid fa-check text-[10px]"></i>
                    <span>Accept</span>
                  </button>
                  <button 
                    onclick="declineFriendRequest('${reqName}')" 
                    class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-300 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // 3. Outgoing Requests List
      if (outgoingContainer) {
        if (outgoing.length === 0) {
          outgoingContainer.innerHTML = `
            <div class="py-12 text-center text-slate-400 space-y-2">
              <i class="fa-solid fa-clock text-2xl text-purple-400/40"></i>
              <p class="text-xs">No pending outgoing friend requests.</p>
            </div>
          `;
        } else {
          outgoingContainer.innerHTML = outgoing.map(reqName => {
            return `
              <div class="glass-card rounded-2xl p-3 border border-white/10 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-slate-300 text-xs font-bold">
                    ${reqName[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 class="text-xs font-bold text-white">${reqName}</h4>
                    <span class="text-[10px] text-amber-300">Awaiting user acceptance...</span>
                  </div>
                </div>

                <button 
                  onclick="declineFriendRequest('${reqName}')" 
                  class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-xs text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  Cancel Request
                </button>
              </div>
            `;
          }).join('');
        }
      }
    }

    function handleSendFriendRequest() {
      const input = $('input-friend-search');
      if (!input) return;
      const target = input.value.trim();
      if (!target) {
        showToast('Please enter a username to send a friend request.', 'error');
        return;
      }
      sendFriendRequestTo(target);
      input.value = '';
    }

    function sendFriendRequestTo(targetUsername) {
      if (AppState.isGuest) {
        showToast('Account Required: Sign Up or Log In to add cosmic friends!', 'error');
        openAuthModal('signup');
        return;
      }

      const cleanTarget = targetUsername.trim();
      const currentUsername = AppState.user.username;

      if (cleanTarget.toLowerCase() === currentUsername.toLowerCase()) {
        showToast('You cannot send a friend request to yourself!', 'error');
        return;
      }

      const users = getUsersDB();
      const targetUser = users[cleanTarget.toLowerCase()];

      if (!targetUser) {
        showToast(`No voyager account found matching "${cleanTarget}".`, 'error');
        return;
      }

      if ((AppState.user.friends || []).includes(targetUser.username)) {
        showToast(`You and ${targetUser.username} are already cosmic friends!`, 'info');
        return;
      }

      if ((AppState.user.outgoingRequests || []).includes(targetUser.username)) {
        showToast(`Friend request already sent to ${targetUser.username}. Awaiting response.`, 'info');
        return;
      }

      // Add to current user's outgoing requests
      if (!AppState.user.outgoingRequests) AppState.user.outgoingRequests = [];
      AppState.user.outgoingRequests.push(targetUser.username);
      saveUserToLocalStorage();

      // Add to target user's incoming requests
      if (!targetUser.incomingRequests) targetUser.incomingRequests = [];
      if (!targetUser.incomingRequests.includes(currentUsername)) {
        targetUser.incomingRequests.push(currentUsername);
      }
      users[cleanTarget.toLowerCase()] = targetUser;
      saveUsersDB(users);

      // Add notification for the recipient
      addNotification(targetUser.username, {
        type: 'friend_request',
        title: 'New Friend Request',
        body: `${currentUsername} sent you a cosmic transmission to connect.`
      });

      SoranixAudio.play('power_up');
      updateStatsCounters();
      renderFriendsUI();
      showToast(`✨ Friend request transmitted to ${targetUser.username}!`, 'success');
    }

    function acceptFriendRequest(senderUsername) {
      if (AppState.isGuest) return;

      const currentUsername = AppState.user.username;
      const users = getUsersDB();
      const senderKey = senderUsername.toLowerCase();
      const senderUser = users[senderKey];

      // Remove from incoming on current user
      AppState.user.incomingRequests = (AppState.user.incomingRequests || []).filter(u => u.toLowerCase() !== senderKey);
      if (!AppState.user.friends) AppState.user.friends = [];
      if (!AppState.user.friends.includes(senderUsername)) {
        AppState.user.friends.push(senderUsername);
      }
      saveUserToLocalStorage();

      // Update sender account
      if (senderUser) {
        senderUser.outgoingRequests = (senderUser.outgoingRequests || []).filter(u => u.toLowerCase() !== currentUsername.toLowerCase());
        if (!senderUser.friends) senderUser.friends = [];
        if (!senderUser.friends.includes(currentUsername)) {
          senderUser.friends.push(currentUsername);
        }
        users[senderKey] = senderUser;
        saveUsersDB(users);

        addNotification(senderUsername, {
          type: 'friend_accept',
          title: 'Friend Request Accepted!',
          body: `${currentUsername} accepted your friend request. You can now chat and stream together!`
        });
      }

      SoranixAudio.play('bell');
      updateStatsCounters();
      renderFriendsUI();
      showToast(`🎉 You and ${senderUsername} are now connected as cosmic friends!`, 'success');
    }

    function declineFriendRequest(senderUsername) {
      if (AppState.isGuest) return;

      const currentUsername = AppState.user.username;
      const users = getUsersDB();
      const senderKey = senderUsername.toLowerCase();
      const senderUser = users[senderKey];

      AppState.user.incomingRequests = (AppState.user.incomingRequests || []).filter(u => u.toLowerCase() !== senderKey);
      AppState.user.outgoingRequests = (AppState.user.outgoingRequests || []).filter(u => u.toLowerCase() !== senderKey);
      saveUserToLocalStorage();

      if (senderUser) {
        senderUser.outgoingRequests = (senderUser.outgoingRequests || []).filter(u => u.toLowerCase() !== currentUsername.toLowerCase());
        senderUser.incomingRequests = (senderUser.incomingRequests || []).filter(u => u.toLowerCase() !== currentUsername.toLowerCase());
        users[senderKey] = senderUser;
        saveUsersDB(users);
      }

      updateStatsCounters();
      renderFriendsUI();
      showToast(`Friend request from ${senderUsername} dismissed.`, 'info');
    }

    function removeFriend(friendUsername) {
      if (AppState.isGuest) return;

      const currentUsername = AppState.user.username;
      const users = getUsersDB();
      const friendKey = friendUsername.toLowerCase();
      const friendUser = users[friendKey];

      AppState.user.friends = (AppState.user.friends || []).filter(f => f.toLowerCase() !== friendKey);
      saveUserToLocalStorage();

      if (friendUser) {
        friendUser.friends = (friendUser.friends || []).filter(f => f.toLowerCase() !== currentUsername.toLowerCase());
        users[friendKey] = friendUser;
        saveUsersDB(users);
      }

      updateStatsCounters();
      renderFriendsUI();
      showToast(`Removed ${friendUsername} from your friends list.`, 'info');
    }

    // Direct Message (DM) Engine
    function openDMChat(friendUsername) {
      if (AppState.isGuest) {
        showToast('Please Sign Up or Log In to send direct transmissions!', 'error');
        openAuthModal('signup');
        return;
      }

      AppState.activeDMFriend = friendUsername;
      const users = getUsersDB();
      const friendData = users[friendUsername.toLowerCase()] || { username: friendUsername, level: 1, title: 'Novice Voyager', equippedFrame: 'galaxy' };

      const drawer = $('dm-chat-drawer');
      const nameEl = $('dm-header-username');
      const rankEl = $('dm-header-rank');
      const frameEl = $('dm-header-frame');
      const sBadge = $('dm-header-s');
      const imgEl = $('dm-header-img');

      if (nameEl) nameEl.textContent = friendUsername;
      if (rankEl) rankEl.textContent = `Lv ${friendData.level || 1} &bull; ${friendData.title || 'Novice Voyager'}`;
      if (frameEl) frameEl.className = `pfp-frame-container frame-${friendData.equippedFrame || 'galaxy'} p-0.5 shrink-0`;

      if (friendData.avatarDataUrl && imgEl && sBadge) {
        imgEl.src = friendData.avatarDataUrl;
        imgEl.classList.remove('hidden');
        sBadge.classList.add('hidden');
      } else if (imgEl && sBadge) {
        imgEl.classList.add('hidden');
        sBadge.classList.remove('hidden');
        sBadge.textContent = friendUsername[0].toUpperCase();
      }

      renderDMConversation();

      if (drawer) {
        drawer.classList.remove('translate-x-full');
      }
    }

    function closeDMChatDrawer() {
      const drawer = $('dm-chat-drawer');
      if (drawer) {
        drawer.classList.add('translate-x-full');
      }
      AppState.activeDMFriend = null;
    }

    function renderDMConversation() {
      const container = $('dm-chat-messages');
      if (!container || !AppState.activeDMFriend) return;

      const threadKey = getThreadKey(AppState.user.username, AppState.activeDMFriend);
      const allThreads = getDMThreads();
      const messages = allThreads[threadKey] || [];

      if (messages.length === 0) {
        container.innerHTML = `
          <div class="py-16 text-center text-slate-400 space-y-2">
            <i class="fa-solid fa-comments text-2xl text-purple-400/40"></i>
            <p class="text-xs font-semibold text-slate-300">Secure Direct Transmission Established</p>
            <p class="text-[11px] text-slate-500 max-w-xs mx-auto">Send your first message or recommend an anime to start watching together!</p>
          </div>
        `;
        return;
      }

      container.innerHTML = messages.map(m => {
        const isSelf = m.sender.toLowerCase() === AppState.user.username.toLowerCase();
        return `
          <div class="flex flex-col ${isSelf ? 'items-end' : 'items-start'} space-y-1">
            <div class="max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${isSelf ? 'bg-purple-600 text-white shadow-accent-glow rounded-br-none' : 'bg-white/10 text-slate-200 border border-white/10 rounded-bl-none'}">
              ${m.recommendation ? `
                <div class="p-2.5 rounded-xl bg-black/40 border border-amber-500/30 mb-1.5 space-y-1">
                  <div class="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                    <i class="fa-solid fa-film"></i>
                    <span>Stream Recommendation</span>
                  </div>
                  <h5 class="font-bold text-white text-xs">${m.recommendation.title}</h5>
                  <span class="text-[10px] text-purple-300 font-mono">${m.recommendation.genre}</span>
                </div>
              ` : ''}
              <p class="break-words">${m.text}</p>
            </div>
            <span class="text-[9px] text-slate-500 font-mono px-1">${m.timestamp}</span>
          </div>
        `;
      }).join('');

      container.scrollTop = container.scrollHeight;
    }

    function sendDirectMessage() {
      if (AppState.isGuest) return;
      if (!AppState.activeDMFriend) return;

      if (AppState.user.isBanned) {
        showToast('Direct Transmission Blocked: Your account has been suspended by Administrator.', 'error');
        return;
      }

      if (AppState.user.mutedUntil && AppState.user.mutedUntil > Date.now()) {
        const remainingMin = Math.ceil((AppState.user.mutedUntil - Date.now()) / 60000);
        showToast(`Direct Transmission Muted: Timed out (${remainingMin}m remaining).`, 'error');
        return;
      }

      const input = $('dm-chat-input');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      const threadKey = getThreadKey(AppState.user.username, AppState.activeDMFriend);
      const allThreads = getDMThreads();
      if (!allThreads[threadKey]) allThreads[threadKey] = [];

      allThreads[threadKey].push({
        id: `dm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        sender: AppState.user.username,
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        time: Date.now()
      });

      saveDMThreads(allThreads);
      input.value = '';

      SoranixAudio.play('laser');
      renderDMConversation();

      addNotification(AppState.activeDMFriend, {
        type: 'dm',
        title: `DM from ${AppState.user.username}`,
        body: text.length > 40 ? `${text.substring(0, 40)}...` : text
      });
    }

    function sendAnimeRecommendation(title, genre) {
      if (AppState.isGuest || !AppState.activeDMFriend) return;

      const threadKey = getThreadKey(AppState.user.username, AppState.activeDMFriend);
      const allThreads = getDMThreads();
      if (!allThreads[threadKey]) allThreads[threadKey] = [];

      allThreads[threadKey].push({
        id: `dm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        sender: AppState.user.username,
        text: `Hey, let's watch ${title} together on Soranix!`,
        recommendation: { title, genre },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        time: Date.now()
      });

      saveDMThreads(allThreads);

      const popover = $('dm-recommend-menu');
      if (popover) popover.classList.add('hidden');

      SoranixAudio.play('bell');
      renderDMConversation();
      showToast(`Recommended "${title}" to ${AppState.activeDMFriend}!`, 'success');
    }

    function toggleRecommendMenu(event) {
      if (event) event.stopPropagation();
      const popover = $('dm-recommend-menu');
      if (popover) popover.classList.toggle('hidden');
    }

    function insertDMEmoji(emoji) {
      const input = $('dm-chat-input');
      if (!input) return;
      input.value = `${input.value} ${emoji} `;
      input.focus();
    }

    // ====================================================
    // 20. ACCOUNT-ONLY NOTIFICATION CENTER
    // ====================================================
    function toggleNotificationDropdown(event) {
      if (event) event.stopPropagation();
      const dropdown = $('notification-dropdown');
      if (!dropdown) return;
      dropdown.classList.toggle('hidden');
      if (!dropdown.classList.contains('hidden')) {
        renderNotificationsUI();
      }
    }

    function renderNotificationsUI() {
      if (AppState.isGuest) return;

      const username = AppState.user.username;
      const notifs = getNotifications(username);
      const listContainer = $('notification-items-list');
      const emptyState = $('notification-empty-state');
      const badge = $('header-unread-badge');
      const countBadge = $('notif-count-badge');

      const unreadCount = notifs.filter(n => !n.read).length;

      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      if (countBadge) {
        countBadge.textContent = `${unreadCount} New`;
      }

      if (!listContainer) return;

      if (notifs.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        listContainer.innerHTML = '';
      } else {
        if (emptyState) emptyState.classList.add('hidden');
        listContainer.innerHTML = notifs.map(n => {
          let iconClass = 'fa-solid fa-bell text-accent';
          if (n.type === 'friend_request') iconClass = 'fa-solid fa-user-plus text-purple-400';
          if (n.type === 'friend_accept') iconClass = 'fa-solid fa-heart text-pink-400';
          if (n.type === 'shop') iconClass = 'fa-solid fa-sparkles text-amber-400';
          if (n.type === 'level_up') iconClass = 'fa-solid fa-trophy text-solarGold';
          if (n.type === 'dm') iconClass = 'fa-solid fa-message text-electricCyan';

          return `
            <div class="glass-card rounded-2xl p-3 border ${n.read ? 'border-white/5 opacity-70' : 'border-purple-500/30 bg-purple-950/20'} flex items-start justify-between gap-2.5 transition-all">
              <div class="flex items-start gap-2.5 min-w-0">
                <div class="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                  <i class="${iconClass} text-xs"></i>
                </div>
                <div class="min-w-0">
                  <h5 class="text-xs font-bold text-white truncate">${n.title}</h5>
                  <p class="text-[11px] text-slate-300 mt-0.5 leading-snug break-words">${n.body}</p>
                  <span class="text-[9px] text-slate-500 font-mono mt-1 block">${n.timestamp || 'Just now'}</span>
                </div>
              </div>
              <button onclick="dismissNotification('${n.id}')" class="text-slate-500 hover:text-white p-1 cursor-pointer" title="Dismiss">
                <i class="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>
          `;
        }).join('');
      }
    }

    function addNotification(targetUsername, notif) {
      if (!targetUsername || targetUsername === 'Guest Explorer') return;

      const list = getNotifications(targetUsername);
      const newNotif = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        read: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...notif
      };
      list.unshift(newNotif);
      saveNotifications(targetUsername, list.slice(0, 30));

      if (!AppState.isGuest && targetUsername.toLowerCase() === AppState.user.username.toLowerCase()) {
        renderNotificationsUI();
      }
    }

    function markAllNotificationsRead() {
      if (AppState.isGuest) return;
      const username = AppState.user.username;
      const notifs = getNotifications(username).map(n => ({ ...n, read: true }));
      saveNotifications(username, notifs);
      renderNotificationsUI();
      showToast('All notifications marked as read.', 'info');
    }

    function dismissNotification(notifId) {
      if (AppState.isGuest) return;
      const username = AppState.user.username;
      const notifs = getNotifications(username).filter(n => n.id !== notifId);
      saveNotifications(username, notifs);
      renderNotificationsUI();
    }

    // Close notifications popover on click outside
    document.addEventListener('click', (event) => {
      const dropdown = $('notification-dropdown');
      const bell = $('header-notification-bell');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!dropdown.contains(event.target) && !bell?.contains(event.target)) {
          dropdown.classList.add('hidden');
        }
      }
      const recMenu = $('dm-recommend-menu');
      if (recMenu && !recMenu.classList.contains('hidden')) {
        if (!recMenu.contains(event.target)) {
          recMenu.classList.add('hidden');
        }
      }
    });

    // ====================================================
    // 20. ADMIN & OWNER CONTROL CENTER ENGINE
    // ====================================================
    function switchAdminSubTab(tabName) {
      AppState.adminSubTab = tabName;

      const panels = {
        users: $('admin-panel-users'),
        currency: $('admin-panel-currency'),
        broadcasts: $('admin-panel-broadcasts'),
        platform: $('admin-panel-platform')
      };

      const btns = {
        users: $('admin-tab-btn-users'),
        currency: $('admin-tab-btn-currency'),
        broadcasts: $('admin-tab-btn-broadcasts'),
        platform: $('admin-tab-btn-platform')
      };

      Object.entries(panels).forEach(([k, panel]) => {
        if (!panel) return;
        if (k === tabName) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      });

      Object.entries(btns).forEach(([k, btn]) => {
        if (!btn) return;
        if (k === tabName) {
          btn.className = 'admin-subtab-btn px-4 py-2 rounded-2xl text-xs font-bold transition-all bg-red-600 text-white shadow-md cursor-pointer flex items-center gap-2 shrink-0';
        } else {
          btn.className = 'admin-subtab-btn px-4 py-2 rounded-2xl text-xs font-bold transition-all text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/10 cursor-pointer flex items-center gap-2 shrink-0';
        }
      });

      if (tabName === 'users') {
        renderAdminUsersList();
      } else if (tabName === 'currency') {
        initAdminCurrencyEditor();
      } else if (tabName === 'broadcasts') {
        initAdminBroadcastsUI();
      } else if (tabName === 'platform') {
        initAdminPlatformUI();
      }
    }

    function renderAdminDashboard() {
      const users = getUsersDB();
      const msgs = getGlobalChatMessages();
      const cfg = getAdminConfig();

      const totalUsersEl = $('admin-stat-total-users');
      const totalMsgsEl = $('admin-stat-total-msgs');
      const multEl = $('admin-stat-multiplier');
      const maintEl = $('admin-stat-maintenance');

      if (totalUsersEl) totalUsersEl.textContent = Object.keys(users).length;
      if (totalMsgsEl) totalMsgsEl.textContent = msgs.length;
      if (multEl) multEl.textContent = `${cfg.watchMultiplier || 1.0}x`;
      if (maintEl) {
        maintEl.textContent = cfg.maintenanceMode ? 'Maintenance Active' : 'Online';
        maintEl.className = cfg.maintenanceMode ? 'text-lg font-display font-black text-red-400 mt-0.5' : 'text-lg font-display font-black text-emerald-400 mt-0.5';
      }

      switchAdminSubTab(AppState.adminSubTab || 'users');
    }

    function renderAdminUsersList() {
      const container = $('admin-users-list-container');
      if (!container) return;

      const users = getUsersDB();
      const staffSelect = $('admin-staff-user-select');
      if (staffSelect) {
        staffSelect.innerHTML = Object.values(users).map(u => {
          return `<option value="${u.username.toLowerCase()}">${u.username} (${u.email || 'No email'}) - Current: ${u.staffRole || (checkIsAdmin(u) ? 'Admin' : 'Member')}</option>`;
        }).join('');
      }

      const searchInput = $('admin-user-search-input');
      const query = (searchInput?.value || '').toLowerCase().trim();
      const filterStatus = AppState.adminUsersStatusFilter || 'all';

      let userList = Object.values(users);

      if (query) {
        userList = userList.filter(u => {
          const uname = (u.username || '').toLowerCase();
          const uemail = (u.email || '').toLowerCase();
          const utitle = (u.title || '').toLowerCase();
          return uname.includes(query) || uemail.includes(query) || utitle.includes(query);
        });
      }

      if (filterStatus === 'active') {
        userList = userList.filter(u => !u.isBanned && (!u.mutedUntil || u.mutedUntil <= Date.now()));
      } else if (filterStatus === 'muted') {
        userList = userList.filter(u => u.mutedUntil && u.mutedUntil > Date.now());
      } else if (filterStatus === 'banned') {
        userList = userList.filter(u => u.isBanned);
      }

      if (userList.length === 0) {
        container.innerHTML = `
          <div class="glass-card rounded-2xl p-8 text-center text-slate-400 space-y-2">
            <i class="fa-solid fa-user-slash text-2xl text-slate-500"></i>
            <h4 class="text-sm font-bold text-white">No accounts found</h4>
            <p class="text-xs text-slate-400">Try adjusting your search query or status filter.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = userList.map(u => {
        const isOwner = checkIsAdmin(u);
        const isMuted = u.mutedUntil && u.mutedUntil > Date.now();
        const remainingMins = isMuted ? Math.ceil((u.mutedUntil - Date.now()) / 60000) : 0;
        const isBanned = !!u.isBanned;

        let statusPill = `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/40">Active</span>`;
        if (isBanned) {
          statusPill = `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-500/40">Banned</span>`;
        } else if (isMuted) {
          statusPill = `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/40">Muted (${remainingMins}m left)</span>`;
        }

        return `
          <div class="glass-card rounded-2xl p-4 border border-white/5 hover:border-purple-500/30 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            
            <div class="flex items-center gap-3.5 min-w-0">
              <div class="pfp-frame-container frame-${u.equippedFrame || 'galaxy'} p-0.5 shrink-0 rounded-full">
                <div class="w-11 h-11 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center text-white font-black text-sm overflow-hidden">
                  ${u.avatarDataUrl ? `<img src="${u.avatarDataUrl}" class="w-full h-full object-cover rounded-full" alt="Avatar" />` : `<span>${(u.username || 'U')[0].toUpperCase()}</span>`}
                </div>
              </div>

              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="text-sm font-bold text-white truncate ${u.equippedNameGlow || ''}">${u.username}</h4>
                  ${isOwner ? `<span class="px-2 py-0.2 rounded-full text-[9px] font-mono font-extrabold bg-red-950 text-red-300 border border-red-500/40">OWNER</span>` : ''}
                  ${statusPill}
                </div>
                <div class="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span class="text-slate-300">${u.email || 'No email attached'}</span>
                  <span>&bull;</span>
                  <span class="text-purple-300 font-mono">Lv ${u.level || 1}</span>
                  <span>&bull;</span>
                  <span class="text-amber-300 font-mono">${(u.stardust || 0).toLocaleString()} Stardust</span>
                </div>
                <div class="text-[10px] text-slate-500 font-mono mt-1">
                  <i class="fa-solid fa-network-wired text-[9px] mr-1"></i> ${u.ipSessionLog || '192.168.1.104 • Linux Chrome • Active'}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
              <button 
                onclick="adminSelectUserForEditor('${u.username}')" 
                class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
                title="Edit Coins, XP & Level"
              >
                <i class="fa-solid fa-pen-to-square text-[11px] text-accent"></i>
                <span>Edit</span>
              </button>

              <!-- Timeout / Mute Actions -->
              ${isMuted ? `
                <button 
                  onclick="adminUnmuteUser('${u.username}')" 
                  class="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-950/60 hover:bg-amber-950 text-amber-300 border border-amber-500/40 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <i class="fa-solid fa-volume-high text-[11px]"></i>
                  <span>Unmute</span>
                </button>
              ` : `
                <select 
                  onchange="if(this.value) { adminMuteUser('${u.username}', parseInt(this.value)); this.value=''; }" 
                  class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#07050e] border border-amber-500/30 text-amber-300 focus:outline-none cursor-pointer"
                >
                  <option value="" selected disabled>Timeout...</option>
                  <option value="1">1 Min</option>
                  <option value="5">5 Mins</option>
                  <option value="15">15 Mins</option>
                  <option value="60">1 Hour</option>
                  <option value="1440">24 Hours</option>
                </select>
              `}

              <!-- Ban / Unban Action -->
              ${!isOwner ? `
                <button 
                  onclick="adminToggleBanUser('${u.username}')" 
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${isBanned ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-500/40'}"
                >
                  <i class="fa-solid ${isBanned ? 'fa-user-check' : 'fa-ban'} text-[11px]"></i>
                  <span>${isBanned ? 'Unban' : 'Ban'}</span>
                </button>
              ` : `
                <span class="px-2.5 py-1 text-[10px] font-mono text-slate-500 italic">Protected</span>
              `}
            </div>

          </div>
        `;
      }).join('');
    }

    function filterAdminUsersStatus(status) {
      AppState.adminUsersStatusFilter = status;
      ['all', 'active', 'muted', 'banned'].forEach(s => {
        const btn = $(`admin-filter-status-${s}`);
        if (!btn) return;
        if (s === status) {
          btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white/20 text-white cursor-pointer';
        } else {
          btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-white/[0.04] cursor-pointer';
        }
      });
      renderAdminUsersList();
    }

    function adminToggleBanUser(username) {
      const users = getUsersDB();
      const key = username.toLowerCase();
      const u = users[key];
      if (!u) return;

      if (checkIsAdmin(u)) {
        showToast('System Administrator / Owner accounts cannot be banned.', 'error');
        return;
      }

      u.isBanned = !u.isBanned;
      if (u.isBanned) {
        u.bannedReason = 'Administrative action by Platform Owner.';
      } else {
        u.bannedReason = '';
      }

      users[key] = u;
      saveUsersDB(users);
      renderAdminUsersList();
      SoranixAudio.play('sword');
      showToast(`${username} is now ${u.isBanned ? 'BANNED from Soranix' : 'UNBANNED'}.`, u.isBanned ? 'error' : 'success');
    }

    function adminMuteUser(username, minutes) {
      const users = getUsersDB();
      const key = username.toLowerCase();
      const u = users[key];
      if (!u) return;

      if (checkIsAdmin(u)) {
        showToast('System Administrator / Owner cannot be muted.', 'error');
        return;
      }

      u.mutedUntil = Date.now() + (minutes * 60 * 1000);
      users[key] = u;
      saveUsersDB(users);
      renderAdminUsersList();
      SoranixAudio.play('laser');
      showToast(`${username} has been timed out for ${minutes} minute(s). Chat & DMs suppressed.`, 'info');
    }

    function adminUnmuteUser(username) {
      const users = getUsersDB();
      const key = username.toLowerCase();
      const u = users[key];
      if (!u) return;

      u.mutedUntil = 0;
      users[key] = u;
      saveUsersDB(users);
      renderAdminUsersList();
      showToast(`${username} timeout cleared. Transmission restored.`, 'success');
    }

    function adminSelectUserForEditor(username) {
      AppState.adminSelectedEditorUserKey = username.toLowerCase();
      switchAdminSubTab('currency');
    }

    function initAdminCurrencyEditor() {
      const select = $('admin-editor-user-select');
      const itemSelect = $('admin-grant-item-select');
      const users = getUsersDB();

      if (select) {
        select.innerHTML = Object.values(users).map(u => {
          const isSelected = (AppState.adminSelectedEditorUserKey || AppState.currentUserKey || 'jaydentorru') === u.username.toLowerCase();
          return `<option value="${u.username.toLowerCase()}" ${isSelected ? 'selected' : ''}>${u.username} (${u.email || 'No email'}) - Lv ${u.level || 1} &bull; ${(u.stardust || 0).toLocaleString()} Coins</option>`;
        }).join('');
      }

      if (itemSelect) {
        itemSelect.innerHTML = SHOP_CATALOG.map(item => {
          return `<option value="${item.id}">[${item.category.toUpperCase()}] ${item.name} (${item.cost === 0 ? 'FREE' : `${item.cost} Coins`})</option>`;
        }).join('');
      }

      handleAdminEditorUserChange();
    }

    function handleAdminEditorUserChange() {
      const select = $('admin-editor-user-select');
      const targetKey = select?.value || AppState.currentUserKey || 'jaydentorru';
      AppState.adminSelectedEditorUserKey = targetKey;
      const users = getUsersDB();
      const targetUser = users[targetKey] || AppState.user;
      renderAdminEditorTargetCard(targetUser);
    }

    function loadCurrentUserIntoEditor() {
      if (AppState.isGuest) {
        showToast('Guest mode has no persistent account.', 'info');
        return;
      }
      AppState.adminSelectedEditorUserKey = AppState.user.username.toLowerCase();
      initAdminCurrencyEditor();
    }

    function renderAdminEditorTargetCard(u) {
      const container = $('admin-editor-target-card');
      if (!container || !u) return;

      const isOwner = checkIsAdmin(u);
      const inventoryCount = (u.inventory || []).length;

      container.innerHTML = `
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3.5">
            <div class="pfp-frame-container frame-${u.equippedFrame || 'galaxy'} p-0.5 shrink-0 rounded-full">
              <div class="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center text-white font-black text-base overflow-hidden">
                ${u.avatarDataUrl ? `<img src="${u.avatarDataUrl}" class="w-full h-full object-cover rounded-full" alt="Avatar" />` : `<span>${(u.username || 'U')[0].toUpperCase()}</span>`}
              </div>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-white ${u.equippedNameGlow || ''}">${u.username}</h3>
                ${isOwner ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-red-950 text-red-300 border border-red-500/40">OWNER</span>` : ''}
              </div>
              <p class="text-xs text-accent font-semibold mt-0.5">${u.title || 'Novice Voyager'}</p>
              <p class="text-[11px] text-slate-400">${u.email || 'No email attached'}</p>
            </div>
          </div>

          <div class="flex items-center gap-3 text-center w-full sm:w-auto justify-end">
            <div class="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/5">
              <span class="text-[10px] uppercase font-mono text-slate-400 block">Stardust</span>
              <span class="text-sm font-bold text-amber-300">${(u.stardust || 0).toLocaleString()}</span>
            </div>
            <div class="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/5">
              <span class="text-[10px] uppercase font-mono text-slate-400 block">Level</span>
              <span class="text-sm font-bold text-purple-300">Lv ${u.level || 1}</span>
            </div>
            <div class="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/5">
              <span class="text-[10px] uppercase font-mono text-slate-400 block">Inventory</span>
              <span class="text-sm font-bold text-cyan-300">${inventoryCount} Items</span>
            </div>
          </div>
        </div>
      `;
    }

    function adminModifyCoins(action) {
      const select = $('admin-editor-user-select');
      const targetKey = select?.value || AppState.adminSelectedEditorUserKey || 'jaydentorru';
      const amountInput = $('admin-coin-amount-input');
      const amount = parseInt(amountInput?.value, 10) || 0;

      const users = getUsersDB();
      const targetUser = users[targetKey];
      if (!targetUser) {
        showToast('Please select a valid user.', 'error');
        return;
      }

      if (action === 'add') {
        targetUser.stardust = (targetUser.stardust || 0) + amount;
      } else if (action === 'deduct') {
        targetUser.stardust = Math.max(0, (targetUser.stardust || 0) - amount);
      } else if (action === 'set') {
        targetUser.stardust = Math.max(0, amount);
      }

      users[targetKey] = targetUser;
      saveUsersDB(users);

      if (!AppState.isGuest && AppState.currentUserKey === targetKey) {
        AppState.user.stardust = targetUser.stardust;
        updateViewableProfileUI();
      }

      renderAdminEditorTargetCard(targetUser);
      renderAdminUsersList();
      SoranixAudio.play('coin');
      showToast(`Stardust coins updated for ${targetUser.username}: ${targetUser.stardust.toLocaleString()} Stardust.`, 'success');
    }

    function adminOverrideLevel() {
      const select = $('admin-editor-user-select');
      const targetKey = select?.value || AppState.adminSelectedEditorUserKey || 'jaydentorru';
      const lvlInput = $('admin-level-override-input');
      const newLvl = Math.max(1, Math.min(999, parseInt(lvlInput?.value, 10) || 1));

      const users = getUsersDB();
      const targetUser = users[targetKey];
      if (!targetUser) return;

      targetUser.level = newLvl;
      targetUser.xp = (newLvl - 1) * 100;
      if (!checkIsAdmin(targetUser)) {
        targetUser.title = getTitleForLevel(newLvl);
      } else {
        targetUser.title = 'System Administrator / Owner';
      }

      users[targetKey] = targetUser;
      saveUsersDB(users);

      if (!AppState.isGuest && AppState.currentUserKey === targetKey) {
        AppState.user.level = targetUser.level;
        AppState.user.xp = targetUser.xp;
        AppState.user.title = targetUser.title;
        updateViewableProfileUI();
      }

      renderAdminEditorTargetCard(targetUser);
      renderAdminUsersList();
      SoranixAudio.play('level_up');
      showToast(`Level overridden for ${targetUser.username}: Level ${newLvl} (${targetUser.title})!`, 'success');
    }

    function adminAddXP() {
      const select = $('admin-editor-user-select');
      const targetKey = select?.value || AppState.adminSelectedEditorUserKey || 'jaydentorru';
      const xpInput = $('admin-xp-add-input');
      const addAmount = Math.max(1, parseInt(xpInput?.value, 10) || 0);

      const users = getUsersDB();
      const targetUser = users[targetKey];
      if (!targetUser) return;

      targetUser.xp = (targetUser.xp || 0) + addAmount;
      const calcLvl = Math.floor(targetUser.xp / 100) + 1;
      targetUser.level = Math.max(targetUser.level || 1, calcLvl);
      if (!checkIsAdmin(targetUser)) {
        targetUser.title = getTitleForLevel(targetUser.level);
      }

      users[targetKey] = targetUser;
      saveUsersDB(users);

      if (!AppState.isGuest && AppState.currentUserKey === targetKey) {
        AppState.user.level = targetUser.level;
        AppState.user.xp = targetUser.xp;
        AppState.user.title = targetUser.title;
        updateViewableProfileUI();
      }

      renderAdminEditorTargetCard(targetUser);
      renderAdminUsersList();
      SoranixAudio.play('level_up');
      showToast(`Added +${addAmount} XP to ${targetUser.username}! Current Level: ${targetUser.level}.`, 'success');
    }

    function adminGrantSelectedItem() {
      const select = $('admin-editor-user-select');
      const targetKey = select?.value || AppState.adminSelectedEditorUserKey || 'jaydentorru';
      const itemSelect = $('admin-grant-item-select');
      const itemId = itemSelect?.value;
      if (!itemId) {
        showToast('Please select an item from catalog to grant.', 'error');
        return;
      }

      const users = getUsersDB();
      const targetUser = users[targetKey];
      if (!targetUser) return;

      if (!targetUser.inventory) targetUser.inventory = [];
      if (targetUser.inventory.includes(itemId)) {
        showToast(`${targetUser.username} already owns "${itemId}".`, 'info');
        return;
      }

      targetUser.inventory.push(itemId);
      users[targetKey] = targetUser;
      saveUsersDB(users);

      if (!AppState.isGuest && AppState.currentUserKey === targetKey) {
        AppState.user.inventory = targetUser.inventory;
        updateViewableProfileUI();
      }

      renderAdminEditorTargetCard(targetUser);
      SoranixAudio.play('power_up');
      showToast(`✨ Granted item "${itemId}" to ${targetUser.username} for free!`, 'success');
    }

    function initAdminBroadcastsUI() {
      const cfg = getAdminConfig();
      const pill = $('admin-banner-active-pill');
      const input = $('admin-announcement-input');
      const select = $('admin-announcement-type-select');

      if (pill) {
        if (cfg.announcementBanner && cfg.announcementBanner.active) pill.classList.remove('hidden');
        else pill.classList.add('hidden');
      }

      if (cfg.announcementBanner && input) {
        input.value = cfg.announcementBanner.text || '';
      }
      if (cfg.announcementBanner && select) {
        select.value = cfg.announcementBanner.type || 'alert';
      }
    }

    function adminPublishAnnouncement() {
      const input = $('admin-announcement-input');
      const select = $('admin-announcement-type-select');
      const text = input?.value.trim();

      if (!text) {
        showToast('Please enter an announcement message.', 'error');
        return;
      }

      const type = select?.value || 'alert';
      const cfg = getAdminConfig();
      cfg.announcementBanner = {
        text: text,
        type: type,
        active: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      saveAdminConfig(cfg);
      renderAnnouncementBannerUI();
      initAdminBroadcastsUI();
      SoranixAudio.play('level_up');
      showToast('Global Announcement Banner broadcasted across all sessions!', 'success');
    }

    function adminClearAnnouncement() {
      const cfg = getAdminConfig();
      cfg.announcementBanner = null;
      saveAdminConfig(cfg);
      renderAnnouncementBannerUI();
      initAdminBroadcastsUI();
      showToast('Announcement banner cleared.', 'info');
    }

    function adminSendChatBroadcast() {
      const input = $('admin-chat-broadcast-input');
      if (!input) return;
      const text = input.value.trim();
      if (!text) {
        showToast('Please type a broadcast message body.', 'error');
        return;
      }

      const msgs = getGlobalChatMessages();
      msgs.push({
        id: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        sender: 'SYSTEM BROADCAST',
        senderTitle: 'System Administrator / Owner',
        isSystemAdmin: true,
        message: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        time: Date.now()
      });
      saveGlobalChatMessages(msgs);

      input.value = '';
      SoranixAudio.play('level_up');
      showToast('Official System Broadcast transmitted to Global Chat!', 'success');
      renderGlobalChatMessages();
      const countEl = $('admin-stat-total-msgs');
      if (countEl) countEl.textContent = msgs.length;
    }

    function initAdminPlatformUI() {
      const cfg = getAdminConfig();
      const label = $('admin-maintenance-switch-label');
      const btn = $('admin-maintenance-toggle-btn');
      const reasonInput = $('admin-maintenance-reason-input');

      if (label && btn) {
        if (cfg.maintenanceMode) {
          label.textContent = 'MAINTENANCE ACTIVE';
          label.className = 'text-xs font-bold font-mono text-red-400';
          btn.textContent = 'Disable Maintenance';
          btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-red-950 border border-red-500/50 text-red-300 hover:scale-105 cursor-pointer';
        } else {
          label.textContent = 'NORMAL OPERATION';
          label.className = 'text-xs font-bold font-mono text-emerald-400';
          btn.textContent = 'Enable Maintenance';
          btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-950 border border-emerald-500/40 text-emerald-300 hover:scale-105 cursor-pointer';
        }
      }

      if (reasonInput && cfg.maintenanceReason) {
        reasonInput.value = cfg.maintenanceReason;
      }

      // Highlight active multiplier button
      const activeMult = cfg.watchMultiplier || 1.0;
      [1, 2, 3, 5].forEach(m => {
        const multBtn = $(`admin-mult-${m}x`);
        if (!multBtn) return;
        if (m === activeMult) {
          multBtn.className = 'flex-1 py-3 px-4 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-center bg-purple-600 border-purple-400 text-white shadow-md';
        } else {
          multBtn.className = 'flex-1 py-3 px-4 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-center bg-white/5 border-white/10 text-slate-300 hover:text-white';
        }
      });
    }

    function adminToggleMaintenanceMode() {
      const cfg = getAdminConfig();
      cfg.maintenanceMode = !cfg.maintenanceMode;
      const reasonInput = $('admin-maintenance-reason-input');
      if (reasonInput && reasonInput.value.trim()) {
        cfg.maintenanceReason = reasonInput.value.trim();
      }
      saveAdminConfig(cfg);
      updateMaintenanceGuardUI();
      initAdminPlatformUI();
      showToast(`Maintenance Mode ${cfg.maintenanceMode ? 'ENABLED (Platform guarded for non-admins)' : 'DISABLED (Platform restored)'}`, cfg.maintenanceMode ? 'error' : 'success');
    }

    function adminSetMultiplier(mult) {
      const cfg = getAdminConfig();
      cfg.watchMultiplier = mult;
      saveAdminConfig(cfg);
      AppState.watch.multiplier = mult;
      initAdminPlatformUI();
      const multDisplay = $('admin-stat-multiplier');
      if (multDisplay) multDisplay.textContent = `${mult}x`;
      showToast(`Watch-Time Reward Multiplier updated to ${mult}x!`, 'success');
      SoranixAudio.play('coin');
    }

    function adminPurgeGlobalChat() {
      if (!confirm('Are you sure you want to permanently purge all Global Chat history? This will clear the chatroom for everyone immediately.')) {
        return;
      }
      saveGlobalChatMessages([]);
      renderGlobalChatMessages();
      const countEl = $('admin-stat-total-msgs');
      if (countEl) countEl.textContent = '0';
      showToast('Global chat wiped clean by Administrator.', 'success');
      SoranixAudio.play('sword');
    }

    // ====================================================
    // 21. REAL-TIME CROSS-TAB SYNC EVENT LISTENER
    // ====================================================
    window.addEventListener('storage', (e) => {
      if (e.key === GLOBAL_CHAT_KEY && AppState.isGlobalChatOpen) {
        renderGlobalChatMessages();
      }
      if (e.key === DM_THREADS_KEY && AppState.activeDMFriend) {
        renderDMConversation();
      }
      if (e.key && e.key.startsWith(NOTIFICATIONS_PREFIX) && !AppState.isGuest) {
        renderNotificationsUI();
      }
      if (e.key === USERS_DB_KEY && !AppState.isGuest && AppState.currentUserKey) {
        const users = getUsersDB();
        if (users[AppState.currentUserKey]) {
          AppState.user = { ...AppState.user, ...users[AppState.currentUserKey] };
          updateViewableProfileUI();
        }
      }
      if (e.key === ADMIN_CONFIG_KEY) {
        renderAnnouncementBannerUI();
        updateMaintenanceGuardUI();
        if (AppState.currentTab === 'admin') {
          renderAdminDashboard();
        }
      }
    });

    // ====================================================
    // 22. TOAST NOTIFICATIONS
    // ----------------------------------------------------
    function showToast(message, type = 'info') {
      const container = $('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = 'flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-2xl transition-all duration-300 pointer-events-auto transform translate-y-2 opacity-0 backdrop-blur-xl';

      if (type === 'success') {
        toast.style.background = 'rgba(16, 185, 129, 0.95)';
        toast.style.border = '1px solid rgba(52, 211, 153, 0.5)';
        toast.innerHTML = `<i class="fa-solid fa-circle-check text-white"></i> <span>${message}</span>`;
      } else if (type === 'error') {
        toast.style.background = 'rgba(239, 68, 68, 0.95)';
        toast.style.border = '1px solid rgba(248, 113, 113, 0.5)';
        toast.innerHTML = `<i class="fa-solid fa-circle-exclamation text-white"></i> <span>${message}</span>`;
      } else {
        toast.style.background = 'rgba(25, 18, 48, 0.95)';
        toast.style.border = '1px solid rgba(var(--accent-rgb), 0.4)';
        toast.innerHTML = `<i class="fa-solid fa-atom text-accent"></i> <span>${message}</span>`;
      }

      container.appendChild(toast);
      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
      });

      setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toast.remove(), 3400);
      }, 3400);
    }

    // Keyboard ESC listener
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAnimeDetailModal();
        closeAnimePlayerModal();
        closeDashboardThemeMenu();
        closeShopItemPreview();
        closeUserProfilePreviewModal();
        closeEditProfileModal();
        closeAuthModal();
        closeBugReportModal();
        closeGearMenu();
        closeDMChatDrawer();
        closeAdminAccessDeniedModal();
      }
    });

    // Close theme menu when clicking outside
    document.addEventListener('click', (e) => {
      const themeContainer = $('dashboard-theme-menu-container');
      if (themeContainer && !themeContainer.contains(e.target)) {
        closeDashboardThemeMenu();
      }
    });

    // ====================================================
    // 23. ANIME CATALOG ENGINE (AniList API + Jikan + Fallback)
    // ----------------------------------------------------
    const BASELINE_ANIME_CATALOG = [
      {
        id: 154587,
        title: { english: "Frieren: Beyond Journey's End", romaji: "Sousou no Frieren", native: "葬送のフリーレン" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80",
        episodes: 28,
        averageScore: 91,
        status: "FINISHED AIRING",
        genres: ["Fantasy", "Adventure", "Drama"],
        studios: { nodes: [{ name: "Madhouse" }] },
        trailer: { id: "qgQunxD0qLk", site: "youtube" },
        description: "An elf mage embarks on a poignant quest across the galaxy to understand the fleeting lives of mortals and the comrades she left behind after defeating the Demon King."
      },
      {
        id: 151807,
        title: { english: "Solo Leveling", romaji: "Ore dake Level Up na Ken", native: "俺だけレベルアップな件" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80",
        episodes: 12,
        averageScore: 85,
        status: "FINISHED AIRING",
        genres: ["Action", "Adventure", "Fantasy"],
        studios: { nodes: [{ name: "A-1 Pictures" }] },
        trailer: { id: "91e5N3WcTq8", site: "youtube" },
        description: "In a world where hunters awaken with superhuman abilities, the weakest E-rank hunter Sung Jinwoo is left for dead in a mysterious double dungeon."
      },
      {
        id: 101922,
        title: { english: "Demon Slayer: Kimetsu no Yaiba", romaji: "Kimetsu no Yaiba", native: "鬼滅の刃" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=80",
        episodes: 26,
        averageScore: 86,
        status: "FINISHED AIRING",
        genres: ["Action", "Fantasy", "Supernatural"],
        studios: { nodes: [{ name: "ufotable" }] },
        trailer: { id: "6vMuWuWlW4I", site: "youtube" },
        description: "Tanjiro Kamado sets out on a perilous path to become a demon slayer and restore his sister Nezuko back into human form."
      },
      {
        id: 113415,
        title: { english: "Jujutsu Kaisen", romaji: "Jujutsu Kaisen", native: "呪術廻戦" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80",
        episodes: 24,
        averageScore: 87,
        status: "FINISHED AIRING",
        genres: ["Action", "Fantasy", "Supernatural"],
        studios: { nodes: [{ name: "MAPPA" }] },
        trailer: { id: "pkKu9hLT-t8", site: "youtube" },
        description: "Yuji Itadori swallows a cursed talisman—the finger of Ryomen Sukuna—and joins Tokyo Jujutsu High to exorcise catastrophic curses."
      },
      {
        id: 16498,
        title: { english: "Attack on Titan", romaji: "Shingeki no Kyojin", native: "進撃の巨人" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?auto=format&fit=crop&w=1600&q=80",
        episodes: 25,
        averageScore: 90,
        status: "FINISHED AIRING",
        genres: ["Action", "Drama", "Fantasy", "Mystery"],
        studios: { nodes: [{ name: "WIT Studio" }] },
        trailer: { id: "MGRm4IzK1SQ", site: "youtube" },
        description: "After his hometown is destroyed, Eren Yeager vows to cleanse the earth of the giant humanoid Titans that have brought humanity to the brink of extinction."
      },
      {
        id: 21,
        title: { english: "One Piece", romaji: "One Piece", native: "ワンピース" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1600&q=80",
        episodes: 1100,
        averageScore: 89,
        status: "RELEASING",
        genres: ["Action", "Adventure", "Comedy", "Fantasy"],
        studios: { nodes: [{ name: "Toei Animation" }] },
        trailer: { id: "1P8gT6dF1lM", site: "youtube" },
        description: "Monkey D. Luffy sails the Grand Line with his Straw Hat Pirates in search of the legendary ultimate treasure known as the One Piece."
      },
      {
        id: 114446,
        title: { english: "Bleach: Thousand-Year Blood War", romaji: "Bleach: Sennen Kessen-hen", native: "BLEACH 千年血戦篇" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80",
        episodes: 13,
        averageScore: 88,
        status: "FINISHED AIRING",
        genres: ["Action", "Adventure", "Supernatural"],
        studios: { nodes: [{ name: "Pierrot" }] },
        trailer: { id: "e8YBesRKq_U", site: "youtube" },
        description: "The peace is suddenly broken when warning sirens blare through Soul Society. The Quincy empire Wandenreich wages total war against the Soul Reapers."
      },
      {
        id: 9253,
        title: { english: "Steins;Gate", romaji: "Steins;Gate", native: "STEINS;GATE" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?auto=format&fit=crop&w=1600&q=80",
        episodes: 24,
        averageScore: 91,
        status: "FINISHED AIRING",
        genres: ["Drama", "Sci-Fi", "Suspense", "Thriller"],
        studios: { nodes: [{ name: "White Fox" }] },
        trailer: { id: "27OZcZlogt4", site: "youtube" },
        description: "Self-proclaimed mad scientist Rintaro Okabe accidentally invents a microwave device capable of transmitting text messages into the past."
      },
      {
        id: 127230,
        title: { english: "Chainsaw Man", romaji: "Chainsaw Man", native: "チェンソーマン" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80",
        episodes: 12,
        averageScore: 84,
        status: "FINISHED AIRING",
        genres: ["Action", "Comedy", "Supernatural"],
        studios: { nodes: [{ name: "MAPPA" }] },
        trailer: { id: "v4yLeNt-kCU", site: "youtube" },
        description: "Denji lives a life of poverty, working off his deceased father's debt to the yakuza by harvesting devil corpses with Pochita."
      },
      {
        id: 1535,
        title: { english: "Death Note", romaji: "Death Note", native: "DEATH NOTE" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=80",
        episodes: 37,
        averageScore: 90,
        status: "FINISHED AIRING",
        genres: ["Mystery", "Psychological", "Supernatural", "Thriller"],
        studios: { nodes: [{ name: "Madhouse" }] },
        trailer: { id: "NlJZ-YgAt-c", site: "youtube" },
        description: "A brilliant high school student discovers a supernatural notebook that grants the power to eliminate anyone whose name is inscribed within it."
      },
      {
        id: 101348,
        title: { english: "Vinland Saga", romaji: "Vinland Saga", native: "ヴィンランド・サガ" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80",
        episodes: 24,
        averageScore: 88,
        status: "FINISHED AIRING",
        genres: ["Action", "Adventure", "Drama"],
        studios: { nodes: [{ name: "WIT Studio" }] },
        trailer: { id: "0L18n2iU36A", site: "youtube" },
        description: "Young Thorfinn joins the mercenary band of Askeladd, the man who slew his father, waiting for the day he can duel and defeat him in honorable combat."
      },
      {
        id: 120377,
        title: { english: "Cyberpunk: Edgerunners", romaji: "Cyberpunk: Edgerunners", native: "サイバーパンク エッジランナーズ" },
        coverImage: { extraLarge: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80", large: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=400&q=80" },
        bannerImage: "https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?auto=format&fit=crop&w=1600&q=80",
        episodes: 10,
        averageScore: 86,
        status: "FINISHED AIRING",
        genres: ["Action", "Sci-Fi", "Drama"],
        studios: { nodes: [{ name: "Trigger" }] },
        trailer: { id: "JtqIas3bYhg", site: "youtube" },
        description: "A street kid trying to survive in a technology and body modification-obsessed city of the future chooses to stay alive by becoming an edgerunner."
      }
    ];

    AppState.animeCatalog = [...BASELINE_ANIME_CATALOG];
    AppState.catalogInitialised = false;
    AppState.currentAnimeSearch = '';
    AppState.currentAnimeCategory = 'trending';
    AppState.currentAnimeGenre = '';
    AppState.activeAnimeDetail = null;
    AppState.activePlayerAnime = null;
    AppState.activePlayerEpisode = 1;

    let catalogSearchDebounceTimer = null;

    async function fetchAniListCatalog(params = {}) {
      const loader = $('anime-catalog-loading-indicator');
      if (loader) loader.classList.remove('hidden');

      const search = params.search !== undefined ? params.search : AppState.currentAnimeSearch;
      const genre = params.genre !== undefined ? params.genre : AppState.currentAnimeGenre;
      const category = params.category !== undefined ? params.category : AppState.currentAnimeCategory;

      AppState.currentAnimeSearch = search;
      AppState.currentAnimeGenre = genre;
      AppState.currentAnimeCategory = category;

      let sortArray = ["TRENDING_DESC", "POPULARITY_DESC"];
      if (category === 'top') sortArray = ["SCORE_DESC"];
      if (category === 'popular') sortArray = ["POPULARITY_DESC"];

      const query = `
        query ($search: String, $genre: String, $sort: [MediaSort]) {
          Page(page: 1, perPage: 24) {
            media(type: ANIME, search: $search, genre: $genre, sort: $sort) {
              id
              title {
                romaji
                english
                native
              }
              description
              coverImage {
                extraLarge
                large
              }
              bannerImage
              episodes
              averageScore
              status
              genres
              studios(isMain: true) {
                nodes {
                  name
                }
              }
              trailer {
                id
                site
              }
            }
          }
        }
      `;

      const variables = { sort: sortArray };
      if (search && search.trim()) variables.search = search.trim();
      if (genre && genre.trim()) variables.genre = genre.trim();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const json = await response.json();
          const items = json?.data?.Page?.media;
          if (Array.isArray(items) && items.length > 0) {
            AppState.animeCatalog = items.map(item => ({
              id: item.id,
              title: {
                english: item.title?.english || item.title?.romaji || 'Untitled Series',
                romaji: item.title?.romaji || item.title?.english || '',
                native: item.title?.native || ''
              },
              coverImage: {
                extraLarge: item.coverImage?.extraLarge || item.coverImage?.large || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
                large: item.coverImage?.large || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80'
              },
              bannerImage: item.bannerImage || item.coverImage?.extraLarge || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80',
              episodes: item.episodes || 12,
              averageScore: item.averageScore || 85,
              status: item.status || 'AIRING',
              genres: Array.isArray(item.genres) ? item.genres : ['Action'],
              studios: item.studios || { nodes: [{ name: 'Animation Studio' }] },
              trailer: item.trailer || { id: 'qgQunxD0qLk', site: 'youtube' },
              description: item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'No synopsis available for this galactic transmission.'
            }));
          }
        }
      } catch (err) {
        // Fallback filter on local baseline catalog
        let filtered = [...BASELINE_ANIME_CATALOG];
        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          filtered = filtered.filter(a => 
            (a.title.english && a.title.english.toLowerCase().includes(q)) ||
            (a.title.romaji && a.title.romaji.toLowerCase().includes(q)) ||
            a.genres.some(g => g.toLowerCase().includes(q))
          );
        }
        if (genre && genre.trim()) {
          filtered = filtered.filter(a => a.genres.includes(genre));
        }
        AppState.animeCatalog = filtered;
      } finally {
        if (loader) loader.classList.add('hidden');
        AppState.catalogInitialised = true;
        renderAnimeGrid(AppState.animeCatalog);
      }
    }

    function renderAnimeGrid(list) {
      const grid = $('anime-cards-grid');
      const emptyState = $('anime-empty-search-state');
      if (!grid) return;

      if (!list || list.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      grid.innerHTML = list.map(anime => {
        const title = anime.title.english || anime.title.romaji || 'Anime Series';
        const poster = anime.coverImage?.extraLarge || anime.coverImage?.large || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80';
        const score = (anime.averageScore ? (anime.averageScore / 10).toFixed(1) : '8.5');
        const studio = anime.studios?.nodes?.[0]?.name || (anime.genres && anime.genres[0]) || 'TV';

        return `
          <div 
            class="group relative rounded-2xl overflow-hidden glass-card border border-white/10 hover:border-purple-400/60 transition-all duration-300 flex flex-col justify-between cursor-pointer"
            onclick="openAnimeDetailModal(${anime.id})"
          >
            <!-- Poster Image Container -->
            <div class="relative aspect-[3/4] w-full overflow-hidden bg-[#0d0a1a]">
              <img 
                src="${poster}" 
                alt="${title}" 
                loading="lazy"
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80';"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity"></div>
              
              <!-- Clean Minimal Quick-Play Overlay on Hover -->
              <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <button 
                  onclick="event.stopPropagation(); launchAnimePlayer(${anime.id}, 1);" 
                  class="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center text-base shadow-xl transform scale-90 group-hover:scale-100 transition-all cursor-pointer"
                  title="Stream Series"
                >
                  <i class="fa-solid fa-play ml-0.5"></i>
                </button>
              </div>

              <!-- Top Score Stamp -->
              <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-[10px] font-mono font-bold text-amber-300 border border-white/10 flex items-center gap-1">
                <i class="fa-solid fa-star text-[9px]"></i>
                <span>${score}</span>
              </div>
            </div>

            <!-- Card Bottom Meta -->
            <div class="p-3 bg-[#080512]">
              <h4 class="text-xs font-bold text-white line-clamp-1 group-hover:text-accent transition-colors" title="${title}">${title}</h4>
              <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>${studio}</span>
                <span>${anime.episodes ? `${anime.episodes} Ep` : 'Ongoing'}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function handleAnimeCatalogSearchInput(val) {
      const clearBtn = $('anime-search-clear-btn');
      if (clearBtn) {
        if (val && val.trim().length > 0) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
      }

      clearTimeout(catalogSearchDebounceTimer);
      catalogSearchDebounceTimer = setTimeout(() => {
        fetchAniListCatalog({ search: val });
      }, 300);
    }

    function clearAnimeCatalogSearch() {
      const input = $('anime-catalog-search');
      if (input) input.value = '';
      const clearBtn = $('anime-search-clear-btn');
      if (clearBtn) clearBtn.classList.add('hidden');
      fetchAniListCatalog({ search: '' });
    }

    function setAnimeCatalogCategory(category) {
      const chips = [
        { id: 'filter-chip-trending', name: 'trending' },
        { id: 'filter-chip-top', name: 'top' },
        { id: 'filter-chip-popular', name: 'popular' }
      ];

      chips.forEach(c => {
        const btn = $(c.id);
        if (!btn) return;
        if (c.name === category) {
          btn.className = 'catalog-filter-btn px-4 py-2 rounded-xl font-bold bg-purple-600 text-white shadow-sm cursor-pointer transition-all shrink-0 flex items-center gap-1.5';
        } else {
          btn.className = 'catalog-filter-btn px-4 py-2 rounded-xl font-semibold bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all shrink-0 flex items-center gap-1.5';
        }
      });

      const heading = $('anime-catalog-heading');
      if (heading) {
        const map = {
          trending: 'Trending Releases',
          top: 'Top Rated Series',
          popular: 'All-Time Popular'
        };
        heading.innerHTML = `<span>${map[category] || 'Catalog'}</span>`;
      }

      fetchAniListCatalog({ category });
    }

    function setAnimeCatalogGenre(genre) {
      const genreChips = ['Action', 'Sci-Fi', 'Fantasy', 'Romance', 'Comedy'];
      genreChips.forEach(g => {
        const btn = $(`filter-chip-${g.toLowerCase()}`);
        if (!btn) return;
        if (AppState.currentAnimeGenre === g && genre === g) {
          // Toggle off
          btn.className = 'catalog-filter-btn px-4 py-2 rounded-xl font-semibold bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all shrink-0 flex items-center gap-1.5';
          AppState.currentAnimeGenre = '';
        } else if (genre === g) {
          btn.className = 'catalog-filter-btn px-4 py-2 rounded-xl font-bold bg-purple-600 text-white shadow-sm cursor-pointer transition-all shrink-0 flex items-center gap-1.5';
          AppState.currentAnimeGenre = g;
        } else {
          btn.className = 'catalog-filter-btn px-4 py-2 rounded-xl font-semibold bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all shrink-0 flex items-center gap-1.5';
        }
      });

      fetchAniListCatalog({ genre: AppState.currentAnimeGenre });
    }

    function refreshAnimeCatalog() {
      const icon = $('btn-refresh-catalog-icon');
      if (icon) icon.classList.add('animate-spin');
      fetchAniListCatalog().finally(() => {
        setTimeout(() => {
          if (icon) icon.classList.remove('animate-spin');
          showToast('Anime catalog updated!', 'success');
        }, 500);
      });
    }

    // ====================================================
    // 24. ANIME DETAIL & TRAILER PREVIEW MODAL
    // ----------------------------------------------------
    function findAnimeById(id) {
      const numId = parseInt(id, 10);
      return AppState.animeCatalog.find(a => a.id === numId) || BASELINE_ANIME_CATALOG.find(a => a.id === numId) || BASELINE_ANIME_CATALOG[0];
    }

    function openAnimeDetailModal(id) {
      const anime = findAnimeById(id);
      if (!anime) return;
      AppState.activeAnimeDetail = anime;

      const modal = $('anime-detail-modal');
      const bannerImg = $('detail-banner-img');
      const posterImg = $('detail-poster-img');
      const scoreVal = $('detail-score-val');
      const statusPill = $('detail-status-pill');
      const episodesPill = $('detail-episodes-pill');
      const studioPill = $('detail-studio-pill');
      const titleEng = $('detail-title-english');
      const titleRom = $('detail-title-romaji');
      const synopsis = $('detail-synopsis');
      const genresContainer = $('detail-genres-container');
      const trailerIframe = $('detail-trailer-iframe');
      const trailerPlaceholder = $('detail-trailer-placeholder');

      if (bannerImg) bannerImg.src = anime.bannerImage || anime.coverImage?.extraLarge || '';
      if (posterImg) posterImg.src = anime.coverImage?.extraLarge || anime.coverImage?.large || '';
      if (scoreVal) scoreVal.textContent = (anime.averageScore ? (anime.averageScore / 10).toFixed(1) : '8.8');
      if (statusPill) statusPill.textContent = anime.status || 'FINISHED AIRING';
      if (episodesPill) episodesPill.textContent = `${anime.episodes || 24} Episodes`;
      if (studioPill) studioPill.textContent = anime.studios?.nodes?.[0]?.name || 'Madhouse';
      if (titleEng) titleEng.textContent = anime.title.english || anime.title.romaji || 'Anime Series';
      if (titleRom) titleRom.textContent = anime.title.romaji || anime.title.native || '';
      if (synopsis) synopsis.textContent = anime.description || 'Synopsis loading...';

      if (genresContainer && Array.isArray(anime.genres)) {
        genresContainer.innerHTML = anime.genres.map(g => `
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 border border-white/10 text-slate-300">
            ${g}
          </span>
        `).join('');
      }

      // Trailer Preview Setup
      if (anime.trailer && anime.trailer.id && anime.trailer.site === 'youtube') {
        if (trailerIframe) {
          trailerIframe.src = `https://www.youtube-nocookie.com/embed/${anime.trailer.id}?autoplay=0&rel=0`;
          trailerIframe.classList.remove('hidden');
        }
        if (trailerPlaceholder) trailerPlaceholder.classList.add('hidden');
      } else {
        if (trailerIframe) {
          trailerIframe.src = '';
          trailerIframe.classList.add('hidden');
        }
        if (trailerPlaceholder) trailerPlaceholder.classList.remove('hidden');
      }

      updateDetailModalFavoriteButton();

      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeAnimeDetailModal() {
      const modal = $('anime-detail-modal');
      const trailerIframe = $('detail-trailer-iframe');
      if (trailerIframe) trailerIframe.src = '';
      if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    }

    function launchAnimePlayerFromDetail() {
      if (!AppState.activeAnimeDetail) return;
      const anime = AppState.activeAnimeDetail;
      closeAnimeDetailModal();
      launchAnimePlayer(anime.id, 1);
    }

    function copyShareAnimeLink() {
      if (!AppState.activeAnimeDetail) return;
      const title = AppState.activeAnimeDetail.title.english || AppState.activeAnimeDetail.title.romaji;
      navigator.clipboard?.writeText(window.location.href).catch(() => {});
      showToast(`Transmission link copied for: ${title}`, 'success');
    }

    function updateDetailModalFavoriteButton() {
      if (!AppState.activeAnimeDetail) return;
      const isFav = isAnimeFavorited(AppState.activeAnimeDetail.id);
      const icon = $('detail-fav-btn-icon');
      const label = $('detail-fav-btn-label');
      if (icon) {
        icon.className = isFav ? 'fa-solid fa-heart text-pink-500' : 'fa-regular fa-heart text-pink-400';
      }
      if (label) {
        label.textContent = isFav ? 'Favourited' : 'Add to Favourites';
      }
    }

    function toggleFavoriteFromDetail() {
      if (!AppState.activeAnimeDetail) return;
      toggleFavoriteAnime(AppState.activeAnimeDetail);
      updateDetailModalFavoriteButton();
    }

    // ====================================================
    // 25. CINEMA ANIME VIDEO PLAYER ENGINE
    // ----------------------------------------------------
    let nextEpCountdownTimer = null;

    function launchAnimePlayer(animeId, episode = 1) {
      const anime = findAnimeById(animeId);
      if (!anime) return;

      AppState.activePlayerAnime = anime;
      AppState.activePlayerEpisode = episode;

      const modal = $('anime-video-player-modal');
      const titleEl = $('player-anime-title');
      const epTag = $('player-episode-tag');
      const epTitle = $('player-episode-title');
      const epSelect = $('player-episode-select');
      const video = $('soranix-html5-video');

      const title = anime.title.english || anime.title.romaji;
      if (titleEl) titleEl.textContent = title;
      if (epTag) epTag.textContent = `Ep ${episode}`;
      if (epTitle) epTitle.textContent = `Episode ${episode}: Celestial Journey`;

      if (epSelect) {
        const total = anime.episodes || 12;
        epSelect.innerHTML = Array.from({ length: total }, (_, i) => i + 1).map(n => `
          <option value="${n}" ${n === episode ? 'selected' : ''}>Ep ${n}: Episode ${n}</option>
        `).join('');
      }

      if (video) {
        video.poster = anime.bannerImage || anime.coverImage?.extraLarge || '';
        video.currentTime = 0;
        video.play().catch(() => {});
      }

      // Ensure watch tracker is actively running and awarding coins
      if (!AppState.watchTrackerActive) {
        startWatchTracker();
      }

      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
      }

      showToast(`Now Streaming: ${title} (Episode ${episode})`, 'info');
    }

    function closeAnimePlayerModal() {
      const modal = $('anime-video-player-modal');
      const video = $('soranix-html5-video');
      if (video) {
        video.pause();
      }
      clearTimeout(nextEpCountdownTimer);
      const nextToast = $('player-next-ep-toast');
      if (nextToast) nextToast.classList.add('hidden');

      if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    }

    function toggleVideoPlayback() {
      const video = $('soranix-html5-video');
      const playIcon = $('player-btn-play-icon');
      const overlay = $('player-center-play-overlay');
      if (!video) return;

      if (video.paused) {
        video.play().catch(() => {});
        if (playIcon) playIcon.className = 'fa-solid fa-pause';
        if (overlay) overlay.classList.add('opacity-0', 'pointer-events-none');
      } else {
        video.pause();
        if (playIcon) playIcon.className = 'fa-solid fa-play';
        if (overlay) overlay.classList.remove('opacity-0', 'pointer-events-none');
      }
    }

    function handleVideoSeek(percent) {
      const video = $('soranix-html5-video');
      if (!video || !video.duration) return;
      video.currentTime = (percent / 100) * video.duration;
    }

    function seekVideoRelative(seconds) {
      const video = $('soranix-html5-video');
      if (!video) return;
      video.currentTime = Math.max(0, Math.min(video.duration || 9999, video.currentTime + seconds));
    }

    function skipAnimeIntro() {
      seekVideoRelative(85);
      showToast('Skipped Anime Intro (+85s)', 'info');
    }

    function playPreviousEpisode() {
      if (AppState.activePlayerEpisode > 1) {
        selectPlayerEpisode(AppState.activePlayerEpisode - 1);
      } else {
        showToast('Already at Episode 1.', 'info');
      }
    }

    function playNextEpisode() {
      const max = AppState.activePlayerAnime?.episodes || 12;
      if (AppState.activePlayerEpisode < max) {
        selectPlayerEpisode(AppState.activePlayerEpisode + 1);
      } else {
        showToast('You have reached the latest episode!', 'success');
      }
    }

    function selectPlayerEpisode(epNum) {
      clearTimeout(nextEpCountdownTimer);
      const nextToast = $('player-next-ep-toast');
      if (nextToast) nextToast.classList.add('hidden');

      AppState.activePlayerEpisode = epNum;
      const epTag = $('player-episode-tag');
      const epTitle = $('player-episode-title');
      const epSelect = $('player-episode-select');

      if (epTag) epTag.textContent = `Ep ${epNum}`;
      if (epTitle) epTitle.textContent = `Episode ${epNum}: Celestial Journey`;
      if (epSelect) epSelect.value = epNum;

      const video = $('soranix-html5-video');
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
      showToast(`Playing Episode ${epNum}`, 'info');
    }

    function toggleVideoMute() {
      const video = $('soranix-html5-video');
      const icon = $('player-vol-icon');
      const slider = $('player-vol-slider');
      if (!video) return;

      video.muted = !video.muted;
      if (video.muted) {
        if (icon) icon.className = 'fa-solid fa-volume-xmark text-red-400';
        if (slider) slider.value = 0;
      } else {
        if (icon) icon.className = 'fa-solid fa-volume-high';
        if (slider) slider.value = video.volume || 1;
      }
    }

    function setVideoVolume(val) {
      const video = $('soranix-html5-video');
      const icon = $('player-vol-icon');
      if (!video) return;

      const num = parseFloat(val);
      video.volume = num;
      video.muted = num === 0;

      if (icon) {
        if (num === 0) icon.className = 'fa-solid fa-volume-xmark text-red-400';
        else if (num < 0.5) icon.className = 'fa-solid fa-volume-low';
        else icon.className = 'fa-solid fa-volume-high';
      }
    }

    function setPlayerQuality(q) {
      AppState.playerQuality = q;
      ['1080', '720', '480'].forEach(res => {
        const btn = $(`quality-btn-${res}`);
        if (!btn) return;
        if (`${res}p` === q) {
          btn.className = 'px-2 py-1 rounded-lg bg-purple-600 text-white cursor-pointer';
        } else {
          btn.className = 'px-2 py-1 rounded-lg text-slate-400 hover:text-white cursor-pointer';
        }
      });
      showToast(`Playback Quality switched to ${q}`, 'info');
    }

    function setPlayerTrack(track) {
      AppState.playerTrack = track;
      const sub = $('track-btn-sub');
      const dub = $('track-btn-dub');
      if (track === 'SUB') {
        if (sub) sub.className = 'px-2 py-1 rounded-lg bg-cyan-600 text-white cursor-pointer';
        if (dub) dub.className = 'px-2 py-1 rounded-lg text-slate-400 hover:text-white cursor-pointer';
        showToast('Audio set to Japanese with English Subtitles', 'info');
      } else {
        if (dub) dub.className = 'px-2 py-1 rounded-lg bg-cyan-600 text-white cursor-pointer';
        if (sub) sub.className = 'px-2 py-1 rounded-lg text-slate-400 hover:text-white cursor-pointer';
        showToast('Audio set to English Dub', 'info');
      }
    }

    function togglePlayerBrowserFullscreen() {
      const container = $('anime-video-player-modal');
      const icon = $('player-fullscreen-header-icon');
      const btnIcon = $('player-btn-fullscreen-icon');

      if (!document.fullscreenElement) {
        container?.requestFullscreen?.().then(() => {
          if (icon) icon.className = 'fa-solid fa-compress';
          if (btnIcon) btnIcon.className = 'fa-solid fa-compress';
        }).catch(() => {});
      } else {
        document.exitFullscreen?.().then(() => {
          if (icon) icon.className = 'fa-solid fa-expand';
          if (btnIcon) btnIcon.className = 'fa-solid fa-expand';
        }).catch(() => {});
      }
    }

    function formatVideoTime(seconds) {
      if (isNaN(seconds) || seconds < 0) return '00:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // Video Event Listeners
    (() => {
      const video = $('soranix-html5-video');
      if (!video) return;

      video.addEventListener('timeupdate', () => {
        const cur = $('player-time-current');
        const tot = $('player-time-total');
        const slider = $('player-timeline-slider');

        if (cur) cur.textContent = formatVideoTime(video.currentTime);
        if (tot && video.duration) tot.textContent = formatVideoTime(video.duration);
        if (slider && video.duration) {
          slider.value = (video.currentTime / video.duration) * 100;
        }
      });

      video.addEventListener('play', () => {
        const playIcon = $('player-btn-play-icon');
        const overlay = $('player-center-play-overlay');
        if (playIcon) playIcon.className = 'fa-solid fa-pause';
        if (overlay) overlay.classList.add('opacity-0', 'pointer-events-none');
      });

      video.addEventListener('pause', () => {
        const playIcon = $('player-btn-play-icon');
        const overlay = $('player-center-play-overlay');
        if (playIcon) playIcon.className = 'fa-solid fa-play';
        if (overlay) overlay.classList.remove('opacity-0', 'pointer-events-none');
      });

      video.addEventListener('ended', () => {
        const nextToast = $('player-next-ep-toast');
        const toastText = $('player-next-ep-toast-text');
        const max = AppState.activePlayerAnime?.episodes || 12;

        if (AppState.activePlayerEpisode < max) {
          const nextEp = AppState.activePlayerEpisode + 1;
          if (toastText) toastText.textContent = `Playing Episode ${nextEp} in 5s...`;
          if (nextToast) nextToast.classList.remove('hidden');

          nextEpCountdownTimer = setTimeout(() => {
            selectPlayerEpisode(nextEp);
          }, 5000);
        }
      });
    })();

    // ====================================================
    // 26. HERO BANNER INTERACTION ENGINE
    // ----------------------------------------------------
    function playFeaturedHeroAnime() {
      launchAnimePlayer(154587, 1);
    }

    function openFeaturedHeroAnimeDetail() {
      openAnimeDetailModal(154587);
    }

    function toggleFeaturedHeroFavorite() {
      const heroAnime = findAnimeById(154587);
      toggleFavoriteAnime(heroAnime);
      const isFav = isAnimeFavorited(154587);
      const icon = $('anime-hero-fav-icon');
      if (icon) {
        icon.className = isFav ? 'fa-solid fa-heart text-pink-500 text-base' : 'fa-regular fa-heart text-pink-400 text-base';
      }
    }

    // ====================================================
    // 27. FAVORITES PERSISTENCE ENGINE
    // ----------------------------------------------------
    const FAVORITES_KEY = 'soranix_favorites';

    function getFavoritesList() {
      try {
        const data = localStorage.getItem(FAVORITES_KEY);
        return data ? JSON.parse(data) : [];
      } catch (e) {
        return [];
      }
    }

    function saveFavoritesList(list) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
      updateStatsCounters();
      const badge = $('sidebar-fav-badge');
      if (badge) badge.textContent = list.length;
    }

    function isAnimeFavorited(id) {
      const list = getFavoritesList();
      const numId = parseInt(id, 10);
      return list.some(item => item.id === numId);
    }

    function toggleFavoriteAnime(anime) {
      if (!anime) return;
      let list = getFavoritesList();
      const numId = parseInt(anime.id, 10);
      const exists = list.some(item => item.id === numId);

      if (exists) {
        list = list.filter(item => item.id !== numId);
        saveFavoritesList(list);
        showToast(`Removed "${anime.title.english || anime.title.romaji}" from Favourites.`, 'info');
      } else {
        list.push({
          id: numId,
          title: anime.title,
          coverImage: anime.coverImage,
          averageScore: anime.averageScore,
          episodes: anime.episodes,
          genres: anime.genres
        });
        saveFavoritesList(list);
        showToast(`Added "${anime.title.english || anime.title.romaji}" to Favourites!`, 'success');
      }

      if (AppState.currentTab === 'favorites') {
        renderFavoritesUI();
      }
    }

    function renderFavoritesUI() {
      const list = getFavoritesList();
      const container = $('tab-view-favorites');
      if (!container) return;

      if (list.length === 0) {
        container.innerHTML = `
          <div class="glass-panel rounded-3xl p-12 text-center border border-dashed border-white/10 space-y-3">
            <div class="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-pink-400 text-2xl mx-auto">
              <i class="fa-regular fa-heart"></i>
            </div>
            <h3 class="text-base font-bold text-white">No Favourited Series Yet</h3>
            <p class="text-xs text-slate-400 max-w-sm mx-auto">
              Bookmark your favorite anime across the galaxy using the heart button on any series card or detail modal.
            </p>
            <button onclick="switchDashboardTab('home')" class="mt-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white shadow-sm cursor-pointer">
              Explore Anime Catalog
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-glassBorder">
            <div>
              <h2 class="text-2xl font-display font-extrabold text-white">Favourited Anime</h2>
              <p class="text-xs text-slate-400">${list.length} saved bookmarks in your cosmic archive</p>
            </div>
            <button onclick="switchDashboardTab('home')" class="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white cursor-pointer">
              Back to Catalog
            </button>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            ${list.map(anime => {
              const title = anime.title.english || anime.title.romaji;
              const poster = anime.coverImage?.extraLarge || anime.coverImage?.large;
              return `
                <div class="group relative rounded-2xl overflow-hidden glass-card border border-white/10 hover:border-pink-500/50 transition-all cursor-pointer" onclick="openAnimeDetailModal(${anime.id})">
                  <div class="relative aspect-[3/4] w-full bg-[#0d0a1a] overflow-hidden">
                    <img src="${poster}" alt="${title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <button onclick="event.stopPropagation(); toggleFavoriteAnime({ id: ${anime.id}, title: { english: '${title.replace(/'/g, "\\'")}' } });" class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-pink-600 text-pink-400 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer" title="Remove Favorite">
                      <i class="fa-solid fa-heart"></i>
                    </button>
                  </div>
                  <div class="p-3 bg-[#080512]">
                    <h4 class="text-xs font-bold text-white truncate">${title}</h4>
                    <span class="text-[10px] text-slate-400 font-mono">${anime.episodes || 12} Episodes</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // ====================================================
    // 28. FULLSCREEN CHAT & DRAWER TOGGLES
    // ----------------------------------------------------
    function toggleGlobalChatFullscreen() {
      const panel = $('global-chat-panel');
      const icon = $('#global-chat-panel button i.fa-expand, #global-chat-panel button i.fa-compress');
      if (!panel) return;

      if (panel.classList.contains('w-full') && panel.classList.contains('sm:w-full')) {
        panel.classList.remove('sm:w-full');
        panel.classList.add('sm:w-[420px]');
        if (icon) icon.className = 'fa-solid fa-expand text-xs';
      } else {
        panel.classList.remove('sm:w-[420px]');
        panel.classList.add('sm:w-full');
        if (icon) icon.className = 'fa-solid fa-compress text-xs';
      }
    }

    function toggleDMChatFullscreen() {
      const drawer = $('dm-chat-drawer');
      const icon = $('dm-chat-fullscreen-icon');
      if (!drawer) return;

      if (drawer.classList.contains('sm:w-full')) {
        drawer.classList.remove('sm:w-full');
        drawer.classList.add('sm:w-[420px]');
        if (icon) icon.className = 'fa-solid fa-expand';
      } else {
        drawer.classList.remove('sm:w-[420px]');
        drawer.classList.add('sm:w-full');
        if (icon) icon.className = 'fa-solid fa-compress';
      }
    }

    // ====================================================
    // 29. STAFF ROLE ASSIGNMENT HANDLERS
    // ----------------------------------------------------
    function handleStaffRolePresetChange(roleKey) {
      // Helper for role presets if configured in admin
    }

    function adminAssignStaffRole() {
      const select = $('admin-staff-user-select');
      const roleSelect = $('admin-staff-role-select');
      const targetKey = select?.value;
      const role = roleSelect?.value || 'Moderator';

      if (!targetKey) {
        showToast('Please select a user to assign role.', 'error');
        return;
      }

      const users = getUsersDB();
      if (users[targetKey]) {
        users[targetKey].staffRole = role;
        users[targetKey].title = `${role} of Soranix`;
        saveUsersDB(users);
        showToast(`Assigned role [${role}] to ${users[targetKey].username}!`, 'success');
        renderAdminUsersList();
      }
    }

    // Initialize initial state on load
    setTimeout(() => {
      if (!AppState.catalogInitialised) {
        fetchAniListCatalog();
      }
      const favs = getFavoritesList();
      const favBadge = $('sidebar-fav-badge');
      if (favBadge) favBadge.textContent = favs.length;
    }, 100);

    // Expose all functions to global window for HTML onclick / oninput bindings
    window.enterDashboard = enterDashboard;
    window.returnToSplash = returnToSplash;
    window.continueAsGuest = continueAsGuest;
    window.handleLogout = handleLogout;
    window.switchDashboardTab = switchDashboardTab;
    window.toggleGearMenu = toggleGearMenu;
    window.closeGearMenu = closeGearMenu;
    window.openEditProfileModal = openEditProfileModal;
    window.closeEditProfileModal = closeEditProfileModal;
    window.updateLivePreview = updateLivePreview;
    window.selectFrame = selectFrame;
    window.saveProfileChanges = saveProfileChanges;
    window.handleModalAvatarUpload = handleModalAvatarUpload;
    window.handleDirectAvatarUpload = handleDirectAvatarUpload;
    window.handleModalBannerUpload = handleModalBannerUpload;
    window.handleDirectBannerUpload = handleDirectBannerUpload;
    window.resetAvatarToDefaultS = resetAvatarToDefaultS;
    window.switchContentTab = switchContentTab;
    window.setLayoutMode = setLayoutMode;
    window.setCosmicTheme = setCosmicTheme;
    window.toggleDashboardThemeMenu = toggleDashboardThemeMenu;
    window.closeDashboardThemeMenu = closeDashboardThemeMenu;
    window.openAuthModal = openAuthModal;
    window.closeAuthModal = closeAuthModal;
    window.setAuthMode = setAuthMode;
    window.handleAuthSubmit = handleAuthSubmit;
    window.validateAuthUsernameRealtime = validateAuthUsernameRealtime;
    window.handleEditUsernameInput = handleEditUsernameInput;
    window.triggerFirebaseGoogleLogin = triggerFirebaseGoogleLogin;
    window.claimDay1Reward = claimDay1Reward;
    window.renderDailyRewardsUI = renderDailyRewardsUI;
    window.openBugReportModal = openBugReportModal;
    window.closeBugReportModal = closeBugReportModal;
    window.handleBugSubmit = handleBugSubmit;
    window.toggleAnimeWatchSession = toggleAnimeWatchSession;
    window.showToast = showToast;
    // Cosmic Shop
    window.renderShopCatalog = renderShopCatalog;
    window.openShopItemPreview = openShopItemPreview;
    window.closeShopItemPreview = closeShopItemPreview;
    window.filterShopCategory = filterShopCategory;
    window.setShopOwnershipFilter = setShopOwnershipFilter;
    window.handleShopSearchInput = handleShopSearchInput;
    window.buyShopItem = buyShopItem;
    window.equipShopItem = equipShopItem;
    // Chat & Friends
    window.toggleGlobalChatPanel = toggleGlobalChatPanel;
    window.closeGlobalChatPanel = closeGlobalChatPanel;
    window.sendGlobalChatMessage = sendGlobalChatMessage;
    window.renderGlobalChatMessages = renderGlobalChatMessages;
    window.insertGlobalEmoji = insertGlobalEmoji;
    window.toggleGlobalChatVisibilitySetting = toggleGlobalChatVisibilitySetting;
    window.toggleGlobalChatFullscreen = toggleGlobalChatFullscreen;
    window.toggleDMChatFullscreen = toggleDMChatFullscreen;
    window.openUserProfilePreviewModal = openUserProfilePreviewModal;
    window.closeUserProfilePreviewModal = closeUserProfilePreviewModal;
    window.handlePreviewModalFriendAction = handlePreviewModalFriendAction;
    window.handlePreviewModalDMAction = handlePreviewModalDMAction;
    window.switchFriendsSubTab = switchFriendsSubTab;
    window.renderFriendsUI = renderFriendsUI;
    window.handleSendFriendRequest = handleSendFriendRequest;
    window.sendFriendRequestTo = sendFriendRequestTo;
    window.acceptFriendRequest = acceptFriendRequest;
    window.declineFriendRequest = declineFriendRequest;
    window.removeFriend = removeFriend;
    window.openDMChat = openDMChat;
    window.closeDMChatDrawer = closeDMChatDrawer;
    window.sendDirectMessage = sendDirectMessage;
    window.sendAnimeRecommendation = sendAnimeRecommendation;
    window.toggleRecommendMenu = toggleRecommendMenu;
    window.insertDMEmoji = insertDMEmoji;
    window.toggleNotificationDropdown = toggleNotificationDropdown;
    window.renderNotificationsUI = renderNotificationsUI;
    window.markAllNotificationsRead = markAllNotificationsRead;
    window.dismissNotification = dismissNotification;
    window.SoranixAudio = SoranixAudio;
    // Admin & Owner Controls
    window.openAdminTab = openAdminTab;
    window.closeAdminAccessDeniedModal = closeAdminAccessDeniedModal;
    window.quickLoginAsOwner = quickLoginAsOwner;
    window.renderAnnouncementBannerUI = renderAnnouncementBannerUI;
    window.dismissAnnouncementBanner = dismissAnnouncementBanner;
    window.updateMaintenanceGuardUI = updateMaintenanceGuardUI;
    window.checkMaintenanceBypass = checkMaintenanceBypass;
    window.bypassMaintenanceAsAdmin = bypassMaintenanceAsAdmin;
    window.switchAdminSubTab = switchAdminSubTab;
    window.renderAdminDashboard = renderAdminDashboard;
    window.renderAdminUsersList = renderAdminUsersList;
    window.filterAdminUsersStatus = filterAdminUsersStatus;
    window.adminToggleBanUser = adminToggleBanUser;
    window.adminMuteUser = adminMuteUser;
    window.adminUnmuteUser = adminUnmuteUser;
    window.adminSelectUserForEditor = adminSelectUserForEditor;
    window.initAdminCurrencyEditor = initAdminCurrencyEditor;
    window.handleAdminEditorUserChange = handleAdminEditorUserChange;
    window.loadCurrentUserIntoEditor = loadCurrentUserIntoEditor;
    window.renderAdminEditorTargetCard = renderAdminEditorTargetCard;
    window.adminModifyCoins = adminModifyCoins;
    window.adminOverrideLevel = adminOverrideLevel;
    window.adminAddXP = adminAddXP;
    window.adminGrantSelectedItem = adminGrantSelectedItem;
    window.initAdminBroadcastsUI = initAdminBroadcastsUI;
    window.adminPublishAnnouncement = adminPublishAnnouncement;
    window.adminClearAnnouncement = adminClearAnnouncement;
    window.adminSendChatBroadcast = adminSendChatBroadcast;
    window.initAdminPlatformUI = initAdminPlatformUI;
    window.adminToggleMaintenanceMode = adminToggleMaintenanceMode;
    window.adminSetMultiplier = adminSetMultiplier;
    window.adminPurgeGlobalChat = adminPurgeGlobalChat;
    window.handleStaffRolePresetChange = handleStaffRolePresetChange;
    window.adminAssignStaffRole = adminAssignStaffRole;
    // Anime Catalog & Player
    window.fetchAniListCatalog = fetchAniListCatalog;
    window.renderAnimeGrid = renderAnimeGrid;
    window.handleAnimeCatalogSearchInput = handleAnimeCatalogSearchInput;
    window.clearAnimeCatalogSearch = clearAnimeCatalogSearch;
    window.setAnimeCatalogCategory = setAnimeCatalogCategory;
    window.setAnimeCatalogGenre = setAnimeCatalogGenre;
    window.refreshAnimeCatalog = refreshAnimeCatalog;
    window.openAnimeDetailModal = openAnimeDetailModal;
    window.closeAnimeDetailModal = closeAnimeDetailModal;
    window.launchAnimePlayerFromDetail = launchAnimePlayerFromDetail;
    window.copyShareAnimeLink = copyShareAnimeLink;
    window.toggleFavoriteFromDetail = toggleFavoriteFromDetail;
    window.launchAnimePlayer = launchAnimePlayer;
    window.closeAnimePlayerModal = closeAnimePlayerModal;
    window.toggleVideoPlayback = toggleVideoPlayback;
    window.handleVideoSeek = handleVideoSeek;
    window.seekVideoRelative = seekVideoRelative;
    window.skipAnimeIntro = skipAnimeIntro;
    window.playPreviousEpisode = playPreviousEpisode;
    window.playNextEpisode = playNextEpisode;
    window.selectPlayerEpisode = selectPlayerEpisode;
    window.toggleVideoMute = toggleVideoMute;
    window.setVideoVolume = setVideoVolume;
    window.setPlayerQuality = setPlayerQuality;
    window.setPlayerTrack = setPlayerTrack;
    window.togglePlayerBrowserFullscreen = togglePlayerBrowserFullscreen;
    window.playFeaturedHeroAnime = playFeaturedHeroAnime;
    window.openFeaturedHeroAnimeDetail = openFeaturedHeroAnimeDetail;
    window.toggleFeaturedHeroFavorite = toggleFeaturedHeroFavorite;
    window.getFavoritesList = getFavoritesList;
    window.saveFavoritesList = saveFavoritesList;
    window.isAnimeFavorited = isAnimeFavorited;
    window.toggleFavoriteAnime = toggleFavoriteAnime;
    window.renderFavoritesUI = renderFavoritesUI;
    window.toggleDashboardThemeMenu = toggleDashboardThemeMenu;
    window.closeDashboardThemeMenu = closeDashboardThemeMenu;
  