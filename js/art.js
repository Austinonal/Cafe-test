/* Café Mood — generated illustrations (no photo assets needed for the prototype).
   Swap coverArt() for <img src={cafe.photoUrl}> once real photos exist. */
(function () {
  window.CM = window.CM || {};
  let uid = 0;
  const nid = (p) => p + '-' + (++uid);

  const MOTIFS = {
    nature: '<g fill="#fff" opacity=".16"><ellipse cx="60" cy="190" rx="26" ry="78" transform="rotate(-28 60 190)"/><ellipse cx="120" cy="215" rx="22" ry="64" transform="rotate(14 120 215)"/><ellipse cx="335" cy="60" rx="24" ry="70" transform="rotate(32 335 60)"/><ellipse cx="380" cy="120" rx="18" ry="52" transform="rotate(-18 380 120)"/></g>',
    dark: '<g fill="#fff" opacity=".16"><path d="M310 40a54 54 0 1 0 54 70 44 44 0 1 1-54-70z"/></g><g fill="#fff" opacity=".35"><circle cx="70" cy="50" r="2.4"/><circle cx="130" cy="95" r="1.8"/><circle cx="240" cy="40" r="2"/><circle cx="52" cy="140" r="1.6"/><circle cx="200" cy="170" r="1.8"/></g>',
    bright: '<g fill="#fff"><circle cx="320" cy="70" r="46" opacity=".22"/><circle cx="320" cy="70" r="78" opacity=".12"/><circle cx="320" cy="70" r="116" opacity=".08"/></g>',
    urban: '<g fill="#fff" opacity=".14"><rect x="20" y="120" width="44" height="130"/><rect x="74" y="80" width="52" height="170"/><rect x="136" y="140" width="38" height="110"/><rect x="250" y="100" width="48" height="150"/><rect x="308" y="150" width="60" height="100"/></g>',
    creative: '<g fill="#fff"><circle cx="90" cy="70" r="44" opacity=".16"/><circle cx="150" cy="110" r="38" opacity=".13"/><circle cx="320" cy="150" r="56" opacity=".13"/><circle cx="360" cy="60" r="26" opacity=".18"/></g>',
    coffee: '<g fill="none" stroke="#fff" opacity=".2" stroke-width="3"><circle cx="310" cy="90" r="30"/><circle cx="310" cy="90" r="54"/><circle cx="310" cy="90" r="80"/><circle cx="310" cy="90" r="108"/></g>',
    cozy: '<g fill="none" stroke="#fff" opacity=".2" stroke-width="3"><rect x="236" y="30" width="130" height="150" rx="8"/><path d="M301 30v150M236 105h130"/></g>',
    social: '<g fill="#fff"><circle cx="110" cy="100" r="50" opacity=".14"/><circle cx="180" cy="100" r="50" opacity=".14"/><circle cx="145" cy="150" r="50" opacity=".14"/></g>'
  };

  function dominant(c) {
    const keys = ['nature', 'dark', 'bright', 'urban', 'creative', 'coffee', 'cozy', 'social'];
    let best = 'cozy', bv = -1;
    keys.forEach((k) => { if (c.attr[k] > bv) { bv = c.attr[k]; best = k; } });
    return best;
  }

  function coverArt(cafe, cls) {
    if (cafe.banner) return '<img class="cover ' + (cls || '') + '" src="' + cafe.banner + '" alt="" style="object-fit:cover">';   // owner-uploaded banner (Café Studio)
    const g = nid('cg');
    const [c1, c2] = cafe.palette;
    return '<svg class="cover ' + (cls || '') + '" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="400" height="240" fill="url(#' + g + ')"/>' + MOTIFS[dominant(cafe)] + '</svg>';
  }

  function drinkArt(drink) {
    if (drink.photo) return '<img class="drink-art photo" src="' + escT(drink.photo) + '" alt="" loading="lazy">';   // photo uploaded by the owner
    const g = nid('dg');
    const [c1, c2] = drink.colors;
    const steam = '<g class="steam" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".45">' +
      '<path d="M44 40q-7-9 0-18t0-18"/><path d="M60 42q-7-9 0-18t0-18"/><path d="M76 40q-7-9 0-18t0-18"/></g>';
    if (drink.temp === 'iced') {
      return '<svg class="drink-art" viewBox="0 0 120 150" aria-hidden="true" focusable="false">' +
        '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
        '<path d="M70 6 62 70" stroke="#EFE5D6" stroke-width="6" stroke-linecap="round"/>' +
        '<path d="M28 34h64l-7 100q-1 8-9 8H44q-8 0-9-8z" fill="#fff" opacity=".28"/>' +
        '<path d="M31 56h58l-5 78q-1 8-9 8H45q-8 0-9-8z" fill="url(#' + g + ')"/>' +
        '<rect x="42" y="50" width="22" height="22" rx="5" fill="#fff" opacity=".55" transform="rotate(-14 53 61)"/>' +
        '<rect x="62" y="60" width="20" height="20" rx="5" fill="#fff" opacity=".4" transform="rotate(12 72 70)"/>' +
        '<path d="M28 34h64l-7 100q-1 8-9 8H44q-8 0-9-8z" fill="none" stroke="#fff" stroke-width="2.5" opacity=".7"/></svg>';
    }
    return '<svg class="drink-art" viewBox="0 0 120 150" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      steam +
      '<ellipse cx="60" cy="132" rx="46" ry="9" fill="#000" opacity=".12"/>' +
      '<path d="M84 74h10q12 0 12 13t-12 13H82" fill="none" stroke="#F4EADB" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M22 64h66v26q0 36-33 36T22 90z" fill="#F4EADB"/>' +
      '<ellipse cx="55" cy="64" rx="33" ry="8" fill="url(#' + g + ')"/>' +
      '<path d="M55 61c-6-5-9-2-6 1l6 5 6-5c3-3 0-6-6-1z" fill="#fff" opacity=".55"/>' +
      '</svg>';
  }

  const escT = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Passport stamp for a café. rot = deterministic tilt. cafe.pass = the owner's design { label, color, shape, icon } (Café Studio).
  const SHAPES = {
    circle: ['<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3"/>', '<circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 4"/>'],
    square: ['<rect x="6" y="6" width="88" height="88" rx="18" fill="none" stroke="currentColor" stroke-width="3"/>', '<rect x="14" y="14" width="72" height="72" rx="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 4"/>'],
    hex: ['<polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>', '<polygon points="50,14 81,32 81,68 50,86 19,68 19,32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 4" stroke-linejoin="round"/>']
  };
  function stamp(cafe, opts) {
    opts = opts || {};
    const d = cafe.pass || {};
    const col = opts.locked ? 'currentColor' : (d.color || cafe.palette[0]);
    const label = String(d.label || '').trim();
    const initials = label || cafe.name.replace(/[^A-Za-z฀-๿ ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const rot = Math.round((CM.engine.hash(cafe.id) - .5) * 24);
    const ring = SHAPES[d.shape] || SHAPES.circle;
    const fs = initials.length <= 3 ? 26 : initials.length <= 5 ? 19 : 14;
    let mid;
    if (opts.locked) mid = '<path d="M38 56v-6a12 12 0 0 1 24 0v6M34 56h32v20H34z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>';
    else if (d.icon) mid = '<g transform="translate(' + (label ? 35 : 30) + ' ' + (label ? 20 : 28) + ')">' + CM.icon(d.icon, label ? 30 : 40) + '</g>' + (label ? '<text x="50" y="76" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="' + (fs > 19 ? 15 : 13) + '" fill="currentColor">' + escT(label) + '</text>' : '');
    else mid = '<text x="50" y="58" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="' + fs + '" fill="currentColor">' + escT(initials) + '</text><path d="M26 72h48" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M30 32h40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    return '<svg class="stamp' + (opts.locked ? ' locked' : '') + '" viewBox="0 0 100 100" style="color:' + escT(col) + ';transform:rotate(' + rot + 'deg)" aria-hidden="true" focusable="false">' + ring[0] + ring[1] + mid + '</svg>';
  }

  /* ---- café logo: an uploaded image, or a ready-made pattern the owner customises { tpl, c1, c2, text } ---- */
  const PATTERNS = {
    stripe: (c) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => '<rect x="' + (i * 22 - 50) + '" y="-30" width="9" height="170" fill="' + c + '" transform="rotate(35 50 50)"/>').join(''),
    dots: (c) => [0, 1, 2, 3, 4].map((i) => [0, 1, 2, 3, 4].map((j) => '<circle cx="' + (10 + i * 20) + '" cy="' + (10 + j * 20) + '" r="4.5" fill="' + c + '"/>').join('')).join(''),
    wave: (c) => [22, 42, 62, 82].map((y) => '<path d="M-5 ' + y + ' Q20 ' + (y - 12) + ' 45 ' + y + ' T95 ' + y + ' T145 ' + y + '" fill="none" stroke="' + c + '" stroke-width="5" stroke-linecap="round"/>').join(''),
    bean: (c) => [[25, 28, -30], [72, 34, 25], [30, 74, 20], [76, 76, -35]].map((b) => '<g transform="translate(' + b[0] + ' ' + b[1] + ') rotate(' + b[2] + ')"><ellipse rx="13" ry="18" fill="' + c + '"/><path d="M0 -17Q-6 0 0 17" stroke="rgba(0,0,0,.35)" stroke-width="2.5" fill="none"/></g>').join(''),
    grid: (c) => [0, 1, 2, 3, 4].map((i) => [0, 1, 2, 3, 4].map((j) => ((i + j) % 2 ? '' : '<rect x="' + i * 20 + '" y="' + j * 20 + '" width="20" height="20" fill="' + c + '"/>')).join('')).join(''),
    sun: (c) => Array.from({ length: 12 }, (_, i) => '<line x1="50" y1="50" x2="' + (50 + 80 * Math.cos(i * Math.PI / 6)) + '" y2="' + (50 + 80 * Math.sin(i * Math.PI / 6)) + '" stroke="' + c + '" stroke-width="7"/>').join('') + '<circle cx="50" cy="50" r="16" fill="' + c + '"/>'
  };
  const hexOk = (c) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#5B3A22');
  function logoFromT(t, cls) {
    const id = nid('lg'), c1 = hexOk(t.c1), c2 = hexOk(t.c2), text = String(t.text || '').trim().slice(0, 3), pat = (PATTERNS[t.tpl] || PATTERNS.stripe)(c2);
    return '<svg class="logo ' + (cls || '') + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><defs><clipPath id="' + id + '"><rect width="100" height="100" rx="24"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + ')"><rect width="100" height="100" fill="' + c1 + '"/><g opacity=".5">' + pat + '</g></g>' +
      (text ? '<text x="50" y="62" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="' + (text.length > 2 ? 30 : 38) + '" fill="#fff" stroke="' + c1 + '" stroke-width="5" paint-order="stroke">' + escT(text) + '</text>' : '') + '</svg>';
  }
  const logoArt = (cafe, cls) => (cafe.logo ? '<img class="logo ' + (cls || '') + '" src="' + escT(cafe.logo) + '" alt="">' : cafe.logoT ? logoFromT(cafe.logoT, cls) : '');

  CM.art = { coverArt, drinkArt, stamp, dominant, logoArt, logoFromT };
})();
