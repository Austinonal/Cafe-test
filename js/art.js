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
    const g = nid('cg');
    const [c1, c2] = cafe.palette;
    return '<svg class="cover ' + (cls || '') + '" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="400" height="240" fill="url(#' + g + ')"/>' + MOTIFS[dominant(cafe)] + '</svg>';
  }

  function drinkArt(drink) {
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

  // Passport stamp for a café. rot = deterministic tilt.
  function stamp(cafe, opts) {
    opts = opts || {};
    const col = opts.locked ? 'currentColor' : cafe.palette[0];
    const initials = cafe.name.replace(/[^A-Za-z฀-๿ ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const rot = Math.round((CM.engine.hash(cafe.id) - .5) * 24);
    return '<svg class="stamp' + (opts.locked ? ' locked' : '') + '" viewBox="0 0 100 100" style="color:' + col + ';transform:rotate(' + rot + 'deg)" aria-hidden="true" focusable="false">' +
      '<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 4"/>' +
      (opts.locked ? '' : '<text x="50" y="58" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="26" fill="currentColor">' + initials + '</text>') +
      (opts.locked ? '<path d="M38 56v-6a12 12 0 0 1 24 0v6M34 56h32v20H34z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' :
        '<path d="M26 72h48" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M30 32h40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') +
      '</svg>';
  }

  CM.art = { coverArt, drinkArt, stamp, dominant };
})();
