/* Café Mood — static content: moods, quiz, archetypes, achievements, demo cafés.
   All cafés are FICTIONAL demo data (names, ratings, review counts). Swap `CAFES`
   for a real source (Google Places / own backend) later — the engine only reads the shape below. */
(function () {
  window.CM = window.CM || {};

  // Café attributes are scored 0–10 on these dimensions.
  const DIMS = ['quiet', 'cozy', 'bright', 'nature', 'urban', 'dark', 'photo', 'coffee',
    'social', 'work', 'creative', 'outdoor', 'window', 'small', 'crowd'];

  const DEMO_CENTER = { lat: 13.7466, lon: 100.5347, name: 'กรุงเทพฯ (พื้นที่ตัวอย่าง)' };

  /* ---------- Moods ---------- */
  const MOODS = [
    { id: 'relax',    en: 'Relax',          th: 'ผ่อนคลาย',     icon: 'wind',    hue: '#5E9C86', adj: 'Soft' },
    { id: 'focus',    en: 'Focus',          th: 'โฟกัสงาน', icon: 'target',  hue: '#4F7CB0', adj: 'Focused' },
    { id: 'creative', en: 'Creative',       th: 'ปลุกไอเดีย',   icon: 'palette', hue: '#C0638E', adj: 'Inspired' },
    { id: 'alone',    en: 'Alone',          th: 'ไปคนเดียว',    icon: 'user',    hue: '#7E6BB5', adj: 'Quiet' },
    { id: 'social',   en: 'Social',         th: 'เจอเพื่อน',    icon: 'users',   hue: '#D2833A', adj: 'Social' },
    { id: 'cozy',     en: 'Cozy',           th: 'อบอุ่นชวนซุก', icon: 'flame',   hue: '#C65B3A', adj: 'Cozy' },
    { id: 'photo',    en: 'Take Photos',    th: 'ถ่ายรูป',      icon: 'camera',  hue: '#3E9AA6', adj: 'Photogenic' },
    { id: 'coffee',   en: 'Coffee Hunting', th: 'ตามหากาแฟ',    icon: 'coffee',  hue: '#8A5A36', adj: 'Caffeinated' }
  ];

  const SHORT = { relax: ['Relax', 'ผ่อนคลาย'], focus: ['Focus', 'โฟกัส'], creative: ['Creative', 'ไอเดีย'], alone: ['Alone', 'คนเดียว'],
    social: ['Social', 'เจอเพื่อน'], cozy: ['Cozy', 'อบอุ่น'], photo: ['Photo', 'ถ่ายรูป'], coffee: ['Coffee', 'กาแฟ'] };
  MOODS.forEach((m) => { m.short = SHORT[m.id][0]; m.thShort = SHORT[m.id][1]; });

  // How strongly each mood wants each café dimension (negative = wants less of it).
  const MOOD_W = {
    relax:    { quiet: .8, cozy: .6, nature: .4, crowd: -.6, small: .2 },
    focus:    { work: 1, quiet: .9, crowd: -.6, bright: .2 },
    creative: { creative: 1, bright: .3, urban: .3, photo: .2, social: .1 },
    alone:    { quiet: .8, small: .5, window: .4, crowd: -.7, work: .2 },
    social:   { social: 1, crowd: .2, outdoor: .2, small: -.3 },
    cozy:     { cozy: 1, window: .3, dark: .3, quiet: .3, small: .3 },
    photo:    { photo: 1, bright: .4, nature: .3, urban: .2 },
    coffee:   { coffee: 1, small: .15 }
  };

  // Free-text understanding (stand-in for an LLM — same output shape: moods / boosts / hints).
  const KEYWORDS = [
    { label: 'ผ่อนคลาย', k: ['ผ่อนคลาย', 'พักผ่อน', 'ชิล', 'สบาย', 'สงบ', 'chill', 'relax', 'slow'], moods: ['relax'] },
    { label: 'โฟกัส / อ่านหนังสือ', k: ['อ่านหนังสือ', 'ทำงาน', 'ติว', 'โฟกัส', 'สอบ', 'รายงาน', 'โปรเจกต์', 'โปรเจค', 'เขียนโค้ด', 'โน้ตบุ๊ก', 'work', 'study', 'read', 'focus', 'code', 'laptop'], moods: ['focus'] },
    { label: 'ปลุกไอเดีย', k: ['ไอเดีย', 'วาด', 'ออกแบบ', 'สร้างสรรค์', 'แรงบันดาลใจ', 'creative', 'sketch', 'design', 'draw'], moods: ['creative'] },
    { label: 'ไปคนเดียว', k: ['คนเดียว', 'เดี่ยว', 'ส่วนตัว', 'solo', 'alone'], moods: ['alone'] },
    { label: 'เจอเพื่อน / คนสำคัญ', k: ['เพื่อน', 'แฟน', 'นัด', 'เจอ', 'คุยกัน', 'กลุ่ม', 'เดต', 'friends', 'date', 'group'], moods: ['social'] },
    { label: 'อบอุ่น', k: ['อบอุ่น', 'หนาว', 'โซฟา', 'ขี้เกียจ', 'อุ่น ๆ', 'อุ่นๆ', 'cozy'], moods: ['cozy'] },
    { label: 'ถ่ายรูป', k: ['ถ่ายรูป', 'ถ่ายภาพ', 'ฟิล์ม', 'ไอจี', 'ถ่ายคลิป', 'มุมสวย', 'ลงรูป', 'instagram', 'photo'], moods: ['photo'] },
    { label: 'ตามหากาแฟ', k: ['กาแฟ', 'เอสเปรสโซ', 'ลาเต้', 'บาริสต้า', 'เมล็ด', 'สเปเชียลตี้', 'coffee', 'espresso', 'latte', 'specialty', 'single origin'], moods: ['coffee'] },
    { label: 'ร้านเงียบ', k: ['เงียบ', 'ไม่วุ่นวาย', 'quiet', 'peaceful'], boosts: { quiet: .7, crowd: -.5 } },
    { label: 'ธรรมชาติ', k: ['ต้นไม้', 'สวน', 'ธรรมชาติ', 'สีเขียว', 'nature', 'garden', 'plants'], boosts: { nature: .8 } },
    { label: 'แสงธรรมชาติ', k: ['แสงธรรมชาติ', 'แดดดี', 'สว่าง', 'โปร่ง', 'sunlight', 'bright'], boosts: { bright: .7 } },
    { label: 'ยามค่ำ', k: ['ดึก', 'กลางคืน', 'มืด ๆ', 'มืดๆ', 'night', 'late'], boosts: { dark: .7 }, night: true },
    { label: 'บรรยากาศดี', k: ['บรรยากาศดี', 'บรรยากาศ', 'vibe', 'อินดี้'], boosts: { cozy: .4 } },
    { label: 'ร้านลับ', k: ['ร้านลับ', 'ลับ ๆ', 'ลับๆ', 'ไม่มีใครรู้', 'hidden', 'ร้านเล็ก'], hidden: true, boosts: { small: .4 } },
    { label: 'มัทฉะ', k: ['มัทฉะ', 'ชาเขียว', 'matcha'], drink: 'matcha' }
  ];
  const BOOST_ADJ = { quiet: 'Quiet', nature: 'Natural', bright: 'Bright', dark: 'Moody', cozy: 'Cozy', small: 'Intimate' };
  const WEATHER_ADJ = { rain: 'Cozy', sunny: 'Bright', cloudy: 'Calm', hot: 'Cool', night: 'Moody' };

  /* ---------- Café Personality quiz ---------- */
  // fx = how the answer shifts a preference dimension. drink / hidden / weather = side-channel prefs.
  const QUIZ = [
    { q: 'คุณชอบคาเฟ่แบบไหน?', hint: 'เลือกอันที่ใช่ที่สุด', options: [
      { t: 'Nature', s: 'ต้นไม้ สวน ธรรมชาติ', icon: 'leaf', fx: { nature: 2, outdoor: 1, urban: -1 } },
      { t: 'Urban', s: 'ไวบ์เมือง คอนกรีต นีออน', icon: 'building', fx: { urban: 2, creative: 1, nature: -1 } },
      { t: 'Dark', s: 'โทนมืด ไฟอุ่น มูดดี้', icon: 'moon', fx: { dark: 2, cozy: 1, bright: -1 } },
      { t: 'Bright', s: 'สว่าง โปร่ง แสงเต็มร้าน', icon: 'sun', fx: { bright: 2, photo: 1, dark: -1 } } ] },
    { q: 'ไปคาเฟ่เพราะอะไร?', hint: 'เหตุผลหลักที่คุณไป', options: [
      { t: 'Coffee', s: 'อยากกินกาแฟดี ๆ', icon: 'coffee', fx: { coffee: 2 } },
      { t: 'Photo', s: 'อยากได้รูปสวย', icon: 'camera', fx: { photo: 2, bright: 1 } },
      { t: 'Study', s: 'อ่านหนังสือ ทำงาน', icon: 'book', fx: { work: 2, quiet: 1 } },
      { t: 'Relax', s: 'นั่งพักให้ใจฟู', icon: 'wind', fx: { cozy: 1, quiet: 1, crowd: -1 } } ] },
    { q: 'ขนาดร้านที่ชอบ?', hint: '', options: [
      { t: 'เล็ก ๆ เป็นกันเอง', s: 'ไม่เกิน ~15 ที่นั่ง', fx: { small: 2, cozy: 1 } },
      { t: 'กำลังดี', s: 'ไม่เล็กไม่ใหญ่', fx: {} },
      { t: 'ใหญ่ โปร่ง โล่ง', s: 'พื้นที่เยอะ เดินเล่นได้', fx: { small: -2, bright: 1, social: 1 } } ] },
    { q: 'คนในร้านแบบไหนกำลังดี?', hint: '', options: [
      { t: 'เงียบ ๆ ไม่ค่อยมีคน', s: 'ได้ยินเสียงตัวเองคิด', fx: { quiet: 2, crowd: -2 } },
      { t: 'พอมีบรรยากาศ', s: 'มีเสียงคุยเบา ๆ', fx: {} },
      { t: 'คึกคัก มีชีวิตชีวา', s: 'ยิ่งคนเยอะยิ่งมันส์', fx: { crowd: 2, social: 1, quiet: -2 } } ] },
    { q: 'ปกติไปกับใคร?', hint: '', options: [
      { t: 'ไปคนเดียว', s: 'เวลาของตัวเอง', fx: { quiet: 1, small: 1, work: 1, social: -1 } },
      { t: 'กับเพื่อน', s: 'นั่งคุยยาว ๆ', fx: { social: 2 } },
      { t: 'กับคนสำคัญ', s: 'บรรยากาศดี ๆ สำหรับสองคน', fx: { cozy: 1, photo: 1, quiet: 1 } },
      { t: 'ได้หมด', s: 'แล้วแต่วัน', fx: {} } ] },
    { q: 'ที่นั่งโปรดคือ?', hint: '', options: [
      { t: 'ริมหน้าต่าง', s: 'มองคนผ่านไปมา', icon: 'window', fx: { window: 2, bright: 1 } },
      { t: 'โซฟานุ่ม ๆ', s: 'ซุกได้ทั้งบ่าย', icon: 'flame', fx: { cozy: 2 } },
      { t: 'กลางแจ้ง', s: 'ลมโชย ๆ ต้นไม้เขียว ๆ', icon: 'leaf', fx: { outdoor: 2, nature: 1 } },
      { t: 'บาร์กาแฟ', s: 'ดูบาริสต้าทำงาน', icon: 'coffee', fx: { coffee: 2, urban: 1 } } ] },
    { q: 'ชอบไปช่วงเวลาไหน?', hint: '', options: [
      { t: 'เช้า', s: 'ร้านเพิ่งเปิด เงียบ ๆ', fx: { bright: 1, quiet: 1 } },
      { t: 'บ่าย', s: 'แสงสวยที่สุด', fx: { bright: 1, photo: 1 } },
      { t: 'เย็น–ค่ำ', s: 'ไฟอุ่น ๆ เริ่มติด', fx: { dark: 1, cozy: 1 } } ] },
    { q: 'เครื่องดื่มที่เลือกบ่อยสุด?', hint: '', options: [
      { t: 'Specialty / Single origin', s: 'อยากรู้ที่มาของเมล็ด', icon: 'coffee', fx: { coffee: 2 }, drink: 'coffee' },
      { t: 'ลาเต้ / คาปูชิโน่ นุ่ม ๆ', s: 'นมละมุน หวานน้อย', icon: 'cup', fx: { cozy: 1 }, drink: 'latte' },
      { t: 'มัทฉะ / ชา', s: 'เบา สะอาด หอม', icon: 'leaf', fx: { nature: 1, small: 1 }, drink: 'matcha' },
      { t: 'เมนูซิกเนเจอร์', s: 'อยากลองของแปลก', icon: 'sparkles', fx: { creative: 2 }, drink: 'signature' } ] },
    { q: 'ร้านดัง หรือ ร้านลับ?', hint: '', options: [
      { t: 'ร้านดัง รีวิวเยอะ', s: 'มั่นใจว่าไม่พลาด', fx: { crowd: 1, social: 1 }, hidden: 0 },
      { t: 'ผสมกัน', s: 'ดูจากวัน', fx: {}, hidden: .5 },
      { t: 'ร้านลับ ไม่ค่อยมีใครรู้', s: 'ชอบความรู้สึกได้ค้นพบ', fx: { crowd: -1, small: 1 }, hidden: 1 } ] },
    { q: 'อากาศแบบไหนที่อยากนั่งคาเฟ่ที่สุด?', hint: '', options: [
      { t: 'ฝนตกปรอย ๆ', s: 'ฟังเสียงฝน ถือแก้วอุ่น ๆ', icon: 'cloud-rain', fx: { cozy: 1, window: 1 }, weather: 'rain' },
      { t: 'แดดดี ฟ้าใส', s: 'แสงสวย อากาศโปร่ง', icon: 'sun', fx: { outdoor: 1, bright: 1 }, weather: 'sunny' },
      { t: 'ครึ้ม ๆ เย็นสบาย', s: 'ไม่ร้อน ไม่เปียก', icon: 'cloud', fx: { nature: 1 }, weather: 'cloudy' },
      { t: 'ไม่เกี่ยง', s: 'ขอแค่มีคาเฟ่', fx: {} } ] }
  ];

  const ARCHETYPES = [
    { id: 'quiet-explorer', name: 'The Quiet Explorer', th: 'นักสำรวจผู้เงียบสงบ', icon: 'compass', hue: '#5E8C7B',
      w: { quiet: 2, small: 1.5, crowd: -1.5, nature: .5, window: .3 }, hid: 1.6,
      blurb: 'ชอบซอกเล็ก ๆ ที่ไม่มีใครรู้จัก นั่งนาน ๆ แล้วได้ค้นพบอะไรบางอย่างเสมอ' },
    { id: 'sunlit-wanderer', name: 'The Sunlit Wanderer', th: 'นักเดินทางใต้แสงแดด', icon: 'sun', hue: '#D39B2F',
      w: { bright: 2, outdoor: 1.5, nature: 1, photo: .5, window: .5 },
      blurb: 'ตามหาแสงสวย ลม และต้นไม้ — คาเฟ่ที่ดีคือคาเฟ่ที่เปิดรับวันใหม่' },
    { id: 'midnight-brewer', name: 'The Midnight Brewer', th: 'นักชงยามราตรี', icon: 'moon', hue: '#7A5C9E',
      w: { dark: 2, coffee: 1.5, cozy: .8, urban: .5, quiet: .3 },
      blurb: 'ไฟอุ่น เสียงเพลงเบา ๆ และกาแฟเข้ม ๆ คือสูตรของคืนที่ดี' },
    { id: 'frame-hunter', name: 'The Frame Hunter', th: 'นักล่าเฟรมสวย', icon: 'camera', hue: '#3E9AA6',
      w: { photo: 2, urban: 1, bright: 1, creative: .6, nature: .3 },
      blurb: 'มองทุกร้านเป็นฉาก — แสง มุม และแก้วที่วางถูกที่คือสิ่งที่คุณมองหา' },
    { id: 'social-butterfly', name: 'The Social Butterfly', th: 'ผีเสื้อสังคม', icon: 'users', hue: '#D2833A',
      w: { social: 2, crowd: 1.5, urban: .5, outdoor: .3 },
      blurb: 'คาเฟ่คือพื้นที่ของบทสนทนา ยิ่งมีชีวิตชีวายิ่งดี' },
    { id: 'bean-scholar', name: 'The Bean Scholar', th: 'ผู้ใฝ่รู้เรื่องเมล็ด', icon: 'coffee', hue: '#8A5A36',
      w: { coffee: 2, work: 1.5, quiet: 1, urban: .3 },
      blurb: 'กาแฟต้องมีเรื่องเล่า — ล็อตไหน แปรรูปแบบไหน และนั่งทำงานได้ยาว ๆ' },
    { id: 'dreamy-maker', name: 'The Dreamy Maker', th: 'นักสร้างฝัน', icon: 'palette', hue: '#C0638E',
      w: { creative: 2, cozy: 1, window: .5, bright: .4, work: .4 },
      blurb: 'สมุดสเก็ตช์ เครื่องดื่มสวย ๆ และมุมเล็ก ๆ ที่ไอเดียไหลได้เอง' }
  ];

  const LIKE_POS = {
    quiet: 'ร้านเงียบ', cozy: 'บรรยากาศอบอุ่น', bright: 'แสงธรรมชาติ', nature: 'ธรรมชาติและต้นไม้',
    urban: 'ไวบ์เมือง', dark: 'โทนมืดมูดดี้', photo: 'มุมถ่ายรูปสวย', coffee: 'Specialty coffee',
    social: 'ร้านนั่งคุยกับเพื่อน', work: 'ร้านนั่งทำงานได้', creative: 'งานอาร์ตและไอเดีย',
    outdoor: 'โซนกลางแจ้ง', window: 'ที่นั่งริมหน้าต่าง', small: 'ร้านเล็ก ๆ', crowd: 'ร้านคึกคัก'
  };
  const LIKE_NEG = { crowd: 'คนไม่เยอะ', small: 'ร้านกว้าง ๆ', bright: 'ร้านโทนมืด', urban: 'ไม่วุ่นวายแบบเมือง' };

  const DIM_TH = {
    quiet: 'ความเงียบ', cozy: 'ความอบอุ่น', bright: 'แสงธรรมชาติ', nature: 'ธรรมชาติ', urban: 'ไวบ์เมือง',
    dark: 'โทนมืด', photo: 'ถ่ายรูป', coffee: 'กาแฟ', social: 'เหมาะกับเพื่อน', work: 'นั่งทำงาน',
    creative: 'สร้างสรรค์', outdoor: 'กลางแจ้ง', window: 'ริมหน้าต่าง', small: 'ความเล็ก/ส่วนตัว', crowd: 'ความคึกคัก'
  };

  // Reason templates per dimension (shown as "why this café").
  const REASON_HI = {
    quiet: 'บรรยากาศเงียบ นั่งได้ยาว ๆ', cozy: 'อบอุ่น นั่งแล้วสบายใจ', bright: 'แสงธรรมชาติดีมาก',
    nature: 'รายล้อมด้วยต้นไม้และธรรมชาติ', photo: 'ถ่ายรูปสวยได้หลายมุม', coffee: 'กาแฟคุณภาพจริงจัง',
    social: 'นั่งคุยกับเพื่อนได้สบาย', work: 'โต๊ะ ปลั๊ก และความเงียบพร้อมสำหรับโฟกัส',
    creative: 'เต็มไปด้วยกลิ่นอายงานสร้างสรรค์', small: 'ร้านเล็ก เป็นกันเอง', window: 'ที่นั่งริมหน้าต่างเยอะ',
    dark: 'โทนมืด ไฟอุ่น ชวนดื่มด่ำ', urban: 'ไวบ์เมืองจัดเต็ม', outdoor: 'มีโซนกลางแจ้งให้นั่ง'
  };
  const REASON_LOW = { crowd: 'คนน้อย ไม่วุ่นวาย', small: 'พื้นที่กว้าง ไม่อึดอัด' };

  /* ---------- Cafés (fictional demo data) ---------- */
  const dr = (name, type, temp, price, note, colors) => ({ name, type, temp, price, note, colors });
  const sp = (name, best, light, bg, tip, outdoor) => ({ name, best, light, bg, tip, outdoor: !!outdoor });

  const RAW = [
    { id: 'ratri-slow-bar', name: 'Ratri Slow Bar', area: 'อารีย์', lat: 13.7795, lon: 100.5440, rating: 4.8, reviews: 86, repeat: .74, hours: [15, 25],
      palette: ['#241513', '#7A4630'],
      attr: { quiet: 8, cozy: 9, bright: 2, nature: 2, urban: 5, dark: 10, photo: 6, coffee: 9, social: 4, work: 5, creative: 5, outdoor: 0, window: 3, small: 8, crowd: 3 },
      tagline: 'บาร์กาแฟมืด ๆ เปิดดึก เสียงแจ๊สเบา ๆ',
      secret: 'ถามบาริสต้าถึง “แก้วลับของคืนนี้” — เมนูที่ไม่มีบนกระดาน เปลี่ยนทุกสัปดาห์',
      drinks: [
        dr('Burnt Honey Latte', 'latte', 'hot', 150, 'ลาเต้น้ำผึ้งไหม้ ๆ ของโปรดตอนดึก', ['#C98B4B', '#5B3A22']),
        dr('Midnight Espresso Tonic', 'coffee', 'iced', 140, 'เอสเปรสโซ่ผสมโทนิค สดชื่นสำหรับคนนอนไม่หลับ', ['#3A2418', '#D9A46A']),
        dr('Hojicha Smoke', 'tea', 'hot', 130, 'โฮจิฉะอบควัน หอมอุ่น', ['#8A5A32', '#4A2C1A'])],
      spots: [
        sp('ซุ้มไฟวอร์มหลังบาร์', '19:00–22:00', 2, 5, 'ลด exposure ลงนิดหน่อยจะได้โทนมูดดี้'),
        sp('เคาน์เตอร์ไม้ริมหน้าต่าง', '17:30–18:30', 3, 4, 'แสงตะวันตกดินส่องเงาแก้วบนเคาน์เตอร์')] },

    { id: 'moss-and-mist', name: 'Moss & Mist', area: 'ธนบุรี', lat: 13.7280, lon: 100.4870, rating: 4.7, reviews: 212, repeat: .55, hours: [9, 18],
      palette: ['#1F3B2D', '#6F9A72'],
      attr: { quiet: 8, cozy: 8, bright: 7, nature: 10, urban: 1, dark: 2, photo: 9, coffee: 6, social: 5, work: 4, creative: 5, outdoor: 5, window: 8, small: 5, crowd: 4 },
      tagline: 'เรือนกระจกกลางสวนเฟิร์น ฟังเสียงฝนบนหลังคา',
      secret: 'วันฝนตก โต๊ะริมกระจกจะได้ชาร้อนแก้วแรกฟรี — แค่บอกว่า “มาฟังฝน”',
      drinks: [
        dr('Fern Cold Brew', 'coffee', 'iced', 120, 'โคลด์บรูว์ใสสะอาด หอมใบเตย', ['#2F1E14', '#9C6B3D']),
        dr('Jasmine Rain Tea', 'tea', 'hot', 110, 'ชามะลิร้อน เสิร์ฟพร้อมคุกกี้ขิง', ['#C9B26B', '#8E7A3A']),
        dr('Pandan Latte', 'latte', 'hot', 130, 'ลาเต้ใบเตยหอมนุ่ม', ['#8DBB6A', '#E8E2C8'])],
      spots: [
        sp('ซุ้มเฟิร์นใต้หลังคากระจก', '10:00–12:00', 5, 5, 'แสงกรองผ่านใบเฟิร์น ถ่ายแนวตั้งสวยสุด'),
        sp('โต๊ะริมกระจกวันฝนตก', '14:00–17:00', 3, 5, 'โฟกัสแก้วชา ให้หยดฝนบนกระจกเบลอเป็นฉากหลัง')] },

    { id: 'atelier-nam-tan', name: 'Atelier Nam-Tan', area: 'เจริญกรุง', lat: 13.7230, lon: 100.5130, rating: 4.6, reviews: 340, repeat: .5, hours: [10, 20],
      palette: ['#B4561F', '#F0B66B'],
      attr: { quiet: 5, cozy: 5, bright: 7, nature: 2, urban: 7, dark: 2, photo: 8, coffee: 6, social: 6, work: 6, creative: 10, outdoor: 2, window: 6, small: 4, crowd: 5 },
      tagline: 'คาเฟ่–สตูดิโอ มีมุมวาดรูปและปลั๊กทุกที่นั่ง',
      secret: 'ชั้นลอยมีโต๊ะวาดรูปพร้อมสีน้ำให้ยืมฟรี ถ้าสั่งเครื่องดื่มก่อน 14:00',
      drinks: [
        dr('Watercolor Soda', 'signature', 'iced', 120, 'โซดาไล่สีสวยเหมือนสีน้ำ', ['#F2A0B8', '#7FB3E0']),
        dr('Charcoal Latte', 'latte', 'hot', 130, 'ลาเต้ชาร์โคลดำสนิท หวานน้อย', ['#4A4A4A', '#E8DCC8']),
        dr('Filter of the Week', 'coffee', 'hot', 110, 'กาแฟกรองเปลี่ยนล็อตทุกสัปดาห์', ['#6B4226', '#B98A5B'])],
      spots: [
        sp('ผนังสีน้ำแผ่นใหญ่', '11:00–14:00', 4, 5, 'ยืนห่างผนัง 2 เมตรให้เห็นเฉดสีทั้งหมด'),
        sp('ชั้นลอยโต๊ะวาดรูป', '14:00–16:00', 4, 4, 'ถ่ายแนว flat lay พร้อมสมุดสเก็ตช์')] },

    { id: 'sunroom-33', name: 'Sunroom 33', area: 'เอกมัย', lat: 13.7190, lon: 100.5850, rating: 4.5, reviews: 980, repeat: .35, hours: [8, 17.5],
      palette: ['#E0932B', '#F8DE9B'],
      attr: { quiet: 3, cozy: 4, bright: 10, nature: 4, urban: 5, dark: 0, photo: 10, coffee: 5, social: 8, work: 3, creative: 5, outdoor: 6, window: 9, small: 4, crowd: 8 },
      tagline: 'ห้องกระจกรับแดด ถ่ายรูปสวยที่สุดช่วงบ่าย',
      secret: 'มุมหน้าต่างบานโค้งแสงสวยสุดตอน 16:00 — มาก่อน 15:30 แล้วจองโต๊ะกับพนักงานได้',
      drinks: [
        dr('Orange Sunrise', 'signature', 'iced', 140, 'ส้มสดไล่เลเยอร์กับเอสเปรสโซ่', ['#F29A2E', '#5A3418']),
        dr('Coconut Cold Brew', 'coffee', 'iced', 130, 'โคลด์บรูว์น้ำมะพร้าว สดชื่น', ['#3B2A1E', '#EFE2C6']),
        dr('Honey Flat White', 'latte', 'hot', 120, 'แฟลตไวท์น้ำผึ้งป่า', ['#D9A55B', '#F4E7D0'])],
      spots: [
        sp('หน้าต่างบานโค้ง', '15:00–17:00', 5, 4, 'ถ่ายย้อนแสงให้เห็นไอระเหยจากแก้ว'),
        sp('ระเบียงกระถางต้นไม้', '09:00–11:00', 4, 4, 'แสงเช้านุ่ม เหมาะถ่ายภาพบุคคล', true),
        sp('ผนังโค้งสีครีม', '13:00–15:00', 4, 5, 'เหมาะกับโทนมินิมอล')] },

    { id: 'baan-mai-lek', name: 'บ้านไม้หลังเล็ก', area: 'พระโขนง', lat: 13.7150, lon: 100.5900, rating: 4.9, reviews: 31, repeat: .82, hours: [10, 17],
      palette: ['#6B4A2E', '#C8A27A'],
      attr: { quiet: 10, cozy: 10, bright: 5, nature: 6, urban: 1, dark: 4, photo: 6, coffee: 7, social: 3, work: 6, creative: 5, outdoor: 3, window: 7, small: 10, crowd: 1 },
      tagline: 'บ้านไม้เก่านั่งได้ 12 ที่ เจ้าของคั่วกาแฟเองหลังบ้าน',
      secret: 'ถามว่า “วันนี้คั่วล็อตอะไร” — เมล็ดที่เพิ่งคั่วเช้านี้จะมาอยู่ในแก้วคุณก่อนเที่ยง',
      drinks: [
        dr('Drip ล็อตวันนี้', 'coffee', 'hot', 110, 'กาแฟดริปจากเมล็ดที่เพิ่งคั่ว', ['#5B3A22', '#C79A68']),
        dr('Brown Sugar Oat Latte', 'latte', 'hot', 120, 'ลาเต้โอ๊ต น้ำตาลทรายแดงเคี่ยว', ['#B8814E', '#EEDFC4']),
        dr('ชาเมี่ยงอุ่น ๆ', 'tea', 'hot', 90, 'ชาเมี่ยงหอมควันไม้ เสิร์ฟกาน้ำเล็ก', ['#9B7B3F', '#6A4F22'])],
      spots: [
        sp('มุมหน้าต่างบานเกล็ด', '14:00–16:00', 5, 3, 'แสงลอดบานเกล็ดเป็นริ้ว ถ่ายแก้วกับสมุดโน้ต'),
        sp('ระเบียงไม้หลังบ้าน', '10:00–11:30', 4, 4, 'ใช้ฉากหลังเป็นต้นมะม่วงเก่า', true)] },

    { id: 'third-floor-roasters', name: 'Third Floor Roasters', area: 'สีลม', lat: 13.7280, lon: 100.5340, rating: 4.7, reviews: 640, repeat: .6, hours: [8, 19],
      palette: ['#26323D', '#8FA3B3'],
      attr: { quiet: 6, cozy: 5, bright: 6, nature: 1, urban: 9, dark: 3, photo: 5, coffee: 10, social: 5, work: 9, creative: 4, outdoor: 0, window: 5, small: 4, crowd: 6 },
      tagline: 'ห้องคั่วกระจกใสบนชั้น 3 สายกาแฟตัวจริง',
      secret: 'วันพฤหัสมี cupping session 16:00 ฟรี ไม่ต้องจอง นั่งฟังบาริสต้าเล่าที่มาของเมล็ด',
      drinks: [
        dr('Ethiopia Natural Pour Over', 'coffee', 'hot', 160, 'กลิ่นบลูเบอร์รี่ชัด แปรรูปแบบ natural', ['#5E2F28', '#C98A6B']),
        dr('Cascara Tonic', 'coffee', 'iced', 140, 'ชาจากเปลือกกาแฟ ซ่า เปรี้ยวหอม', ['#B5503C', '#F0C8A0']),
        dr('Flat White', 'latte', 'hot', 120, 'เนื้อนมแน่น ไมโครโฟมละเอียด', ['#C79A68', '#F3E6D2'])],
      spots: [
        sp('ห้องคั่วกระจกใส', '10:00–12:00', 4, 4, 'ถ่ายเครื่องคั่วเป็นฉากหลัง ใช้ f/2 ได้เลย'),
        sp('เคาน์เตอร์ steel bar', '16:00–18:00', 3, 4, 'สะท้อนแสงสวยตอนเย็น')] },

    { id: 'kuri-matcha-lab', name: 'Kuri Matcha Lab', area: 'ทองหล่อ', lat: 13.7310, lon: 100.5800, rating: 4.8, reviews: 120, repeat: .7, hours: [10, 19],
      palette: ['#4E6E3F', '#CFE3B6'],
      attr: { quiet: 7, cozy: 6, bright: 8, nature: 3, urban: 6, dark: 1, photo: 8, coffee: 4, social: 4, work: 3, creative: 6, outdoor: 1, window: 5, small: 8, crowd: 3 },
      tagline: 'แล็บมัทฉะมินิมอล ชงสดทีละแก้ว',
      secret: 'ถ้าสั่ง Usucha ให้ขอ “ชามเซรามิกใบเล็ก” — เป็นของช่างปั้นท้องถิ่น ซื้อกลับบ้านได้',
      drinks: [
        dr('Matcha Dirty', 'matcha', 'iced', 150, 'มัทฉะราดเอสเปรสโซ่ ไล่เลเยอร์สวย', ['#8DB255', '#3B2A1E']),
        dr('Ceremonial Usucha', 'matcha', 'hot', 160, 'ชงสดแบบพิธีชงชา ใช้แปรงไม้ไผ่', ['#6E9A3E', '#3F6B26']),
        dr('Hojicha Latte', 'tea', 'hot', 130, 'โฮจิฉะคั่วเข้ม นมโอ๊ต', ['#A56A3A', '#EAD6B8']),
        dr('Sakura Matcha Cloud', 'matcha', 'iced', 170, 'โฟมซากุระบนมัทฉะเย็น', ['#F3B8C8', '#7FA845'])],
      spots: [
        sp('ผนังมินิมอลสีไข่', '13:00–15:00', 5, 5, 'วางแก้วมัทฉะบนพื้นหลังเรียบ สีเขียวเด่นมาก'),
        sp('ชั้นวางถ้วยชา', '11:00–13:00', 4, 4, 'ถ่ายแนวนอน เห็นเซรามิกหลายใบ')] },

    { id: 'reading-porch', name: 'The Reading Porch', area: 'ตลิ่งชัน', lat: 13.7770, lon: 100.4580, rating: 4.7, reviews: 190, repeat: .66, hours: [9, 19],
      palette: ['#44574A', '#B6C6A6'],
      attr: { quiet: 9, cozy: 6, bright: 7, nature: 6, urban: 2, dark: 1, photo: 5, coffee: 6, social: 3, work: 8, creative: 5, outdoor: 6, window: 5, small: 6, crowd: 2 },
      tagline: 'ระเบียงอ่านหนังสือใต้ต้นลีลาวดี มีหนังสือให้ยืมนั่งอ่าน',
      secret: 'สมุด “ข้อความถึงคนนั่งโต๊ะนี้” วางอยู่ทุกโต๊ะ — คนแปลกหน้าฝากประโยคดี ๆ ไว้ให้',
      drinks: [
        dr('Chiang Mai Drip', 'coffee', 'hot', 100, 'ดริปเมล็ดจากเชียงใหม่ หอมถั่ว', ['#5B3A22', '#B98A5B']),
        dr('Lemongrass Iced Tea', 'tea', 'iced', 90, 'ชาตะไคร้เย็น สดชื่น', ['#D8C46A', '#7FA24A']),
        dr('Sea-Salt Mocha', 'latte', 'hot', 120, 'ช็อกโกแลตเข้ม เกลือทะเลนิด ๆ', ['#4A2C1A', '#C79A68'])],
      spots: [
        sp('ระเบียงชั้นหนังสือ', '15:00–17:00', 4, 5, 'ถ่ายหนังสือซ้อนกับแก้วกาแฟ', true),
        sp('โต๊ะอ่านใต้ต้นลีลาวดี', '09:00–11:00', 5, 4, 'ดอกไม้ร่วงบนโต๊ะ ได้ฉากสวยฟรี', true)] },

    { id: 'soi-zero', name: 'Soi Zero Coffee', area: 'บางรัก', lat: 13.7270, lon: 100.5220, rating: 4.9, reviews: 24, repeat: .85, hours: [7.5, 14],
      palette: ['#383838', '#B0A394'],
      attr: { quiet: 6, cozy: 6, bright: 4, nature: 1, urban: 6, dark: 3, photo: 4, coffee: 10, social: 3, work: 3, creative: 3, outdoor: 1, window: 3, small: 10, crowd: 4 },
      tagline: 'ร้าน 8 ที่นั่งในซอยตัน เสิร์ฟ single origin ล้วน ๆ',
      secret: 'ไม่มีเมนูชา ไม่มีนมโอ๊ต — เจ้าของจะเลือกกาแฟให้ตามอารมณ์วันนั้นถ้าคุณขอ “เลือกให้หน่อย”',
      drinks: [
        dr('Single Origin Espresso', 'coffee', 'hot', 90, 'ช็อตเดียว เปลี่ยนล็อตทุกสัปดาห์', ['#3B2418', '#A9733F']),
        dr('Washed Kenya Filter', 'coffee', 'hot', 120, 'กลิ่นแบล็กเคอร์แรนต์ ใสสะอาด', ['#6E2E32', '#C98A6B']),
        dr('Iced Americano (Lot 03)', 'coffee', 'iced', 80, 'อเมริกาโน่เย็นจากล็อตที่ 3', ['#2A1A12', '#8A6A4A'])],
      spots: [
        sp('เคาน์เตอร์ 8 ที่นั่ง', '08:00–10:00', 3, 3, 'ถ่ายมือบาริสต้ากับกาแฟ ควรขออนุญาตก่อน'),
        sp('ป้ายปากซอยตัน', '07:30–09:00', 4, 3, 'ฉากหลังกำแพงปูนเก่า', true)] },

    { id: 'plant-parlour', name: 'Plant Parlour', area: 'รัชดา', lat: 13.7650, lon: 100.5700, rating: 4.5, reviews: 760, repeat: .4, hours: [10, 21],
      palette: ['#2B6149', '#A3CF93'],
      attr: { quiet: 3, cozy: 6, bright: 7, nature: 10, urban: 3, dark: 1, photo: 9, coffee: 5, social: 8, work: 3, creative: 5, outdoor: 5, window: 5, small: 3, crowd: 7 },
      tagline: 'ป่าเขตร้อนจิ๋วกลางเมือง ถ่ายรูปได้ทุกมุม',
      secret: 'เรือนกระจกกลางร้านรดน้ำต้นไม้ทุกวัน 15:00 — ไอน้ำกับแสงเย็นคือเวลาถ่ายรูปที่ดีที่สุด',
      drinks: [
        dr('Fig Fizz', 'signature', 'iced', 140, 'มะเดื่อซ่า ๆ เปรี้ยวหวาน', ['#8E4A6B', '#F0D4DC']),
        dr('Basil Honey Latte', 'latte', 'hot', 140, 'ลาเต้โหระพาน้ำผึ้ง', ['#9BB86A', '#F0E2C0']),
        dr('Mango Cold Brew', 'coffee', 'iced', 130, 'โคลด์บรูว์ท็อปมะม่วงสุก', ['#F0B03A', '#3B2A1E'])],
      spots: [
        sp('กำแพงต้นไม้ 3 ชั้น', '10:00–12:00', 4, 5, 'ถ่ายกว้างให้เห็นความหนาแน่นของใบไม้'),
        sp('เรือนกระจกกลางร้าน', '14:00–16:00', 5, 5, 'แสงนุ่มสุดช่วงบ่าย'),
        sp('ชิงช้าไม้', '16:00–17:30', 4, 4, 'แสงเย็นสีทอง', true)] },

    { id: 'neon-alley', name: 'Neon Alley Café', area: 'เยาวราช', lat: 13.7410, lon: 100.5090, rating: 4.4, reviews: 530, repeat: .45, hours: [16, 26],
      palette: ['#2A1240', '#D8407A'],
      attr: { quiet: 1, cozy: 4, bright: 2, nature: 0, urban: 10, dark: 9, photo: 9, coffee: 5, social: 9, work: 2, creative: 7, outdoor: 2, window: 2, small: 3, crowd: 8 },
      tagline: 'คาเฟ่นีออนในซอยจีนเก่า เปิดถึงตี 2',
      secret: 'ป้ายนีออนตัวอักษรเปลี่ยนข้อความทุกวัน — ตั้งแต่ 20:00 เจ้าของจะเปลี่ยนเป็นประโยคจากลูกค้าที่ฝากไว้',
      drinks: [
        dr('Neon Spritz Cold Brew', 'coffee', 'iced', 160, 'โคลด์บรูว์ซ่าส้มเลือด', ['#D8407A', '#2A1A12']),
        dr('Lychee Rose Latte', 'latte', 'iced', 150, 'ลาเต้ลิ้นจี่กุหลาบ', ['#F2B6C8', '#EADBD0']),
        dr('Midnight Mocktail', 'signature', 'iced', 170, 'ม็อกเทลสีม่วงเรืองแสง', ['#6A3CB5', '#E2457A'])],
      spots: [
        sp('ป้ายนีออนตัวอักษร', '19:00–23:00', 1, 5, 'ถ่ายตอนไม่มีไฟอื่น เพิ่ม ISO เล็กน้อย'),
        sp('ซอยหลังร้านกราฟฟิตี้', '18:00–19:30', 2, 5, 'แสงสุดท้ายของวันผสมไฟนีออน', true)] },

    { id: 'baan-rim-khlong', name: 'บ้านริมคลอง', area: 'ตลิ่งชัน', lat: 13.7700, lon: 100.4500, rating: 4.8, reviews: 58, repeat: .78, hours: [9, 18],
      palette: ['#2C6A76', '#BDE0CF'],
      attr: { quiet: 8, cozy: 7, bright: 7, nature: 8, urban: 0, dark: 1, photo: 8, coffee: 5, social: 6, work: 3, creative: 4, outdoor: 9, window: 4, small: 5, crowd: 2 },
      tagline: 'ศาลาไม้ริมคลอง นั่งมองเรือหางยาวผ่านไป',
      secret: 'ถ้าเห็นเรือพ่อค้าแม่ค้าผ่านมา เจ้าของจะรับซื้อขนมให้เสิร์ฟคู่กาแฟ — ถามว่า “วันนี้มีขนมอะไรจากเรือ”',
      drinks: [
        dr('Coconut Palm Latte', 'latte', 'iced', 110, 'ลาเต้น้ำตาลมะพร้าว', ['#C2A27A', '#F2E6D0']),
        dr('Butterfly Pea Lemon', 'signature', 'iced', 90, 'อัญชันมะนาว เปลี่ยนสีได้ต่อหน้า', ['#5B58C9', '#E0A4D0']),
        dr('Khlong Drip', 'coffee', 'hot', 100, 'ดริปเมล็ดโปรยสด ๆ ริมน้ำ', ['#5B3A22', '#B98A5B'])],
      spots: [
        sp('ศาลาริมน้ำ', '16:00–17:30', 5, 5, 'แสงเย็นสะท้อนผิวน้ำ ถ่ายเงาแก้ว', true),
        sp('ท่าน้ำไม้เก่า', '09:00–10:30', 4, 5, 'ถ่ายเรือหางยาวผ่านด้านหลัง', true)] },

    { id: 'paper-and-pour', name: 'Paper & Pour', area: 'สยาม', lat: 13.7460, lon: 100.5330, rating: 4.6, reviews: 410, repeat: .5, hours: [9, 21],
      palette: ['#2F4468', '#C3D0E4'],
      attr: { quiet: 7, cozy: 5, bright: 8, nature: 2, urban: 7, dark: 1, photo: 5, coffee: 7, social: 4, work: 10, creative: 7, outdoor: 0, window: 7, small: 5, crowd: 5 },
      tagline: 'ร้านหนังสือที่มีกาแฟ — ปลั๊กเยอะที่สุดในย่านสยาม',
      secret: 'โซนชั้น 2 ปิดเสียงสนทนา (silent zone) ตั้งแต่ 13:00–17:00 — เหมาะกับคนต้องส่งงาน',
      drinks: [
        dr('Bookworm Latte', 'latte', 'hot', 120, 'ลาเต้ข้าวคั่ว หอมเหมือนกลิ่นกระดาษเก่า', ['#B98A5B', '#F0E0C4']),
        dr('Cold Brew Reserve', 'coffee', 'iced', 130, 'โคลด์บรูว์ 18 ชั่วโมง', ['#2A1A12', '#7B5A3E']),
        dr('Earl Grey Fog', 'tea', 'hot', 110, 'เอิร์ลเกรย์ฟองนมนุ่ม', ['#8E8AA8', '#EDE6D6'])],
      spots: [
        sp('ผนังชั้นหนังสือสูงจรดเพดาน', '12:00–15:00', 4, 5, 'ถ่ายจากมุมต่ำให้เห็นความสูง'),
        sp('บันไดอ่านหนังสือ', '15:00–17:00', 3, 4, 'วางแก้วบนขั้นบันได ได้ภาพ editorial')] },

    { id: 'dusk-society', name: 'Dusk Society', area: 'ทองหล่อ', lat: 13.7340, lon: 100.5790, rating: 4.5, reviews: 450, repeat: .5, hours: [17, 25],
      palette: ['#4B1E2F', '#D98A5C'],
      attr: { quiet: 3, cozy: 6, bright: 2, nature: 1, urban: 8, dark: 8, photo: 7, coffee: 6, social: 9, work: 3, creative: 6, outdoor: 4, window: 3, small: 4, crowd: 7 },
      tagline: 'คาเฟ่ยามเย็น บาร์ไฟอำพัน นัดเพื่อนหลังเลิกงาน',
      secret: 'ช่วง 17:00–18:00 (Golden Hour) กาแฟทุกแก้วแถมของว่างชิ้นเล็ก ถ้าโต๊ะมี 3 คนขึ้นไป',
      drinks: [
        dr('Smoked Maple Latte', 'latte', 'hot', 150, 'ลาเต้เมเปิลรมควัน', ['#A8693A', '#EAD6B8']),
        dr('Espresso Martini (0%)', 'coffee', 'iced', 170, 'ม็อกเทลเอสเปรสโซ่ ไม่มีแอลกอฮอล์', ['#2A1A12', '#C79A68']),
        dr('Orange Peel Americano', 'coffee', 'iced', 130, 'อเมริกาโน่ส้มเปลือกบาง ๆ', ['#E08A2C', '#2A1A12'])],
      spots: [
        sp('บาร์ไฟอำพัน', '18:00–21:00', 2, 5, 'ให้ไฟบาร์เป็น rim light'),
        sp('โซฟาเวลเวตสีไวน์', '17:00–19:00', 3, 4, 'สีวินเทจ เหมาะถ่ายคู่')] },

    { id: 'hinoki-corner', name: 'Hinoki Corner', area: 'พร้อมพงษ์', lat: 13.7300, lon: 100.5700, rating: 4.8, reviews: 95, repeat: .72, hours: [9.5, 18],
      palette: ['#8A6A48', '#EADBC2'],
      attr: { quiet: 9, cozy: 8, bright: 6, nature: 4, urban: 4, dark: 3, photo: 7, coffee: 8, social: 3, work: 6, creative: 5, outdoor: 0, window: 6, small: 9, crowd: 2 },
      tagline: 'มุมสไตล์ญี่ปุ่นหอมไม้ฮิโนกิ ที่นั่ง 14 ที่',
      secret: 'ทุกเช้าวันอังคารเจ้าของแจก “ชาข้าวคั่ว” อุ่นให้คนที่มาเป็นกลุ่มแรก 5 คน',
      drinks: [
        dr('Hinoki Latte', 'latte', 'hot', 140, 'ลาเต้หอมไม้ฮิโนกิ', ['#B59A6B', '#F2E6CF']),
        dr('Genmaicha Drip', 'tea', 'hot', 110, 'ชาข้าวคั่วดริป', ['#C9B26B', '#8E7A3A']),
        dr('Kinako Iced Latte', 'latte', 'iced', 130, 'ลาเต้ถั่วเหลืองคั่ว หวานมัน', ['#D9B98A', '#F4EADA'])],
      spots: [
        sp('ชั้นไม้ฮิโนกิ', '11:00–14:00', 4, 5, 'ถ่ายตรงหน้า ให้เส้นไม้เป็นฉาก'),
        sp('หน้าต่างบานเลื่อนชิจิ', '15:00–16:30', 5, 4, 'แสงนุ่มผ่านกระดาษ เหมาะถ่ายแบบฟิล์ม')] },

    { id: 'cloud-nine', name: 'Cloud Nine Bakery & Brew', area: 'สยาม', lat: 13.7450, lon: 100.5300, rating: 4.2, reviews: 2300, repeat: .25, hours: [8, 22],
      palette: ['#F0A3C0', '#FBE3EA'],
      attr: { quiet: 0, cozy: 4, bright: 8, nature: 1, urban: 7, dark: 0, photo: 8, coffee: 4, social: 9, work: 2, creative: 4, outdoor: 1, window: 4, small: 1, crowd: 10 },
      tagline: 'เบเกอรีสีพาสเทล คิวยาวแต่คุ้มรูป',
      secret: 'มาก่อน 10:00 วันธรรมดาจะไม่ต้องรอคิว และขนมอบใหม่เพิ่งออกจากเตา',
      drinks: [
        dr('Strawberry Cloud Latte', 'signature', 'iced', 160, 'ลาเต้สตรอว์เบอร์รี่ท็อปครีมเมฆ', ['#F2A3B8', '#FBEFEA']),
        dr('Croissant + Flat White Set', 'latte', 'hot', 190, 'ครัวซองต์เนยสด + แฟลตไวท์', ['#C79A68', '#F3E6D2']),
        dr('Vanilla Bean Frappe', 'signature', 'iced', 150, 'ปั่นวานิลลาบีน', ['#F0E0B8', '#C9A66B'])],
      spots: [
        sp('ผนังก้อนเมฆ', '10:00–12:00', 5, 5, 'ต้องต่อคิวถ่าย — มาเช้าจะได้ภาพคนน้อย'),
        sp('ตู้โชว์ขนมกระจก', '13:00–15:00', 4, 4, 'ถ่ายแนวใกล้ ๆ ให้เห็นผิวขนม')] },

    { id: 'tiger-bean', name: 'Tiger Bean Co.', area: 'สาทร', lat: 13.7190, lon: 100.5290, rating: 4.6, reviews: 1400, repeat: .5, hours: [7, 20],
      palette: ['#A85A18', '#F0C27D'],
      attr: { quiet: 4, cozy: 5, bright: 6, nature: 1, urban: 8, dark: 3, photo: 5, coffee: 9, social: 6, work: 7, creative: 4, outdoor: 1, window: 5, small: 3, crowd: 7 },
      tagline: 'ร้านกาแฟยอดนิยมของคนทำงานย่านสาทร',
      secret: 'โปรสะสมแต้ม “ไม้เสือ” ครบ 7 แก้ว ได้เมล็ดล็อตพิเศษกลับบ้านครึ่งกิโล',
      drinks: [
        dr('Tiger Espresso', 'coffee', 'hot', 90, 'ช็อตเข้มจัด ตื่นทันที', ['#3B2418', '#A9733F']),
        dr('Spanish Latte', 'latte', 'iced', 130, 'ลาเต้นมข้นหวาน', ['#D2A468', '#F3E6D2']),
        dr('Nitro Cold Brew', 'coffee', 'iced', 140, 'โคลด์บรูว์ไนโตรเจน เนียนนุ่ม', ['#2A1A12', '#E8D6B8'])],
      spots: [
        sp('ผนังกราฟิกลายเสือ', '09:00–11:00', 4, 4, 'ถ่ายในมุมกว้าง เห็นกราฟิกทั้งผนัง'),
        sp('โซนคั่วหน้าร้าน', '15:00–17:00', 4, 3, 'ภาพบรรยากาศการทำงาน')] },

    { id: 'greenhouse-99', name: 'Greenhouse 99', area: 'บางนา', lat: 13.6680, lon: 100.6050, rating: 4.4, reviews: 1800, repeat: .3, hours: [9, 20],
      palette: ['#1D5C44', '#B6DFA6'],
      attr: { quiet: 3, cozy: 5, bright: 8, nature: 9, urban: 1, dark: 0, photo: 10, coffee: 4, social: 8, work: 2, creative: 4, outdoor: 7, window: 5, small: 1, crowd: 9 },
      tagline: 'สวนเรือนกระจกขนาดใหญ่ มุมถ่ายรูปเพียบ',
      secret: 'สระบัวกลางสวนออกดอกเช้าสุด 08:30 — เปิดร้าน 9:00 แต่ซื้อบัตรเข้าสวนก่อนได้',
      drinks: [
        dr('Garden Party Soda', 'signature', 'iced', 130, 'โซดาดอกไม้กินได้', ['#E8A0C0', '#9CCB8B']),
        dr('Pandan Coconut Latte', 'latte', 'iced', 140, 'ลาเต้ใบเตยกะทิ', ['#8DBB6A', '#F0E8D0']),
        dr('Garden Drip', 'coffee', 'hot', 110, 'ดริปกลิ่นดอกไม้', ['#5B3A22', '#B98A5B'])],
      spots: [
        sp('ทางเดินเรือนกระจก', '09:00–11:00', 5, 5, 'ถ่ายเส้นนำสายตาไปทางประตู'),
        sp('สระบัวกลางสวน', '16:00–17:30', 4, 5, 'ถ่ายสะท้อนน้ำ', true),
        sp('ชิงช้าดอกไม้', '10:00–12:00', 4, 5, 'คิวยาวช่วงสายวันหยุด', true)] },

    { id: 'lamphu-lamp-room', name: 'Lamphu Lamp Room', area: 'เมืองเก่า', lat: 13.7570, lon: 100.5010, rating: 4.8, reviews: 47, repeat: .76, hours: [17, 24],
      palette: ['#34251A', '#D9A441'],
      attr: { quiet: 7, cozy: 9, bright: 2, nature: 2, urban: 5, dark: 8, photo: 7, coffee: 7, social: 5, work: 4, creative: 6, outdoor: 1, window: 3, small: 8, crowd: 2 },
      tagline: 'ห้องโคมไฟในตึกแถวเก่า เปิดเฉพาะช่วงค่ำ',
      secret: 'โคมไฟทุกดวงมีชื่อ — ถ้าเลือกที่นั่งใต้ดวงที่ชอบ เจ้าของจะเล่าประวัติโคมให้ฟัง',
      drinks: [
        dr('Lamp Light Latte', 'latte', 'hot', 140, 'ลาเต้คาราเมลเกลือ ตกแต่งลายโคม', ['#D9A441', '#F3E6D2']),
        dr('Salted Caramel Cortado', 'coffee', 'hot', 130, 'คอร์ตาโดคาราเมลเกลือ', ['#A9733F', '#3B2418']),
        dr('Chrysanthemum Honey Tea', 'tea', 'hot', 100, 'ชาเก๊กฮวยน้ำผึ้ง อุ่น ๆ', ['#E6C85A', '#B58A2A'])],
      spots: [
        sp('โคมกระดาษแขวนเพดาน', '18:30–20:30', 2, 5, 'ถ่ายมองขึ้นให้เห็นโคมหลายดวง'),
        sp('ชั้นลอยไม้สัก', '17:00–18:30', 3, 4, 'แสงอำพันสุดท้ายของวัน')] }
  ];

  const CAFES = RAW.map((c) => {
    DIMS.forEach((d) => { if (c.attr[d] == null) c.attr[d] = 3; });
    c.drinks.forEach((d, i) => { d.id = c.id + ':d' + i; d.cafeId = c.id; });
    c.spots.forEach((s, i) => { s.id = c.id + ':s' + i; s.cafeId = c.id; });
    return c;
  });

  const CAFE_BY_ID = {};
  const DRINK_BY_ID = {};
  const SPOT_BY_ID = {};
  CAFES.forEach((c) => {
    CAFE_BY_ID[c.id] = c;
    c.drinks.forEach((d) => { DRINK_BY_ID[d.id] = d; });
    c.spots.forEach((s) => { SPOT_BY_ID[s.id] = s; });
  });

  // How well a drink type suits each mood (0–1). Missing = 0.5.
  const DRINK_MOOD = {
    relax:    { latte: .9, tea: .9, matcha: .85, coffee: .5, signature: .6 },
    focus:    { coffee: 1, tea: .7, latte: .6, matcha: .7, signature: .3 },
    creative: { signature: 1, matcha: .7, latte: .6, coffee: .6, tea: .5 },
    alone:    { coffee: .7, tea: .8, latte: .7, matcha: .7, signature: .5 },
    social:   { signature: .9, latte: .7, matcha: .6, coffee: .6, tea: .5 },
    cozy:     { latte: 1, tea: .9, matcha: .6, coffee: .6, signature: .6 },
    photo:    { signature: 1, matcha: 1, latte: .7, tea: .5, coffee: .4 },
    coffee:   { coffee: 1, latte: .6, tea: .2, matcha: .2, signature: .4 }
  };

  /* ---------- Gamification ---------- */
  const ACHIEVEMENTS = [
    { id: 'first-sip', name: 'First Sip', desc: 'Check-in คาเฟ่แรกของคุณ', icon: 'coffee', goal: 1 },
    { id: 'rainy', name: 'Rainy Café Hunter', desc: 'Check-in ตอนฝนตก', icon: 'cloud-rain', goal: 1 },
    { id: 'matcha', name: 'Matcha Explorer', desc: 'ลองมัทฉะต่างเมนู 2 แก้ว', icon: 'leaf', goal: 2 },
    { id: 'photographer', name: 'Café Photographer', desc: 'ถ่ายรูปที่ Photo Spot 3 จุด', icon: 'camera', goal: 3 },
    { id: 'hidden', name: 'Hidden Café Hunter', desc: 'ค้นพบ Hidden Café 2 ร้าน', icon: 'gem', goal: 2 },
    { id: 'night', name: 'Night Café Explorer', desc: 'Check-in ยามค่ำ', icon: 'moon', goal: 1 },
    { id: 'bean', name: 'Bean Nerd', desc: 'ลองกาแฟ/ลาเต้ต่างเมนู 4 แก้ว', icon: 'target', goal: 4 },
    { id: 'collector', name: 'Café Collector', desc: 'สะสม stamp ครบ 5 ร้าน', icon: 'stamp', goal: 5 }
  ];
  const LEVELS = [
    { xp: 0, name: 'Newcomer' }, { xp: 100, name: 'Sipper' }, { xp: 250, name: 'Wanderer' },
    { xp: 450, name: 'Regular' }, { xp: 700, name: 'Connoisseur' }, { xp: 1000, name: 'Café Legend' }
  ];

  const OWNER_MOODS = [['calm', 'Calm'], ['music', 'Music'], ['bright', 'Bright'], ['cozy', 'Cozy'], ['event', 'Event'], ['busy', 'Busy']];
  const OWNER_MOOD_MAP = { calm: ['relax', 'alone', 'focus'], music: ['social', 'creative'], bright: ['photo', 'relax'], cozy: ['cozy', 'relax'], event: ['social'], busy: ['social'] };

  CM.data = {
    OWNER_MOODS, OWNER_MOOD_MAP,
    DIMS, DEMO_CENTER, MOODS, MOOD_W, KEYWORDS, BOOST_ADJ, WEATHER_ADJ, QUIZ, ARCHETYPES,
    LIKE_POS, LIKE_NEG, DIM_TH, REASON_HI, REASON_LOW, CAFES, CAFE_BY_ID, DRINK_BY_ID, SPOT_BY_ID,
    DRINK_MOOD, ACHIEVEMENTS, LEVELS,
    MOOD_BY_ID: MOODS.reduce((m, x) => { m[x.id] = x; return m; }, {}),
    ARCHETYPE_BY_ID: ARCHETYPES.reduce((m, x) => { m[x.id] = x; return m; }, {})
  };
})();
