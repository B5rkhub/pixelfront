/* ════════════════════════════════════════════════════════════
   PIXELFRONT — Merkezi Yapılandırma
   Tüm ayarlanabilir değerler, kimlik bilgileri ve
   localStorage anahtarları buradan okunur.
   Oyun davranışını değiştirmek için yalnızca bu dosyayı düzenle.
════════════════════════════════════════════════════════════ */
const CONFIG = {

  supabase: {
    url: 'https://pwpnjjfeojebqzhduqsc.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cG5qamZlb2plYnF6aGR1cXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDY3OTAsImV4cCI6MjA5NzI4Mjc5MH0.KIeYbr1XsZyYcp4KHwpwLNH1mXalGJrfSqdCJDUH-lk',
  },

  map: {
    width:  4208,
    height: 2300,
  },

  game: {
    pixelStockpileLimit:       49,
    defaultPixelsPerBatch:      7,
    defaultCooldownMs:    3 * 60 * 1000,
    minPixelIntervalMs:         800,
    touchGuardMs:               500,
    maxActiveWars:                2,
    pixelEventRatePixels:         6,
    pixelEventCooldownMs:   60 * 1000,
  },

  ui: {
    popupDurationMs:    2800,
    warBadgeHideScale:   3.5,
  },

  storageKeys: {
    username:      'pv_uname',
    profileSelf:   'pv_profile',
    profile:       'pv_profile_',
    xp:            'pv_xp_',
    streak:        'pv_streak_',
    cooldown:      'pv_cd_',
    pixels:        'pv_px_',
    factions:      'pv_factions',
    myFaction:     'pv_my_faction_',
    factionChat:   'pv_fc_chat_',
    chat:          'pv_chat',
    mailbox:       'pv_mails_',
    allyInvites:   'pv_ally_invites',
    settings:      'pv_settings',
    tutorialSeen:  'pv_tutorial_seen',
    pixelEventEnd: 'pv_pixel_event_end',
    rippleLog:     'pv_ripple_log',
    timelapseDay:  'pv_timelapse_day',
    warOverlay:    'pv_war_overlay',
    quests:        'pv_quests_',
    lang:          'pv_lang',
    sfxMuted:      'pv_sfx_muted',
    themeColor:    'pv_theme_color',
    colorMode:     'pv_color_mode',
  },

};
